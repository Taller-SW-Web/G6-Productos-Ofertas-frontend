import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { cpus, totalmem } from 'node:os';
import { expect, test, type Browser, type BrowserContext, type Page, type Request } from '@playwright/test';
import { assertSafeEvidenceText } from './evidence-security.mjs';

type MutationResource = {
  product_id: string;
  display_name: string;
  disposable: true;
  registered_by_harness: true;
  mutation_authorized: true;
  initial_catalog_version: number;
  initial_pricing_status: 'REJECTED';
  storage_state_path: string;
  storage_state_sha256: string;
};

type ResourceIndex = { schemaVersion: 1; resources: MutationResource[] };
type RequestFacts = { correlation: string | null; requestBytes: number };
type SessionMetrics = { session_id: string; status: 'PASS' | 'FAIL'; duration_ms: number; http_requests: number; request_bytes: number; response_bytes: number; unknown_response_lengths: number; statuses: Record<string, number>; failed_requests: number; blocked_origins: number; page_errors: number; console_warnings: number; console_errors: number; correlation_observations: number; correlation_verified: boolean };

const docsSha = 'c9e1e5c217616d28229fccf5315fb97a1ae061a9';
const uuid = (value: string | null | undefined) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value ?? '');
const percentile = (values: number[], fraction: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const selected = sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)]!;
  return Number(selected.toFixed(2));
};

async function loadResources(): Promise<ResourceIndex> {
  const bytes = await readFile(resolve(process.env.G6_H5_PERF06_MUTATION_RESOURCE_INDEX!));
  const index = JSON.parse(bytes.toString('utf8')) as ResourceIndex;
  const sessions = Number(process.env.G6_H5_PERF06_PROFILE);
  if (index.schemaVersion !== 1 || !Array.isArray(index.resources) || index.resources.length !== sessions) throw new Error('MUTATION_RESOURCE_INDEX_INVALID');
  const productIds = new Set<string>();
  const identityHashes = new Set<string>();
  for (const resource of index.resources) {
    if (!uuid(resource.product_id) || productIds.has(resource.product_id) || resource.disposable !== true || resource.registered_by_harness !== true || resource.mutation_authorized !== true || !Number.isSafeInteger(resource.initial_catalog_version) || resource.initial_catalog_version < 1 || resource.initial_pricing_status !== 'REJECTED' || !resource.display_name || !/^[a-f0-9]{64}$/i.test(resource.storage_state_sha256)) throw new Error('MUTATION_RESOURCE_NOT_AUTHORIZED');
    const state = await readFile(resource.storage_state_path);
    const stateSha = createHash('sha256').update(state).digest('hex');
    if (stateSha !== resource.storage_state_sha256 || identityHashes.has(stateSha)) throw new Error('MUTATION_IDENTITY_NOT_INDEPENDENT');
    productIds.add(resource.product_id);
    identityHashes.add(stateSha);
  }
  return index;
}

function recordSessionNetwork(page: Page, context: BrowserContext, apiOrigin: string, appOrigin: string) {
  const facts = new Map<Request, RequestFacts>();
  const metrics: Omit<SessionMetrics, 'session_id' | 'status' | 'duration_ms' | 'correlation_verified'> & { correlation_verified: boolean } = {
    http_requests: 0, request_bytes: 0, response_bytes: 0, unknown_response_lengths: 0, statuses: {},
    failed_requests: 0, blocked_origins: 0, page_errors: 0, console_warnings: 0, console_errors: 0, correlation_observations: 0, correlation_verified: true,
  };
  const api = new URL(apiOrigin);
  void context.route('**/*', async route => {
    try {
      const url = new URL(route.request().url());
      if ((url.origin !== appOrigin && url.origin !== api.origin) || url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
        metrics.blocked_origins += 1;
        await route.abort();
        return;
      }
      await route.continue();
    } catch {
      metrics.blocked_origins += 1;
      await route.abort();
    }
  });
  page.on('request', request => {
    if (request.resourceType() === 'document' || request.resourceType() === 'fetch' || request.resourceType() === 'xhr' || request.resourceType() === 'script' || request.resourceType() === 'stylesheet' || request.resourceType() === 'image' || request.resourceType() === 'font') {
      const url = new URL(request.url());
      if (url.origin !== api.origin) return;
      const headers = request.headers();
      const correlation = headers['x-correlation-id'] ?? headers['X-Correlation-Id'] ?? null;
      const requestBytes = request.postDataBuffer()?.byteLength ?? 0;
      facts.set(request, { correlation, requestBytes });
      metrics.http_requests += 1;
      metrics.request_bytes += requestBytes;
    }
  });
  page.on('response', response => {
    try {
      const request = response.request();
      const fact = facts.get(request);
      if (!fact) return;
      const status = response.status();
      metrics.statuses[String(status)] = (metrics.statuses[String(status)] ?? 0) + 1;
      const headers = response.headers();
      const responseCorrelation = headers['x-correlation-id'] ?? null;
      metrics.correlation_observations += 1;
      if ((!fact.correlation && !responseCorrelation) || (fact.correlation && !uuid(fact.correlation)) || (responseCorrelation && !uuid(responseCorrelation)) || (fact.correlation && responseCorrelation && fact.correlation !== responseCorrelation)) metrics.correlation_verified = false;
      const contentLength = Number(headers['content-length']);
      if (Number.isFinite(contentLength) && contentLength >= 0) metrics.response_bytes += contentLength;
      else metrics.unknown_response_lengths += 1;
    } catch { metrics.unknown_response_lengths += 1; }
  });
  page.on('requestfailed', () => { metrics.failed_requests += 1; });
  page.on('pageerror', () => { metrics.page_errors += 1; });
  page.on('console', message => { if (message.type() === 'warning') metrics.console_warnings += 1; if (message.type() === 'error') metrics.console_errors += 1; });
  return metrics;
}

async function requestResponse(page: Page, method: string, pathSuffix: string, action: () => Promise<void>, status: number) {
  const promise = page.waitForResponse(response => response.request().method() === method && new URL(response.url()).pathname.endsWith(pathSuffix));
  await action();
  const response = await promise;
  expect(response.status()).toBe(status);
  return response;
}

async function runMutationJourney(page: Page, resource: MutationResource, sessionStarted: number, network: ReturnType<typeof recordSessionNetwork>): Promise<SessionMetrics> {
  try {
    const listPromise = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/v1/productos/administracion');
    await page.goto('/productos');
    const initialList = await listPromise;
    expect(initialList.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Gestión de productos', exact: true })).toBeVisible();
    const productLink = page.getByRole('link', { name: `Ver detalle de ${resource.display_name}`, exact: true });
    await expect(productLink).toBeVisible();
    await productLink.click();
    await expect(page.getByRole('heading', { name: resource.display_name, exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Editar', exact: true }).click();
    const description = page.getByLabel('Descripción comercial');
    await expect(description).toBeVisible();
    await description.fill(`H5 mutation ${resource.product_id}`);
    const edit = await requestResponse(page, 'PATCH', `/productos/${resource.product_id}`, () => page.getByRole('button', { name: 'Guardar cambios', exact: true }).click(), 200);
    const edited = await edit.json();
    const newVersion = Number(edited.catalog_version ?? edited.catalogVersion);
    expect(newVersion).toBe(resource.initial_catalog_version + 1);
    await expect(page.getByText(`v${newVersion}`, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Ver preparación', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Preparación del producto', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar preparación de Pricing', exact: true })).toBeVisible();
    const admission = await requestResponse(page, 'POST', `/productos/${resource.product_id}/preparacion/reintentar`, () => page.getByRole('button', { name: 'Reintentar preparación de Pricing', exact: true }).click(), 202);
    const admissionBody = await admission.json();
    expect(admissionBody.status).toBe('ACCEPTED');
    expect(uuid(admissionBody.operation_id)).toBe(true);
    expect(uuid(admissionBody.correlation_id)).toBe(true);
    await expect(page.getByText('Solicitud admitida. Consulte la preparación para conocer el resultado final.', { exact: true })).toBeVisible();
    await expect(page.getByText('Precio regular base inicializado correctamente en Pricing. Estado terminal confirmado.', { exact: true })).toBeVisible({ timeout: 90_000 });
    const returnList = await requestResponse(page, 'GET', '/api/v1/productos/administracion', () => page.getByRole('link', { name: 'Productos', exact: true }).first().click(), 200);
    const finalList = await returnList.json();
    const persisted = finalList.items?.find((item: Record<string, unknown>) => item.productId === resource.product_id || item.product_id === resource.product_id);
    expect(Number(persisted?.catalogVersion ?? persisted?.catalog_version)).toBe(newVersion);
    await expect(page.getByRole('link', { name: `Ver detalle de ${resource.display_name}`, exact: true })).toBeVisible();
  } finally {
    // Cleanup is deliberately performed by the owner harness after Playwright has closed all contexts.
  }
  return {
    session_id: `session-${String(resource.product_id).slice(0, 8)}`,
    status: 'PASS',
    duration_ms: Number((performance.now() - sessionStarted).toFixed(2)),
    ...network,
  };
}

test('PERF06_MUTATION L1: sesiones aisladas editan por UI, esperan preparación terminal y verifican listado', async ({ browser }) => {
  const startedAt = new Date().toISOString();
  const appSha = process.env.G6_H5_PERF06_MUTATION_SUBJECT_SHA!;
  const harnessSha = process.env.G6_H5_PERF06_MUTATION_HARNESS_SHA!;
  const datasetBytes = await readFile('tests/fixtures/h5/catalog/manifest.json');
  const datasetSha = createHash('sha256').update(datasetBytes).digest('hex');
  const resources = await loadResources();
  const apiOrigin = new URL(process.env.G6_H5_PERF06_API_ORIGIN!);
  const actualBrowser = browser as Browser;
  const browserVersion = actualBrowser.version();
  const contexts: BrowserContext[] = [];
  const sessionNetworks: ReturnType<typeof recordSessionNetwork>[] = [];
  const sessionStartMarks: number[] = [];
  const metricsPath = resolve(process.env.G6_H5_PERF06_MUTATION_METRICS_PATH ?? 'test-results/h5/perf06-mutation-real-metrics.json');
  let journeyResults: PromiseSettledResult<SessionMetrics>[] = [];
  let startSkewMs = null;
  let activeDurationMs = 0;
  let scenarioStatus: 'PASS' | 'FAIL' = 'FAIL';
  const appOrigin = `http://127.0.0.1:${Number(process.env.G6_H5_PERF06_MUTATION_PORT ?? '5431')}`;
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  try {
    for (const resource of resources.resources) {
      const context = await actualBrowser.newContext({ storageState: resource.storage_state_path, serviceWorkers: 'block', acceptDownloads: false });
      contexts.push(context);
      const page = await context.newPage();
      sessionNetworks.push(recordSessionNetwork(page, context, apiOrigin.origin, appOrigin));
    }
    const gate = { released: false, waiters: [] as Array<() => void> };
    const waitForGate = () => new Promise<void>(resolveGate => { if (gate.released) resolveGate(); else gate.waiters.push(resolveGate); });
    const pages = contexts.map(context => context.pages()[0]!);
    const launch = pages.map(async (page, index) => {
      await waitForGate();
      sessionStartMarks.push(performance.now());
      return runMutationJourney(page, resources.resources[index]!, performance.now(), sessionNetworks[index]!);
    });
    gate.released = true;
    for (const release of gate.waiters) release();
    const allStartedAt = performance.now();
    journeyResults = await Promise.allSettled(launch);
    activeDurationMs = Number((performance.now() - allStartedAt).toFixed(2));
    startSkewMs = sessionStartMarks.length ? Number((Math.max(...sessionStartMarks) - Math.min(...sessionStartMarks)).toFixed(2)) : null;
    scenarioStatus = journeyResults.length === resources.resources.length && journeyResults.every(result => result.status === 'fulfilled' && result.value.status === 'PASS') ? 'PASS' : 'FAIL';
    expect(scenarioStatus).toBe('PASS');
    expect(startSkewMs).not.toBeNull();
    expect(startSkewMs!).toBeLessThanOrEqual(250);
    expect(sessionNetworks.every(item => item.blocked_origins === 0 && item.failed_requests === 0 && item.page_errors === 0 && item.console_errors === 0 && item.correlation_verified)).toBe(true);
  } catch {
    scenarioStatus = 'FAIL';
    throw new Error('PERF06_MUTATION_REAL_SCENARIO_FAILED');
  } finally {
    await Promise.allSettled(contexts.map(context => context.close()));
    const fulfilled = journeyResults.filter((result): result is PromiseFulfilledResult<SessionMetrics> => result.status === 'fulfilled').map(result => result.value);
    const failed = journeyResults.length - fulfilled.length + fulfilled.filter(item => item.status !== 'PASS').length;
    const durations = fulfilled.filter(item => item.status === 'PASS').map(item => item.duration_ms);
    const combinedStatuses = sessionNetworks.reduce((combined, item) => {
      for (const [status, count] of Object.entries(item.statuses)) combined[status] = (combined[status] ?? 0) + count;
      return combined;
    }, {} as Record<string, number>);
    const report = {
      schema_version: 1, case_id: 'PERF06_MUTATION', task_id: 'POM-A05', h5_criterion: 'H5-03',
      repository: 'Taller-SW-Web/G6-Productos-Ofertas-frontend', owner: 'Poma', source_sha: appSha,
      harness_sha: harnessSha, docs_sha: docsSha, timestamp_utc: new Date().toISOString(), started_at_utc: startedAt,
      config_version: 'h5-perf06-mutation-real-v1', evidence_level: 'L1', status: scenarioStatus,
      dataset_seed: 20261123, dataset_checksum: datasetSha,
      tool_versions: { node: process.version, playwright: JSON.parse(await readFile('node_modules/@playwright/test/package.json', 'utf8')).version, chromium: browserVersion },
      environment: { platform: process.platform, architecture: process.arch, cpu_count: cpus().length, memory_bytes: totalmem(), region: 'LOCAL_LOOPBACK', network_scope: 'Vite app and isolated API loopback only', api_origin_sha256: hash(apiOrigin.origin) },
      configuration: { sessions_configured: resources.resources.length, sessions_started: sessionStartMarks.length, start_skew_ms: startSkewMs, active_duration_ms: activeDurationMs, service_workers: 'blocked', cache_mode: 'not a PERF06 cold/warm benchmark', app_origin_sha256: hash(appOrigin) },
      journeys: { started: resources.resources.length, completed: durations.length, failed, cancelled: resources.resources.length - journeyResults.length, throughput_per_second: activeDurationMs ? Number((durations.length / (activeDurationMs / 1000)).toFixed(4)) : null, p50_ms: percentile(durations, 0.5), p95_ms: percentile(durations, 0.95), p99_ms: percentile(durations, 0.99), durations_ms: durations },
      http: { requests: sessionNetworks.reduce((sum, item) => sum + item.http_requests, 0), request_bytes: sessionNetworks.reduce((sum, item) => sum + item.request_bytes, 0), response_bytes: sessionNetworks.reduce((sum, item) => sum + item.response_bytes, 0), unknown_response_lengths: sessionNetworks.reduce((sum, item) => sum + item.unknown_response_lengths, 0), statuses: combinedStatuses, failed_requests: sessionNetworks.reduce((sum, item) => sum + item.failed_requests, 0), blocked_origins: sessionNetworks.reduce((sum, item) => sum + item.blocked_origins, 0), page_errors: sessionNetworks.reduce((sum, item) => sum + item.page_errors, 0), console_warnings: sessionNetworks.reduce((sum, item) => sum + item.console_warnings, 0), console_errors: sessionNetworks.reduce((sum, item) => sum + item.console_errors, 0), correlation_observations: sessionNetworks.reduce((sum, item) => sum + item.correlation_observations, 0), correlation_verified: sessionNetworks.every(item => item.correlation_verified && item.correlation_observations > 0) },
      expected_outcomes: { edit_http_200_and_version_increment: true, preparation_http_202_nonterminal: true, bounded_terminal_polling: true, return_to_list_version: true, cleanup_outside_window: true },
      cleanup: { state: 'DEFERRED_TO_OWNER_HARNESS_FINALLY', registered_disposable_resources: resources.resources.length },
      known_limits: ['isolated integration journey evidence is not a baseline/candidate benchmark', 'no shared or operational infrastructure used'],
    };
    const reportText = `${JSON.stringify(report, null, 2)}\n`;
    assertSafeEvidenceText(reportText);
    await mkdir(dirname(metricsPath), { recursive: true });
    await writeFile(metricsPath, reportText, 'utf8');
  }
});
