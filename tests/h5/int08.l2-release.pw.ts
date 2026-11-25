import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';
import { preflightInt08L2 } from './int08-l2-policy.mjs';

type ApiObservation = {
  method: string;
  status: number;
  category: 'catalog_list' | 'catalog_preparation' | 'catalog_other';
  requestCorrelation: string | null;
  responseCorrelation: string | null;
  productVersion?: number;
};

const docsSha = 'c9e1e5c217616d28229fccf5315fb97a1ae061a9';

async function loadApprovedConfig() {
  const result = await preflightInt08L2(process.env);
  if (result.status !== 'READY_C' || !result.hosts || !result.resourceIndex) throw new Error('INT08_L2_PREFLIGHT_BLOCKED');
  const productId = process.env.G6_H5_INT08_L2_PRODUCT_ID!;
  const product = result.resourceIndex.resources.find((entry: Record<string, unknown>) => entry.product_id === productId);
  if (!product) throw new Error('INT08_L2_DISPOSABLE_PRODUCT_MISSING');
  const allowed = new Set<string>([...result.hosts.preview, ...result.hosts.g7, ...result.hosts.apim]);
  return {
    productId,
    productName: String(product.display_name),
    initialVersion: Number(product.initial_catalog_version),
    approvedHosts: allowed,
    apimHost: new URL(process.env.G6_H5_INT08_L2_APIM_BASE_URL!).hostname,
  };
}

async function guardAndObserve(context: BrowserContext, page: Page, approvedHosts: Set<string>, apimHost: string) {
  const observations: ApiObservation[] = [];
  const blockedRequestCount = { value: 0 };
  const requests = new Map<Request, { method: string; correlation: string | null }>();
  await context.route('**/*', async route => {
    let url: URL;
    try { url = new URL(route.request().url()); } catch { blockedRequestCount.value += 1; await route.abort(); return; }
    if (url.protocol !== 'https:' || !approvedHosts.has(url.hostname.toLowerCase())) {
      blockedRequestCount.value += 1;
      await route.abort();
      return;
    }
    await route.continue();
  });
  page.on('request', request => {
    try {
      const url = new URL(request.url());
      if (url.hostname !== apimHost || !url.pathname.startsWith('/api/v1/')) return;
      const headers = request.headers();
      requests.set(request, { method: request.method(), correlation: headers['x-correlation-id'] ?? headers['X-Correlation-Id'] ?? null });
    } catch { /* Never record malformed or non-APIM URLs. */ }
  });
  page.on('response', async response => {
    try {
      const url = new URL(response.url());
      if (url.hostname !== apimHost || !url.pathname.startsWith('/api/v1/')) return;
      const request = requests.get(response.request());
      const headers = await response.allHeaders();
      const observation: ApiObservation = {
        method: request?.method ?? response.request().method(),
        status: response.status(),
        category: url.pathname === '/api/v1/productos/administracion' ? 'catalog_list' : url.pathname.endsWith('/preparacion') || url.pathname.endsWith('/preparacion/reintentar') ? 'catalog_preparation' : 'catalog_other',
        requestCorrelation: request?.correlation ?? null,
        responseCorrelation: headers['x-correlation-id'] ?? null,
      };
      if (url.pathname === '/api/v1/productos/administracion' && response.status() === 200) {
        const body = await response.json().catch(() => null);
        const product = body?.items?.find((item: Record<string, unknown>) => item.productId === process.env.G6_H5_INT08_L2_PRODUCT_ID || item.product_id === process.env.G6_H5_INT08_L2_PRODUCT_ID);
        if (Number.isSafeInteger(product?.catalogVersion)) observation.productVersion = product.catalogVersion;
        if (Number.isSafeInteger(product?.catalog_version)) observation.productVersion = product.catalog_version;
      }
      observations.push(observation);
    } catch { /* Response bodies and exception text are intentionally discarded. */ }
  });
  return { observations, blockedRequestCount };
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Correo electrónico', exact: true }).fill(email);
  await page.getByRole('textbox', { name: 'Contraseña', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar al panel', exact: true }).click();
  // Remove user-entered values from the rendered DOM before any later assertion
  // can fail and trigger Playwright's diagnostic page snapshot.
  await page.evaluate(() => {
    for (const input of document.querySelectorAll('input')) {
      if (input.type === 'password' || input.type === 'email' || /username|current-password/i.test(input.autocomplete)) input.value = '';
    }
  }).catch(() => undefined);
}

const validCorrelation = (value: string | null | undefined): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value ?? '');

test('INT08-L2-AUTHORIZED: login productivo, lectura Catalog, correlación APIM y preparación terminal', async ({ page, context }) => {
  const config = await loadApprovedConfig();
  const network = await guardAndObserve(context, page, config.approvedHosts, config.apimHost);
  await login(page, process.env.G6_H5_INT08_L2_AUTHORIZED_EMAIL!, process.env.G6_H5_INT08_L2_AUTHORIZED_PASSWORD!);
  await expect(page.getByRole('heading', { name: 'Gestión de productos', exact: true })).toBeVisible({ timeout: 60_000 });
  const listRead = network.observations.find(item => item.category === 'catalog_list' && item.method === 'GET' && item.status === 200);
  expect(listRead).toBeDefined();
  expect(validCorrelation(listRead?.requestCorrelation) || validCorrelation(listRead?.responseCorrelation)).toBe(true);
  expect(listRead?.requestCorrelation && listRead.responseCorrelation ? listRead.requestCorrelation : listRead?.responseCorrelation).toMatch(/^[0-9a-f-]{36}$/i);
  expect(new URL(process.env.G6_H5_INT08_L2_APIM_BASE_URL!).hostname).toBe(config.apimHost);
  await expect(page.getByRole('link', { name: `Ver detalle de ${config.productName}`, exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link', { name: `Ver detalle de ${config.productName}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: config.productName, exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Ver preparación', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Preparación del producto', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar preparación de Pricing', exact: true })).toBeVisible();
  const postResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).hostname === config.apimHost && new URL(response.url()).pathname.endsWith('/preparacion/reintentar'));
  await page.getByRole('button', { name: 'Reintentar preparación de Pricing', exact: true }).click();
  const accepted = await postResponse;
  expect(accepted.status()).toBe(202);
  const admission = await accepted.json();
  expect(admission.status).toBe('ACCEPTED');
  expect(validCorrelation(admission.correlation_id)).toBe(true);
  expect(admission.operation_id).toMatch(/^[0-9a-f-]{36}$/i);
  await expect(page.getByText('Solicitud admitida. Consulte la preparación para conocer el resultado final.', { exact: true })).toBeVisible();
  await expect(page.getByText('Precio regular base inicializado correctamente en Pricing. Estado terminal confirmado.', { exact: true })).toBeVisible({ timeout: 90_000 });
  const listResponsePromise = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).hostname === config.apimHost && new URL(response.url()).pathname === '/api/v1/productos/administracion');
  await page.getByRole('link', { name: 'Productos', exact: true }).first().click();
  const listResponse = await listResponsePromise;
  expect(listResponse.status()).toBe(200);
  const listedCatalog = await listResponse.json();
  const updatedProduct = listedCatalog.items?.find((item: Record<string, unknown>) => item.productId === config.productId || item.product_id === config.productId);
  const listedVersion = Number(updatedProduct?.catalogVersion ?? updatedProduct?.catalog_version);
  expect(listedVersion).toBe(config.initialVersion);
  await expect(page.getByRole('link', { name: `Ver detalle de ${config.productName}`, exact: true })).toBeVisible();
  expect(network.blockedRequestCount.value).toBe(0);
  const apiReads = network.observations.filter(item => item.method === 'GET' && item.status === 200);
  expect(apiReads.length).toBeGreaterThanOrEqual(3);
  expect(apiReads.every(item => validCorrelation(item.requestCorrelation) || validCorrelation(item.responseCorrelation))).toBe(true);
  expect(docsSha).toMatch(/^[0-9a-f]{40}$/);
});

test('INT08-L2-DENIED: login productivo con identidad sin permisos termina en HTTP 403 y no lista productos', async ({ page, context }) => {
  const config = await loadApprovedConfig();
  const network = await guardAndObserve(context, page, config.approvedHosts, config.apimHost);
  await login(page, process.env.G6_H5_INT08_L2_DENIED_EMAIL!, process.env.G6_H5_INT08_L2_DENIED_PASSWORD!);
  await expect(page.getByRole('heading', { name: 'Acceso denegado', exact: true }).or(page.getByText(/403, SCOPE_INSUFICIENTE/))).toBeVisible({ timeout: 60_000 });
  const deniedRead = network.observations.find(item => item.category === 'catalog_list' && item.method === 'GET' && item.status === 403);
  expect(deniedRead).toBeDefined();
  expect(validCorrelation(deniedRead?.requestCorrelation) || validCorrelation(deniedRead?.responseCorrelation)).toBe(true);
  await expect(page.getByRole('link', { name: `Ver detalle de ${config.productName}`, exact: true })).toHaveCount(0);
  expect(network.blockedRequestCount.value).toBe(0);
});
