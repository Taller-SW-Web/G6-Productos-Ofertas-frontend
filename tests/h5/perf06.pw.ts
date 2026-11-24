import { chromium, expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { cpus, totalmem, platform } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertSafeEvidenceText } from "./evidence-security.mjs";
import { evaluatePerf06Run, parsePerf06Run, percentile } from "./perf06-policy.mjs";
import { startLoopbackOnlyProxy } from "./loopback-only-proxy.mjs";

type Manifest = {
  dataset_id: string;
  products: Array<{ eligible: boolean; product_id: string; sku_base: string; variants: Array<{ variant_id: string; sku: string; eligible: boolean }> }>;
  expected: { product_ids: string[] };
};

type BrowserObservation = { cacheHits: number; serviceWorkerHits: number; cacheHitRequestIds: Set<string> };
type Session = { id: string; context: BrowserContext; page: Page; observed: BrowserObservation; currentRoute: JourneyKey | null; firstNavigationRecorded: boolean };
type JourneyKey = "admin-entry" | "catalog-navigation" | "catalog-list" | "catalog-filter" | "product-detail" | "edit-screen" | "preparation-status-read" | "return-list";
type RouteHttpMetrics = { requests: number; requestBodyBytes: number; responseBodyBytes: number; transferredBytes: number; errors: number; cancelled: number };

test("PERF06: sesiones activas concurrentes sobre recorrido Catalog administrativo", async ({ baseURL }) => {
  test.setTimeout(420_000);
  const sessions: Session[] = [];
  let isolatedBrowser: Browser | undefined;
  let egressProxy: Awaited<ReturnType<typeof startLoopbackOnlyProxy>> | undefined;
  try {
  const config = parsePerf06Run(process.env);
  const requiredEnv = [
    "G6_H5_PERF06_STORAGE_STATE_DIR",
    "G6_H5_PERF06_IDENTITY_INDEX",
    "G6_H5_PERF06_API_ORIGIN",
    "G6_H5_PERF06_IDENTITY_LABEL",
    "G6_H5_PERF06_NETWORK_PROFILE",
  ];
  if (process.env.G6_H5_PERF06_CACHE_MODE === "cold") requiredEnv.push("G6_H5_PERF06_COLD_ORACLE");
  for (const name of requiredEnv) if (!process.env[name]) throw new Error(`PERF06_${name}_REQUIRED`);
  expect(process.env.G6_H5_PERF06_READ_ONLY_ATTESTATION).toBe("1");
  expect(process.env.G6_H5_PERF06_IDENTITY_LABEL).toBe("POMA_H5_SYNTHETIC_READONLY");

  const apiOrigin = new URL(process.env.G6_H5_PERF06_API_ORIGIN!);
  if (apiOrigin.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(apiOrigin.hostname))
    throw new Error("PERF06_API_ORIGIN_NOT_LOOPBACK");
  if (process.env.G6_H5_PERF06_ISOLATED_HARNESS !== "1") throw new Error("PERF06_ISOLATED_HARNESS_REQUIRED");
  const appOrigin = new URL(baseURL!).origin;
  egressProxy = await startLoopbackOnlyProxy([appOrigin, apiOrigin.origin]);
  isolatedBrowser = await chromium.launch({
    headless: true,
    proxy: { server: egressProxy.url, bypass: "" },
    args: ["--proxy-bypass-list=<-loopback>"],
  });

  const manifestBytes = await readFile("tests/fixtures/h5/catalog/manifest.json");
  const manifestSha = createHash("sha256").update(manifestBytes).digest("hex");
  if (manifestSha !== process.env.G6_H5_PERF06_DATASET_SHA) throw new Error("PERF06_DATASET_SHA_MISMATCH");
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as Manifest;
  const product = manifest.products.find(item => item.eligible && item.variants.some(variant => variant.eligible));
  if (!product) throw new Error("PERF06_ELIGIBLE_VARIANT_FIXTURE_MISSING");

  const storageDirectory = resolve(process.env.G6_H5_PERF06_STORAGE_STATE_DIR!);
  const identityIndex = JSON.parse(await readFile(resolve(process.env.G6_H5_PERF06_IDENTITY_INDEX!), "utf8")) as {
    sessions?: Array<{ session_id: string; identity_alias: string; authorization: string; storage_state_sha256: string }>;
  };
  if (!Array.isArray(identityIndex.sessions)) throw new Error("PERF06_IDENTITY_INDEX_INVALID");
  const aliases = new Set<string>();
  const stateHashes = new Set<string>();
  const journeyDurations: number[] = [];
  const routeDurations: Record<JourneyKey, number[]> = {
    "admin-entry": [], "catalog-navigation": [], "catalog-list": [], "catalog-filter": [], "product-detail": [], "edit-screen": [], "preparation-status-read": [], "return-list": [],
  };
  const httpStatuses: Record<string, number> = {};
  const activeRequests = new Set<object>();
  let requests = 0;
  let requestBodyBytes = 0;
  let responseBodyBytes = 0;
  let unknownResponseBodyBytes = 0;
  let unexpectedHttpResponses = 0;
  let failedRequests = 0;
  let pageErrors = 0;
  let unexpectedOrigins = 0;
  let journeysStarted = 0;
  let journeysCompleted = 0;
  let journeysFailed = 0;
  let journeysCancelled = 0;
  let cancelledRequests = 0;
  let transferredBytes = 0;
  let transferredResources = 0;
  let unknownTransferredResources = 0;
  let measuring = false;
  const routeHttp: Record<JourneyKey, RouteHttpMetrics> = {
    "admin-entry": { requests: 0, requestBodyBytes: 0, responseBodyBytes: 0, transferredBytes: 0, errors: 0, cancelled: 0 },
    "catalog-navigation": { requests: 0, requestBodyBytes: 0, responseBodyBytes: 0, transferredBytes: 0, errors: 0, cancelled: 0 },
    "catalog-list": { requests: 0, requestBodyBytes: 0, responseBodyBytes: 0, transferredBytes: 0, errors: 0, cancelled: 0 },
    "catalog-filter": { requests: 0, requestBodyBytes: 0, responseBodyBytes: 0, transferredBytes: 0, errors: 0, cancelled: 0 },
    "product-detail": { requests: 0, requestBodyBytes: 0, responseBodyBytes: 0, transferredBytes: 0, errors: 0, cancelled: 0 },
    "edit-screen": { requests: 0, requestBodyBytes: 0, responseBodyBytes: 0, transferredBytes: 0, errors: 0, cancelled: 0 },
    "preparation-status-read": { requests: 0, requestBodyBytes: 0, responseBodyBytes: 0, transferredBytes: 0, errors: 0, cancelled: 0 },
    "return-list": { requests: 0, requestBodyBytes: 0, responseBodyBytes: 0, transferredBytes: 0, errors: 0, cancelled: 0 },
  };
  const requestRoutes = new WeakMap<object, JourneyKey>();
  const sessionStartedAt: number[] = [];
  const startedSessionIds = new Set<string>();
  const activeSessionIds = new Set<string>();
  const sessionStartById = new Map<string, number>();
  const sessionFinishById = new Map<string, number>();
  let maxActiveSessions = 0;

  for (let index = 1; index <= config.sessions; index += 1) {
    const sessionId = `session-${String(index).padStart(3, "0")}`;
    const statePath = resolve(storageDirectory, `${sessionId}.json`);
    const stateBytes = await readFile(statePath);
    const stateSha = createHash("sha256").update(stateBytes).digest("hex");
    const identity = identityIndex.sessions.find(item => item.session_id === sessionId);
    if (!identity || identity.storage_state_sha256 !== stateSha || identity.authorization !== "catalog-read" || !/^POMA_H5_USER_[0-9]{3}$/.test(identity.identity_alias))
      throw new Error("PERF06_IDENTITY_INDEX_MISMATCH");
    if (aliases.has(identity.identity_alias) || stateHashes.has(stateSha)) throw new Error("PERF06_USERS_NOT_INDEPENDENT");
    aliases.add(identity.identity_alias);
    stateHashes.add(stateSha);
    const storageState = JSON.parse(stateBytes.toString("utf8")) as { origins?: unknown[]; cookies?: unknown[] };
    if (!(storageState.origins?.length || storageState.cookies?.length)) throw new Error("PERF06_STORAGE_STATE_EMPTY");
    const context = await isolatedBrowser!.newContext({
      storageState: statePath,
      viewport: { width: 1440, height: 900 },
      locale: "es-PE",
    });
    const page = await context.newPage();
    const observed: BrowserObservation = { cacheHits: 0, serviceWorkerHits: 0, cacheHitRequestIds: new Set() };
    const session: Session = { id: sessionId, context, page, observed, currentRoute: null, firstNavigationRecorded: false };
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    const cdpRequestRoutes = new Map<string, JourneyKey | null>();
    cdp.on("Network.requestWillBeSent", (event: { requestId: string; request: { url: string } }) => {
      if (!measuring) return;
      let requestOrigin = "";
      try { requestOrigin = new URL(event.request.url).origin; } catch { unexpectedOrigins += 1; }
      if (requestOrigin && ![appOrigin, apiOrigin.origin].includes(requestOrigin)) unexpectedOrigins += 1;
      cdpRequestRoutes.set(event.requestId, session.currentRoute);
    });
    cdp.on("Network.loadingFinished", (event: { requestId: string; encodedDataLength: number }) => {
      if (!measuring) return;
      if (!Number.isFinite(event.encodedDataLength) || event.encodedDataLength < 0) {
        unknownTransferredResources += 1;
        return;
      }
      transferredBytes += event.encodedDataLength;
      transferredResources += 1;
      const route = cdpRequestRoutes.get(event.requestId);
      if (route) routeHttp[route].transferredBytes += event.encodedDataLength;
    });
    cdp.on("Network.responseReceived", (event: { requestId: string; response: { fromDiskCache?: boolean; fromServiceWorker?: boolean } }) => {
      if (!measuring) return;
      if (event.response.fromDiskCache) observed.cacheHitRequestIds.add(event.requestId);
      if (event.response.fromServiceWorker) {
        observed.cacheHitRequestIds.add(event.requestId);
        observed.serviceWorkerHits += 1;
      }
    });
    cdp.on("Network.requestServedFromCache", (event: { requestId: string }) => { if (measuring) observed.cacheHitRequestIds.add(event.requestId); });
    if (config.cacheMode === "cold") await cdp.send("Network.clearBrowserCache");

    page.on("request", request => {
      if (!measuring) return;
      if (request.isNavigationRequest() && !session.firstNavigationRecorded) {
        session.firstNavigationRecorded = true;
        const navigationStartedAt = performance.now();
        sessionStartedAt.push(navigationStartedAt);
        sessionStartById.set(session.id, navigationStartedAt);
        activeSessionIds.add(session.id);
        startedSessionIds.add(session.id);
        maxActiveSessions = Math.max(maxActiveSessions, activeSessionIds.size);
      }
      requests += 1;
      activeRequests.add(request);
      const bodyBytes = request.postDataBuffer()?.byteLength ?? 0;
      requestBodyBytes += bodyBytes;
      if (session.currentRoute) {
        const currentRoute = session.currentRoute;
        requestRoutes.set(request, currentRoute);
        routeHttp[currentRoute].requests += 1;
        routeHttp[currentRoute].requestBodyBytes += bodyBytes;
      }
    });
    page.on("response", response => {
      if (!measuring) return;
      const status = response.status();
      httpStatuses[String(status)] = (httpStatuses[String(status)] ?? 0) + 1;
      const contentLength = Number(response.headers()["content-length"]);
      const route = requestRoutes.get(response.request());
      if (Number.isSafeInteger(contentLength) && contentLength >= 0) {
        responseBodyBytes += contentLength;
        if (route) routeHttp[route].responseBodyBytes += contentLength;
      }
      else unknownResponseBodyBytes += 1;
      if ((status < 200 || status >= 300) && status !== 304) {
        unexpectedHttpResponses += 1;
        if (route) routeHttp[route].errors += 1;
      }
    });
    page.on("requestfailed", request => {
      if (measuring) {
        activeRequests.delete(request);
        const route = requestRoutes.get(request);
        const failure = request.failure()?.errorText ?? "";
        if (failure.includes("ERR_ABORTED")) {
          cancelledRequests += 1;
          if (route) routeHttp[route].cancelled += 1;
        } else {
          failedRequests += 1;
          if (route) routeHttp[route].errors += 1;
        }
      }
    });
    page.on("requestfinished", request => { activeRequests.delete(request); });
    page.on("pageerror", () => { if (measuring) pageErrors += 1; });
    sessions.push(session);
  }

  const recordStage = async (session: Session, key: JourneyKey, deadline: number | null, action: () => Promise<void>) => {
    const startedAt = performance.now();
    session.currentRoute = key;
    try {
      await action();
      if (measuring) routeDurations[key].push(performance.now() - startedAt);
    } finally {
      session.currentRoute = null;
    }
    if (deadline !== null && deadline - performance.now() <= 25) throw new Error("PERF06_WINDOW_ENDED_DURING_JOURNEY");
  };
  const runJourney = async (session: Session, deadline: number | null) => {
    const page = session.page;
    const remainingTimeout = () => deadline === null ? 30_000 : Math.max(100, Math.floor(deadline - performance.now()));
    await recordStage(session, "admin-entry", deadline, async () => {
      const response = await page.goto(new URL("/precios", appOrigin).toString(), { waitUntil: "domcontentloaded", timeout: remainingTimeout() });
      if (!response || (response.status() < 200 || response.status() >= 300) && response.status() !== 304) throw new Error("PERF06_ADMIN_ENTRY_HTTP_FAILED");
      await expect(page.getByRole("heading", { level: 1, name: "Gestión de precios" })).toBeVisible({ timeout: remainingTimeout() });
      await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible({ timeout: remainingTimeout() });
    });
    await recordStage(session, "catalog-navigation", deadline, async () => {
      await page.getByRole("link", { name: "Gestión de productos", exact: true }).click({ timeout: remainingTimeout() });
      await page.waitForURL(url => url.pathname === "/productos", { timeout: remainingTimeout() });
      await expect(page.getByRole("heading", { level: 1, name: "Gestión de productos" })).toBeVisible({ timeout: remainingTimeout() });
    });
    await recordStage(session, "catalog-list", deadline, async () => {
      await expect(page.getByRole("heading", { level: 1, name: "Gestión de productos" })).toBeVisible({ timeout: remainingTimeout() });
      await expect(page.getByRole("textbox", { name: "Búsqueda" })).toBeVisible({ timeout: remainingTimeout() });
    });
    await recordStage(session, "catalog-filter", deadline, async () => {
      await page.getByRole("textbox", { name: "Búsqueda" }).fill(product.sku_base, { timeout: remainingTimeout() });
      await expect(page.getByRole("row").filter({ hasText: product.sku_base })).toBeVisible({ timeout: remainingTimeout() });
    });
    const productRow = page.getByRole("row").filter({ hasText: product.sku_base });
    await recordStage(session, "product-detail", deadline, async () => {
      await expect(productRow.getByRole("link", { name: /^Ver detalle de / })).toBeVisible({ timeout: remainingTimeout() });
      await productRow.getByRole("link", { name: /^Ver detalle de / }).click({ timeout: remainingTimeout() });
      await page.waitForURL(url => url.pathname === `/productos/${product.product_id}`, { timeout: remainingTimeout() });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: remainingTimeout() });
      await expect(page.getByText(`SKU Base: ${product.sku_base}`, { exact: false })).toBeVisible({ timeout: remainingTimeout() });
      await expect(page.getByRole("button", { name: "Ver preparación", exact: true })).toBeVisible({ timeout: remainingTimeout() });
    });
    await recordStage(session, "edit-screen", deadline, async () => {
      await page.getByRole("link", { name: "Editar", exact: true }).click({ timeout: remainingTimeout() });
      await page.waitForURL(url => url.pathname === `/productos/${product.product_id}/editar`, { timeout: remainingTimeout() });
      await expect(page.getByRole("heading", { level: 1, name: /^Editar:/ })).toBeVisible({ timeout: remainingTimeout() });
      await expect(page.getByLabel("Descripción comercial")).toBeVisible({ timeout: remainingTimeout() });
      await page.getByRole("button", { name: "Cancelar", exact: true }).click({ timeout: remainingTimeout() });
      await page.waitForURL(url => url.pathname === `/productos/${product.product_id}`, { timeout: remainingTimeout() });
    });
    await recordStage(session, "preparation-status-read", deadline, async () => {
      await page.getByRole("button", { name: "Ver preparación", exact: true }).click({ timeout: remainingTimeout() });
      await page.waitForURL(url => url.pathname === `/productos/${product.product_id}/preparacion`, { timeout: remainingTimeout() });
      await expect(page.getByRole("heading", { level: 1, name: "Preparación del producto" })).toBeVisible({ timeout: remainingTimeout() });
      await expect(page.getByText("Pricing", { exact: false }).first()).toBeVisible({ timeout: remainingTimeout() });
      await expect(page.getByText("Inventario", { exact: false }).first()).toBeVisible({ timeout: remainingTimeout() });
    });
    await recordStage(session, "return-list", deadline, async () => {
      await page.getByRole("link", { name: "Productos", exact: true }).last().click({ timeout: remainingTimeout() });
      await page.waitForURL(url => url.pathname === "/productos", { timeout: remainingTimeout() });
      await expect(page.getByRole("heading", { level: 1, name: "Gestión de productos" })).toBeVisible({ timeout: remainingTimeout() });
      await expect(page.getByRole("row").filter({ hasText: product.sku_base })).toBeVisible({ timeout: remainingTimeout() });
    });
  };

  if (config.cacheMode === "warm") {
    for (const session of sessions) await runJourney(session, null);
  }

  let resolveBarrier!: () => void;
  const barrier = new Promise<void>(resolvePromise => { resolveBarrier = resolvePromise; });
  const startAt = performance.now();
  const deadline = startAt + config.durationSeconds * 1000;
  measuring = true;
  const executions = sessions.map(async session => {
    await barrier;
    try {
      while (performance.now() < deadline) {
        journeysStarted += 1;
        const journeyStart = performance.now();
        if (deadline - performance.now() <= 25) {
          journeysCancelled += 1;
          break;
        }
        try {
          await runJourney(session, deadline);
          journeysCompleted += 1;
          journeyDurations.push(performance.now() - journeyStart);
        } catch {
          if (performance.now() >= deadline - 25) journeysCancelled += 1;
          else journeysFailed += 1;
        }
      }
    } finally {
      activeSessionIds.delete(session.id);
      if (sessionStartById.has(session.id)) sessionFinishById.set(session.id, performance.now());
    }
  });
  resolveBarrier();
  await Promise.all(executions);
  const elapsedSeconds = (performance.now() - startAt) / 1000;
  const inFlightRequestsAtEnd = activeRequests.size;
  for (const request of activeRequests) {
    const route = requestRoutes.get(request);
    if (route) routeHttp[route].cancelled += 1;
  }
  cancelledRequests += inFlightRequestsAtEnd;
  measuring = false;

  for (const session of sessions) session.observed.cacheHits = session.observed.cacheHitRequestIds.size;
  const cacheHits = sessions.reduce((total, session) => total + session.observed.cacheHits, 0);
  const serviceWorkerHits = sessions.reduce((total, session) => total + session.observed.serviceWorkerHits, 0);
  const proxyStats = egressProxy!.stats();
  unexpectedOrigins += proxyStats.deniedRequests;
  const coldOracle = config.cacheMode === "cold" ? process.env.G6_H5_PERF06_COLD_ORACLE_PATH_SHA256 ?? "SERVICE_CACHE_ATTESTATION_REQUIRED" : "NOT_APPLICABLE_WARM";
  const coldOracleVerified = config.cacheMode === "cold" && process.env.G6_H5_PERF06_COLD_ORACLE_VERIFIED === "1" && cacheHits === 0 && serviceWorkerHits === 0;
  const unexpectedErrors = unexpectedHttpResponses + failedRequests + pageErrors + proxyStats.upstreamFailures;
  const startSkewMs = sessionStartedAt.length ? Number((Math.max(...sessionStartedAt) - Math.min(...sessionStartedAt)).toFixed(2)) : null;
  const minimumActiveSessionMs = sessionStartedAt.length
    ? Number(Math.min(...sessions.map(session => (sessionFinishById.get(session.id) ?? sessionStartById.get(session.id) ?? startAt) - (sessionStartById.get(session.id) ?? startAt))).toFixed(2))
    : 0;
  const appRoot = resolve(process.env.G6_H5_PERF06_APP_ROOT!);
  const subjectLockfileSha = createHash("sha256").update(await readFile(resolve(appRoot, "package-lock.json"))).digest("hex");
  const apiOriginSha256 = createHash("sha256").update(apiOrigin.origin).digest("hex");
  const evaluation = evaluatePerf06Run({
    cacheMode: config.cacheMode,
    cacheHits,
    serviceWorkerHits,
    coldOracleVerified,
    requestCount: requests,
    unexpectedErrors,
    unexpectedOrigins,
    startSkewMs,
    minimumActiveSessionMs,
    requiredDurationMs: config.durationSeconds * 1000,
    configuredSessions: config.sessions,
    sessionsStarted: startedSessionIds.size,
    maxSessionsActive: maxActiveSessions,
    failedJourneys: journeysFailed,
    completedJourneys: journeysCompleted,
  });
  const report = {
    schemaVersion: 1,
    runLabel: `POMA-H5-PERF06-${config.subjectRole}-${config.sessions}VU-r${config.repetition}-${config.cacheMode}`,
    family: "Catalog",
    subjectRole: config.subjectRole,
    subjectSha: process.env.G6_H5_PERF06_SUBJECT_SHA,
    subjectLockfileSha,
    apiOriginSha256,
    harnessSha: process.env.G6_H5_PERF06_HARNESS_SHA,
    serviceSha: process.env.G6_H5_PERF06_SERVICE_SHA,
    datasetSha: manifestSha,
    datasetProducts: manifest.expected.product_ids.length,
    profile: `${config.sessions}VU-${config.durationSeconds}s`,
    sessionsConfigured: config.sessions,
    sessionsStarted: sessionStartedAt.length,
    actualBrowserSessionsStarted: startedSessionIds.size,
    maxSessionsActive: maxActiveSessions,
    sessionConcurrencyValid: evaluation.sessionConcurrencyValid,
    journeyOutcomeValid: evaluation.journeyOutcomeValid,
    minimumActiveSessionMs,
    startSkewMs,
    repetition: config.repetition,
    cacheMode: config.cacheMode,
    cacheEvidence: { hits: cacheHits, serviceWorkerHits, coldOracleSha256: coldOracle, status: evaluation.cacheValid ? "VERIFIED" : "INCONCLUSIVE", authenticationPremeasurement: "no_login_navigation_performed" },
    durationSeconds: config.durationSeconds,
    elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
    journeyDenominators: {
      started: journeysStarted,
      completed: journeysCompleted,
      failed: journeysFailed,
      cancelled: journeysCancelled,
      completedPercent: journeysStarted ? Number((journeysCompleted / journeysStarted * 100).toFixed(2)) : 0,
      failedPercent: journeysStarted ? Number((journeysFailed / journeysStarted * 100).toFixed(2)) : 0,
      cancelledPercent: journeysStarted ? Number((journeysCancelled / journeysStarted * 100).toFixed(2)) : 0,
    },
    journeys: {
      started: journeysStarted,
      completed: journeysCompleted,
      failed: journeysFailed,
      cancelled: journeysCancelled,
      throughputPerSecond: Number((journeysCompleted / elapsedSeconds).toFixed(4)),
      p50Ms: percentile(journeyDurations, 0.5),
      p95Ms: percentile(journeyDurations, 0.95),
      p99Ms: percentile(journeyDurations, 0.99),
    },
    routeHttp,
    mutationOperations: { editSaved: false, preparationRequested: false, explanation: "read-only benchmark visits the edit and preparation-status screens; it does not save an edit or issue a preparation operation" },
    routeDurationsMs: Object.fromEntries(Object.entries(routeDurations).map(([key, values]) => [key, { count: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95), p99: percentile(values, 0.99) }])),
    http: {
      requests,
      requestsPerSecond: Number((requests / elapsedSeconds).toFixed(3)),
      requestBodyBytes,
      responseBodyBytes,
      transferredBytes,
      transferredResources,
      unknownTransferredResources,
      responseBodyBytesSource: "content-length-when-present",
      unknownResponseBodyLengths: unknownResponseBodyBytes,
      statuses: httpStatuses,
      unexpectedHttpResponses,
      failedRequests,
      cancelledRequests,
      unexpectedErrors,
      unexpectedErrorPercent: requests === 0 ? 100 : Number((unexpectedErrors / requests * 100).toFixed(4)),
      unexpectedOrigins,
      blockedExternalOriginRequests: proxyStats.deniedRequests,
      proxyUpstreamFailures: proxyStats.upstreamFailures,
      pageErrors,
    },
    environment: {
      browser: `Chromium ${isolatedBrowser!.version()}`,
      nodeVersion: process.version,
      os: platform(),
      cpuCount: cpus().length,
      memoryBytes: totalmem(),
      networkProfile: process.env.G6_H5_PERF06_NETWORK_PROFILE,
      region: "LOCAL_LOOPBACK",
      serviceSha: process.env.G6_H5_PERF06_SERVICE_SHA,
      identityLabel: "POMA_H5_SYNTHETIC_READONLY",
      identityCount: aliases.size,
      authorizationClass: "catalog-read",
      readOnly: true,
    },
    status: evaluation.status,
    evidence: {
      caseId: "PERF06",
      h5Criterion: "POM-A05",
      repository: "Taller-SW-Web/G6-Productos-Ofertas-frontend",
      owner: "Poma",
      sourceSha: process.env.G6_H5_PERF06_SUBJECT_SHA,
      docsSha: "40524e96c6973f84d74160076781702fe2a3da19",
      timestampUtc: new Date().toISOString(),
      configuration: {
        profile: `${config.sessions}VU-${config.durationSeconds}s`,
        repetition: config.repetition,
        cacheMode: config.cacheMode,
        datasetSeed: 20261123,
        datasetSha: manifestSha,
        harnessSha: process.env.G6_H5_PERF06_HARNESS_SHA,
        serviceSha: process.env.G6_H5_PERF06_SERVICE_SHA,
        subjectLockfileSha,
        networkProfile: process.env.G6_H5_PERF06_NETWORK_PROFILE,
      },
      versions: { browser: `Chromium ${isolatedBrowser!.version()}`, node: process.version },
      command: "node scripts/run-h5-perf06.mjs",
      evidenceLevel: "L1",
      expected: { completedJourneys: "at-least-one-per-session", unexpectedErrorPercent: "<1", writes: 0 },
      observed: { status: evaluation.status, completed: journeysCompleted, failed: journeysFailed, cancelled: journeysCancelled, requests, transferredBytes },
      negativeCases: ["external-origin-blocked-by-loopback-proxy", "no-save-or-preparation-write"],
      limitations: ["read-only screens only; no edit save or preparation operation", "no release or shared infrastructure used"],
      blockerOwner: evaluation.status === "INCONCLUSIVE" ? "Vera or isolated-service owner" : null,
    },
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  assertSafeEvidenceText(serialized);
  const reportPath = resolve(
    "test-results/h5/perf06",
    `${process.env.G6_H5_PERF06_SUBJECT_SHA}-${config.subjectRole}-${config.sessions}VU-${config.durationSeconds}s-r${config.repetition}-${config.cacheMode}.json`,
  );
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, serialized, "utf8");
  expect(journeysCompleted + journeysFailed + journeysCancelled).toBe(journeysStarted);
  } finally {
    await Promise.allSettled(sessions.map(session => session.context.close()));
    await isolatedBrowser?.close();
    await egressProxy?.close();
  }
});
