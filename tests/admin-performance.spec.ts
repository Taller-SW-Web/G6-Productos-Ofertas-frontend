import { expect, test, type Page, type Request, type Response } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

type HttpSample = {
  method: string;
  path: string;
  status: number;
  requestBodyBytes: number;
  responseBodyBytes: number;
  durationMs: number;
  failed?: string;
};

type TraceRequest = {
  method: string;
  path: string;
  requestBodyBytes: number;
  status?: number;
  responseBodyBytes?: number;
  durationMs?: number;
  failed?: string;
};

const routes = [
  { family: "Combos", path: "/combos", kind: "list" },
  { family: "Combos", path: "/combos/nuevo", kind: "form" },
  { family: "Combos", path: "/combos/combo-001", kind: "detail" },
  { family: "Combos", path: "/combos/combo-001/no-disponible", kind: "unavailable-detail" },
  { family: "Combos", path: "/combos/combo-001/editar", kind: "edit" },
  { family: "Catalog", path: "/productos", kind: "list" },
  { family: "Catalog", path: "/productos/nuevo", kind: "form" },
  { family: "Catalog", path: "/productos/product-001", kind: "detail" },
  { family: "Catalog", path: "/productos/product-001/editar", kind: "edit" },
  { family: "Catalog", path: "/productos/product-001/variantes", kind: "variants" },
  { family: "Catalog", path: "/productos/product-001/variantes/nueva", kind: "variant-create" },
  { family: "Catalog", path: "/productos/product-001/variantes/variant-001", kind: "variant-detail" },
  { family: "Catalog", path: "/productos/product-001/preparacion", kind: "product-preparation" },
  { family: "Catalog", path: "/productos/product-001/activar", kind: "product-state" },
  { family: "Catalog", path: "/productos/product-001/desactivar", kind: "product-state" },
  { family: "Catalog", path: "/productos/product-001/variantes/variant-001/editar", kind: "variant-edit" },
  { family: "Catalog", path: "/productos/product-001/variantes/variant-001/preparacion", kind: "variant-preparation" },
  { family: "Pricing", path: "/precios", kind: "list" },
  { family: "Pricing", path: "/precios/editar", kind: "form" },
  { family: "Pricing", path: "/precios/programaciones", kind: "schedule" },
  { family: "Pricing", path: "/precios/importar", kind: "import" },
  { family: "Pricing", path: "/precios/historico", kind: "history" },
  { family: "Pricing", path: "/precios/importaciones/batch-001", kind: "import-result" },
  { family: "Price Audit", path: "/precios/auditoria", kind: "list" },
  { family: "Price Audit", path: "/precios/auditoria/asientos/audit-001", kind: "detail" },
  { family: "Price Audit", path: "/precios/auditoria/exportar/csv", kind: "export" },
  { family: "Price Audit", path: "/precios/auditoria/exportar/pdf", kind: "export" },
  { family: "Categories", path: "/categorias", kind: "tree" },
  { family: "Categories", path: "/categorias/nueva", kind: "form" },
  { family: "Categories", path: "/categorias/confirmar-slug", kind: "slug-confirmation" },
  { family: "Categories", path: "/categorias/cat-001", kind: "detail" },
  { family: "Categories", path: "/categorias/cat-001/editar", kind: "edit" },
  { family: "Categories", path: "/categorias/cat-001/desactivar", kind: "state" },
  { family: "Categories", path: "/categorias/cat-001/reactivar", kind: "state" },
  { family: "Characteristics", path: "/caracteristicas", kind: "list" },
  { family: "Characteristics", path: "/caracteristicas/nueva", kind: "form" },
  { family: "Characteristics", path: "/caracteristicas/char-001", kind: "detail" },
  { family: "Characteristics", path: "/caracteristicas/char-001/valores", kind: "values" },
  { family: "Characteristics", path: "/caracteristicas/char-001/editar", kind: "edit" },
  { family: "Characteristics", path: "/caracteristicas/char-001/estado", kind: "state" },
  { family: "Product Types", path: "/tipos-producto", kind: "list" },
  { family: "Product Types", path: "/tipos-producto/type-001/esquema", kind: "schema" },
  { family: "Product Types", path: "/tipos-producto/nuevo", kind: "form" },
  { family: "Product Types", path: "/tipos-producto/type-001", kind: "detail" },
  { family: "Product Types", path: "/tipos-producto/type-001/asociar", kind: "associate" },
  { family: "Brands", path: "/marcas", kind: "list" },
  { family: "Brands", path: "/marcas/brand-001/editar", kind: "edit" },
  { family: "Brands", path: "/marcas/nueva", kind: "form" },
  { family: "Brands", path: "/marcas/brand-001", kind: "detail" },
  { family: "SEO", path: "/seo", kind: "list" },
  { family: "SEO", path: "/seo/seo-001", kind: "detail" },
  { family: "Recommendations", path: "/recomendaciones", kind: "list" },
  { family: "Recommendations", path: "/recomendaciones/nueva/venta-cruzada", kind: "form" },
  { family: "Recommendations", path: "/recomendaciones/nueva/upselling", kind: "form" },
  { family: "Recommendations", path: "/recomendaciones/nueva/upselling/productos", kind: "selector" },
  { family: "Recommendations", path: "/recomendaciones/rule-001/editar", kind: "edit" },
  { family: "Recommendations", path: "/recomendaciones/rule-001/editar/productos", kind: "selector" },
  { family: "Recommendations", path: "/recomendaciones/rule-001", kind: "detail" },
  { family: "Recommendations", path: "/recomendaciones/rule-001/estado", kind: "state" },
  { family: "Campaigns", path: "/promociones", kind: "list" },
  { family: "Campaigns", path: "/promociones/nueva", kind: "form" },
  { family: "Campaigns", path: "/promociones/nueva/alcance", kind: "scope" },
  { family: "Campaigns", path: "/promociones/promo-001", kind: "detail" },
  { family: "Campaigns", path: "/promociones/promo-001/editar", kind: "edit" },
  { family: "Campaigns", path: "/promociones/promo-001/editar/alcance", kind: "scope-edit" },
  { family: "Campaigns", path: "/promociones/promo-001/estado", kind: "state" },
  { family: "Coupons", path: "/cupones", kind: "list" },
  { family: "Coupons", path: "/cupones/nuevo", kind: "form" },
  { family: "Coupons", path: "/cupones/coupon-001/editar", kind: "edit" },
  { family: "Coupons", path: "/cupones/coupon-001/limites", kind: "limits" },
  { family: "Coupons", path: "/cupones/coupon-001", kind: "detail" },
  { family: "Coupons", path: "/cupones/coupon-001/estado", kind: "state" },
  { family: "Inventory", path: "/inventario", kind: "list" },
  { family: "Inventory", path: "/inventario/umbrales", kind: "thresholds" },
  { family: "Inventory", path: "/inventario/traslados", kind: "transfers" },
  { family: "Inventory", path: "/inventario/dashboard", kind: "dashboard" },
  { family: "Bulk", path: "/carga-masiva", kind: "upload" },
  { family: "Bulk", path: "/carga-masiva/revisar", kind: "review" },
  { family: "Bulk", path: "/carga-masiva/importaciones/batch-001", kind: "progress" },
  { family: "Bulk", path: "/carga-masiva/importaciones/batch-001/resultado", kind: "result" },
  { family: "Bulk", path: "/carga-masiva/descargas", kind: "downloads" },
] as const;

const authResponse = {
  accessToken: "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJwZXJmLWhhcm5lc3MifQ.signature",
  refreshToken: "browser-benchmark-only",
  tokenType: "Bearer",
  expiresIn: 3600,
  usuario: {
    id: "11111111-1111-4111-8111-111111111111",
    nombreCompleto: "Gestora de benchmark",
    correo: "benchmark@example.test",
    roles: ["GESTOR_COMERCIAL"],
  },
};

// Read-only response fixtures use the published DTO field names and the same
// identifiers as the route inventory. They keep unknown endpoints on the
// generic fallback so an absent contract remains visible as an alert.
function adminReadFixture(path: string): unknown | undefined {
  const page = { pagina: 1, tamanio: 20, total: 0, totalPaginas: 0 };
  const category = (categoriaId: string) => ({ categoriaId, nombre: `Categoría ${categoriaId}`, estado: "ACTIVO", version: 1 });
  const product = {
    productId: "product-001", nombre: "Producto de fixture", skuBase: "SKU-FIXTURE",
    tieneVariantes: true, categoriaId: "category-fixture", tipoProductoId: "type-fixture",
    marcaId: "brand-fixture", estado: "ACTIVO", catalogVersion: 1, descripcion: "Fixture de lectura",
    imagenes: [], atributos: [], perfilFisico: null,
  };
  const preparation = {
    product_id: "product-001", tiene_variantes: true,
    pricing: { status: "COMPLETED", manual_retry_allowed: false }, inventario: null,
    variantes: [{ variant_id: "variant-001", sku: "SKU-FIXTURE-V1", inventario: { status: "COMPLETED", manual_retry_allowed: false } }],
  };
  if (path === "/api/v1/categorias/arbol") return [{ categoria: category("cat-001"), hijos: [] }];
  if (path === "/api/v1/productos") return { items: [], pagina: 1, tamanio: 20, total: 0 };
  if (path === "/api/v1/productos/administracion/product-001") return product;
  if (path === "/api/v1/productos/product-001/preparacion") return preparation;
  if (path === "/api/v1/productos/product-001/variantes") return { items: [], meta: page };
  if (path === "/api/v1/productos/product-001/variantes/variant-001") return {
    variant_id: "variant-001", sku: "SKU-FIXTURE-V1", status: "ACTIVA", catalog_version: 1,
    identifying_attributes: [], non_identifying_attributes: [], images: [], physical_profile: null,
  };
  if (path === "/api/v1/combos/combo-001") return {
    combo_id: "combo-001", status: "ACTIVO", price: 25, components: [
      { sku: "SKU-FIXTURE-A", quantity: 1 }, { sku: "SKU-FIXTURE-B", quantity: 1 },
    ], informative_availability: null, calculated_at: null, freshness: null,
    name: "Combo de fixture", description: "Solo lectura", version: 1,
  };
  if (path === "/api/v1/categorias/cat-001" || path === "/api/v1/categorias/seo-001") return category(path.endsWith("seo-001") ? "seo-001" : "cat-001");
  if (path === "/api/v1/categorias/seo-001/seo") return { categoriaId: "seo-001", slug: "categoria-seo-fixture", metaTitulo: "Categoría", metaDescripcion: "Fixture", updatedAt: "2026-01-01T00:00:00Z" };
  if (path === "/api/v1/caracteristicas/char-001") return { caracteristicaId: "char-001", nombre: "Material", tipo: "TEXTO", estado: "ACTIVO", version: 1, valores: [] };
  if (path === "/api/v1/caracteristicas/char-001/valores") return [];
  if (path === "/api/v1/tipos-producto/type-001") return { tipoProductoId: "type-001", nombre: "Tipo de fixture", estado: "ACTIVO", schemaVersion: 1 };
  if (path === "/api/v1/tipos-producto/type-001/caracteristicas") return {
    tipoProducto: { tipoProductoId: "type-001", nombre: "Tipo de fixture", estado: "ACTIVO", schemaVersion: 1 },
    caracteristicas: [], schemaVersion: 1,
  };
  if (path === "/api/v1/marcas/brand-001") return { marcaId: "brand-001", nombre: "Marca de fixture", estado: "ACTIVO", version: 1, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
  if (path === "/api/v1/recomendaciones/reglas/rule-001") return {
    reglaId: "rule-001", nombre: "Regla de fixture", tipo: "CROSS_SELL", origen: { tipo: "PRODUCTO", id: "product-001" },
    prioridad: 1, estado: "ACTIVO", validFrom: "2030-01-01T00:00:00Z", validUntil: "2030-12-31T23:59:59Z", recomendados: [],
  };
  if (path === "/api/v1/promociones/promo-001") return {
    promotionId: "promo-001", nombre: "Promoción de fixture", tipoDescuento: "PORCENTAJE", valor: 10,
    modalidad: "AUTOMATICA", estado: "ACTIVO", validFrom: "2030-01-01T00:00:00Z", validUntil: "2030-12-31T23:59:59Z",
    alcance: { productIds: [], skus: [] }, prioridad: 1, canalesHabilitados: [],
    politicaCombinacion: { ofertaPricing: true, promocionAutomatica: true, cupon: false }, puedeCambiarModalidad: true,
  };
  if (path === "/api/v1/cupones/coupon-001") return {
    cuponId: "coupon-001", codigo: "FIXTURE", promocionId: "promo-001", estado: "ACTIVO",
    politicaCancelacion: "RESTAURAR_EN_CANCELACION", usosGlobalesConsumidos: 0, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  };
  if (path === "/api/v1/precios/importaciones/batch-001") return { batch_id: "batch-001", status: "COMPLETED", allow_partial: false, total_rows: 0, completed_rows: 0, failed_rows: 0, rows: [] };
  if (path === "/api/v1/auditoria-precios/administracion/audit-001") return {
    id_auditoria: "audit-001", sku: "SKU-FIXTURE", product_id: "product-001", tipo_precio: "REGULAR",
    precio_anterior: null, precio_nuevo: 25, variacion_porcentual: null, tipo_operacion: "CREACION",
    canal_origen: "RETAIL", motivo_cambio: "Fixture de lectura", timestamp: "2026-01-01T00:00:00Z",
  };
  if (path === "/api/v1/inventario/dashboard") return {
    generatedAt: "2026-01-01T00:00:00Z", totalSkus: 0, totalOnHand: 0, totalReserved: 0, totalAvailable: 0,
    skusDisponibles: 0, skusStockBajo: 0, skusAgotados: 0, porUbicacion: [],
  };
  if (path === "/api/v1/carga-masiva/productos/importaciones/batch-001") return {
    batch_id: "batch-001", status: "COMPLETED", total_rows: 0, completed_rows: 0, failed_rows: 0,
    needs_reconciliation: false, rows: [],
  };
  return undefined;
}

async function installControlledApi(page: Page, samples: HttpSample[]) {
  let retry503Attempt = 0;
  let catalogFixtureTotal = 10;
  const pendingResponses = new Set<Promise<void>>();
  let activeTrace: string | null = null;
  const requestTraces = new Map<string, TraceRequest[]>();
  const tracedRequestByRequest = new Map<Request, TraceRequest>();
  await page.route("**/src/main.tsx*", async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    for (const [key, value] of [
      ["VITE_DATA_MODE", '"api"'],
      ["VITE_GATEWAY_ORIGIN", JSON.stringify(`http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? 5173}`)],
      ["VITE_G7_API_BASE", JSON.stringify(`http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? 5173}/api/v1`)],
      ["VITE_G6_ADMIN_API_ENABLED", '"true"'],
    ] as const) body = body.replaceAll(`import.meta.env.${key}`, value);
    await route.fulfill({ response, body });
  });

  const starts = new Map<Request, number>();
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/v1/")) {
      starts.set(request, performance.now());
      if (activeTrace) {
        const trace = requestTraces.get(activeTrace) ?? [];
        const entry: TraceRequest = { method: request.method(), path, requestBodyBytes: new TextEncoder().encode(request.postData() ?? "").byteLength };
        trace.push(entry);
        tracedRequestByRequest.set(request, entry);
        requestTraces.set(activeTrace, trace);
      }
    }
  });
  page.on("response", async (response: Response) => {
    const request = response.request();
    if (!starts.has(request)) return;
    const pending = (async () => {
      const path = new URL(request.url()).pathname;
      let responseBodyBytes = 0;
      try { responseBodyBytes = (await response.body()).byteLength; } catch { /* cancelled or bodyless */ }
      const requestBody = request.postData() ?? "";
      const traced = tracedRequestByRequest.get(request);
      if (traced) {
        traced.status = response.status();
        traced.responseBodyBytes = responseBodyBytes;
        traced.durationMs = Math.max(0, performance.now() - (starts.get(request) ?? performance.now()));
      }
      samples.push({
        method: request.method(), path, status: response.status(),
        requestBodyBytes: new TextEncoder().encode(requestBody).byteLength,
        responseBodyBytes,
        durationMs: Math.max(0, performance.now() - (starts.get(request) ?? performance.now())),
      });
    })();
    pendingResponses.add(pending);
    void pending.finally(() => pendingResponses.delete(pending));
  });
  page.on("requestfailed", (request) => {
    const start = starts.get(request);
    if (start === undefined) return;
    const failure = request.failure()?.errorText ?? "request failed";
    const traced = tracedRequestByRequest.get(request);
    if (traced) {
      traced.status = 0;
      traced.responseBodyBytes = 0;
      traced.durationMs = Math.max(0, performance.now() - start);
      traced.failed = failure;
    }
    samples.push({
      method: request.method(), path: new URL(request.url()).pathname, status: 0,
      requestBodyBytes: new TextEncoder().encode(request.postData() ?? "").byteLength,
      responseBodyBytes: 0, durationMs: Math.max(0, performance.now() - start),
      failed: failure,
    });
  });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/login")) {
      await route.fulfill({ json: authResponse });
      return;
    }
    const url = new URL(route.request().url());
    if (path === "/api/v1/productos/administracion" && route.request().method() === "GET") {
      const pageNumber = Number(url.searchParams.get("pagina") ?? 1);
      const pageSize = Number(url.searchParams.get("tamanio") ?? 10);
      const count = Math.min(pageSize, Math.max(0, catalogFixtureTotal - (pageNumber - 1) * pageSize));
      const items = Array.from({ length: count }, (_, index) => {
        const id = `perf-product-${(pageNumber - 1) * pageSize + index + 1}`;
        return { productId: id, nombre: `Producto benchmark ${id}`, skuBase: `SKU-${id}`, tieneVariantes: false,
          categoriaId: "category-fixture", tipoProductoId: "type-fixture", marcaId: "brand-fixture", estado: "ACTIVO", catalogVersion: 1 };
      });
      await route.fulfill({ json: { items, meta: { pagina: pageNumber, tamanio: pageSize, total: catalogFixtureTotal, totalPaginas: Math.ceil(catalogFixtureTotal / pageSize) } } });
      return;
    }
    if (path === "/api/v1/categorias/administracion" || path === "/api/v1/marcas/administracion") {
      const pageNumber = Number(url.searchParams.get("pagina") ?? 1);
      const pageSize = Number(url.searchParams.get("tamanio") ?? 200);
      await route.fulfill({ json: { items: [], meta: { pagina: pageNumber, tamanio: pageSize, total: 0, totalPaginas: 0 } } });
      return;
    }
    if (path === "/api/v1/tipos-producto" || path === "/api/v1/caracteristicas") {
      const pageNumber = Number(url.searchParams.get("pagina") ?? 1);
      const pageSize = Number(url.searchParams.get("tamanio") ?? 200);
      await route.fulfill({ json: { items: [], meta: { pagina: pageNumber, tamanio: pageSize, total: 0, totalPaginas: 0 } } });
      return;
    }
    if (path.endsWith("/__perf/retry503")) {
      retry503Attempt += 1;
      await route.fulfill({ status: retry503Attempt === 1 ? 503 : 200, json: { attempt: retry503Attempt } });
      return;
    }
    if (path === "/api/v1/combos" && route.request().method() === "GET") {
      const pageNumber = Number(url.searchParams.get("pagina") ?? 1);
      const pageSize = Number(url.searchParams.get("tamanio") ?? 10);
      await route.fulfill({ json: { items: [], meta: { pagina: pageNumber, tamanio: pageSize, total: 0, totalPaginas: 0 } } });
      return;
    }
    const contractFixture = adminReadFixture(path);
    if (contractFixture !== undefined) {
      await route.fulfill({ json: contractFixture });
      return;
    }
    // API fixtures are deterministic, intentionally empty and local to this run.
    const pageNumber = Number(url.searchParams.get("pagina") ?? 1);
    const pageSize = Number(url.searchParams.get("tamanio") ?? 20);
    await route.fulfill({ json: { items: [], meta: { pagina: pageNumber, tamanio: pageSize, total: 0, totalPaginas: 0 }, pagina: pageNumber, tamanio: pageSize, total: 0 } });
  });
  return {
    setCatalogFixtureTotal: (total: number) => { catalogFixtureTotal = total; },
    setTrace: (trace: string | null) => { activeTrace = trace; },
    takeTrace: (trace: string) => requestTraces.get(trace) ?? [],
    flushSamples: async () => { await Promise.all([...pendingResponses]); },
  };
}

async function login(page: Page) {
  await page.getByLabel("Correo electrónico").fill("benchmark@example.test");
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Ingresar al panel" }).click();
  await expect(page.getByRole("navigation", { name: "Navegación de la aplicación" })).toBeVisible();
}

test("@smoke API de fixture del harness responde en el navegador real", async ({ page }) => {
  const samples: HttpSample[] = [];
  await installControlledApi(page, samples);
  await page.goto("/combos");
  await login(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(samples.some((sample) => sample.path.endsWith("/auth/login") && sample.status === 200)).toBe(true);
});

test("@smoke pantalla real de Catálogo consume su endpoint administrativo con filas contractuales", async ({ page }) => {
  const samples: HttpSample[] = [];
  const { setCatalogFixtureTotal } = await installControlledApi(page, samples);
  setCatalogFixtureTotal(20);
  await page.goto("/productos?tamanio=20");
  await login(page);
  await expect(page.getByRole("heading", { name: "Gestión de productos", exact: true })).toBeVisible();
  await expect(page.getByText("Mostrando 20 de 20 productos", { exact: true })).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(21);
  expect(samples.some((sample) => sample.path === "/api/v1/productos/administracion" && sample.status === 200 && sample.responseBodyBytes > 0)).toBe(true);
});

test("benchmark opt-in navegador: rutas administrativas contra API controlada", async ({ page }, testInfo) => {
  test.skip(!process.env.G6_PERF_HARNESS, "Opt-in: ejecutar con G6_PERF_HARNESS=1 y guardar artefactos JSON.");
  test.setTimeout(600_000);
  const samples: HttpSample[] = [];
  const { setCatalogFixtureTotal, flushSamples, setTrace, takeTrace } = await installControlledApi(page, samples);
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
    if (message.type() === "warning") consoleWarnings.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const results: Array<Record<string, unknown>> = [];
  for (const route of routes) {
    const browserRouteStart = Date.now();
    // Each route is a real browser navigation and uses the app's normal login
    // return path. This avoids mutating React Router history outside its API.
    await page.goto(route.path);
    const authFormVisibleAt = Date.now();
    await login(page);
    const authCompletedAt = Date.now();
    await expect.poll(async () => {
      const text = (await page.locator("#contenido").innerText()).trim();
      return text.length > 0 && !text.includes("Cargando página…");
    }, { timeout: 10_000 }).toBe(true);
    await page.waitForTimeout(100);
    await flushSamples();
    const heading = (await page.getByRole("heading").allTextContents()).join(" | ").trim();
    const visibleAlertCount = await page.getByRole("alert").count();
    const visibleAlerts = await page.getByRole("alert").allTextContents();
    const visibleDataRows = await page.locator("#contenido tbody tr").count();
    const contentVisibleAt = Date.now();
    const alertText = visibleAlerts.join(" ");
    const alertClassification = visibleAlertCount === 0
      ? "none"
      : alertText.includes("Función no disponible")
        ? "gateway-contract-unavailable"
        : /Aún no hay componentes|requiere al menos/.test(alertText)
          ? "fixture-empty-state-validation"
          : /respuesta (in)?completa|respuesta (in)?válida|incompatible|no se pudo|no se pudieron|no se puede|error al|consulta no disponible/i.test(alertText)
            ? "fixture-response-incomplete"
            : "fixture-data-required";
    const screenReadiness = heading
      ? alertClassification === "none" ? "heading-visible-no-alert" : "heading-visible-with-alert"
      : alertClassification === "none" ? "no-heading-no-alert" : "no-heading-with-alert";
    const routeSamples = samples.splice(0);
    const signatures = routeSamples.map(({ method, path }) => `${method} ${path}`);
    const duplicateRequests = signatures.length - new Set(signatures).size;
    results.push({
      ...route,
      finalUrl: page.url(),
      heading,
      visibleAlertCount,
      visibleAlerts,
      visibleDataRows,
      visibleContent: (await page.locator("#contenido").innerText()).slice(0, 400),
      screenReadiness,
      alertClassification,
      browserRouteToContentMs: contentVisibleAt - browserRouteStart,
      authFormWaitMs: authFormVisibleAt - browserRouteStart,
      authenticationFixtureMs: authCompletedAt - authFormVisibleAt,
      contentAfterAuthMs: contentVisibleAt - authCompletedAt,
      requestCount: routeSamples.length,
      requestBodyBytes: routeSamples.reduce((sum, sample) => sum + sample.requestBodyBytes, 0),
      responseBodyBytes: routeSamples.reduce((sum, sample) => sum + sample.responseBodyBytes, 0),
      duplicateRequests,
      failedRequests: routeSamples.filter((sample) => sample.failed && !sample.failed.includes("ERR_ABORTED")).length,
      cancelledRequests: routeSamples.filter((sample) => sample.failed?.includes("ERR_ABORTED")).length,
      http: routeSamples,
      dataset: { fixture: "endpoint-shaped controlled API fixture", visibleRows: visibleDataRows },
    });
  }
  const catalogListDatasetRuns: Array<Record<string, unknown>> = [];
  for (const [total, pageSize] of [[20, 20], [100, 100], [1000, 100]] as const) {
    setCatalogFixtureTotal(total);
    const startedAt = Date.now();
    await page.goto(`/productos?tamanio=${pageSize}`);
    await login(page);
    await expect(page.getByRole("heading", { name: "Gestión de productos", exact: true })).toBeVisible();
    await expect(page.getByText(`Mostrando ${pageSize} de ${total} productos`, { exact: true })).toBeVisible();
    await flushSamples();
    const firstPageRows = await page.getByRole("row").count() - 1;
    const pageSamples = samples.splice(0);
    const traversedPages = [1];
    if (total === 1000) {
      for (let currentPage = 2; currentPage <= 10; currentPage += 1) {
        const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/productos/administracion" && new URL(response.url()).searchParams.get("pagina") === String(currentPage));
        await page.getByRole("button", { name: String(currentPage), exact: true }).click();
        await responsePromise;
        traversedPages.push(currentPage);
      }
      await expect(page.getByText("Mostrando 901 a 1000 de 1000", { exact: true })).toBeVisible();
    }
    const allSamples = [...pageSamples, ...samples.splice(0)];
    catalogListDatasetRuns.push({
      screen: "/productos → useProductList → createHttpCatalogRepository → Gateway → GET /productos/administracion",
      fixtureTotal: total,
      pageSize,
      firstPageRows,
      traversedPages,
      finalPageRows: await page.getByRole("row").count() - 1,
      elapsedMs: Date.now() - startedAt,
      requestCount: allSamples.length,
      requestBodyBytes: allSamples.reduce((sum, sample) => sum + sample.requestBodyBytes, 0),
      responseBodyBytes: allSamples.reduce((sum, sample) => sum + sample.responseBodyBytes, 0),
      requestPaths: [...new Set(allSamples.map((sample) => sample.path))],
    });
  }
  setCatalogFixtureTotal(100);
  const searchResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/productos/administracion" && new URL(response.url()).searchParams.has("q"));
  await page.getByRole("textbox", { name: "Búsqueda" }).fill("benchmark");
  await searchResponse;
  await flushSamples();
  const catalogSearchSamples = samples.splice(0);
  const familySamples: Array<Record<string, unknown>> = [];
  const familyNav = [
    ["Combos", "/combos"], ["Catalog", "/productos"], ["Pricing", "/precios"],
    ["Price Audit", "/precios/auditoria"], ["Categories", "/categorias"],
    ["Characteristics", "/caracteristicas"], ["Product Types", "/tipos-producto"],
    ["Brands", "/marcas"], ["SEO", "/seo"], ["Recommendations", "/recomendaciones"],
    ["Campaigns", "/promociones"], ["Coupons", "/cupones"],
    ["Inventory", "/inventario"], ["Bulk", "/carga-masiva"],
  ] as const;
  for (const [family, targetPath] of familyNav) {
    if (process.env.G6_PERF_FAMILY && process.env.G6_PERF_FAMILY !== "all" && process.env.G6_PERF_FAMILY !== family) continue;
    const durations: number[] = [];
    let requestCount = 0;
    let duplicateRequests = 0;
    const requestPathCounts = new Map<string, number>();
    const navigationTraces: Array<{ sample: number; resetPath: string; targetPath: string; requestsStarted: Array<{ method: string; path: string; requestBodyBytes: number }> }> = [];
    await flushSamples();
    samples.splice(0);
    for (let sampleIndex = -5; sampleIndex < 100; sampleIndex += 1) {
      const resetPath = targetPath === "/combos" ? "/productos" : "/combos";
      const traceId = `${family}:${sampleIndex}`;
      setTrace(traceId);
      const duration = await page.evaluate(async ({ reset, target }) => {
        const clickRoute = (path: string) => new Promise<void>((resolve, reject) => {
          const anchor = [...document.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Navegación de la aplicación"] a')]
            .find((item) => item.getAttribute("href") === path);
          if (!anchor) { reject(new Error(`No existe la ruta lateral ${path}`)); return; }
          const expectedPath = new URL(path, location.href).pathname;
          anchor.click();
          let frames = 0;
          const check = () => {
            if (location.pathname === expectedPath) { resolve(); return; }
            if (++frames > 60) { reject(new Error(`La navegación a ${path} no terminó`)); return; }
            requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        });
        await clickRoute(reset);
        const startedAt = performance.now();
        await clickRoute(target);
        return performance.now() - startedAt;
      }, { reset: resetPath, target: targetPath });
      await page.waitForTimeout(10);
      setTrace(null);
      const requestsStarted = takeTrace(traceId);
      if (sampleIndex >= 0) {
        durations.push(duration);
        const signatures = requestsStarted.map(({ method, path }) => `${method} ${path}`);
        requestCount += requestsStarted.length;
        duplicateRequests += signatures.length - new Set(signatures).size;
        navigationTraces.push({ sample: sampleIndex, resetPath, targetPath, requestsStarted });
        for (const sample of requestsStarted) {
          const key = `${sample.method} ${sample.path}`;
          requestPathCounts.set(key, (requestPathCounts.get(key) ?? 0) + 1);
        }
      }
    }
    await page.waitForTimeout(100);
    await flushSamples();
    const familyRequests = navigationTraces.flatMap((trace) => trace.requestsStarted) as TraceRequest[];
    const requestBodyBytes = familyRequests.reduce((sum, request) => sum + request.requestBodyBytes, 0);
    const responseBodyBytes = familyRequests.reduce((sum, request) => sum + (request.responseBodyBytes ?? 0), 0);
    const failedRequests = familyRequests.filter((request) => request.failed).length;
    const completedRequests = familyRequests.filter((request) => request.status !== undefined).length;
    samples.splice(0);
    const sorted = [...durations].sort((a, b) => a - b);
    const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0;
    familySamples.push({
      family, warmupSamples: 5, measuredSamples: durations.length,
      p50Ms: percentile(0.50), p95Ms: percentile(0.95), p99Ms: percentile(0.99),
      meanMs: durations.reduce((sum, value) => sum + value, 0) / durations.length,
      requestCount, requestBodyBytes, responseBodyBytes, duplicateRequests, failedRequests,
      requestPathCounts: Object.fromEntries(requestPathCounts),
      navigationTraces,
      requestCounting: "requests started during each reset→target navigation pair; response completion is tracked independently after the original 10ms settle",
      completedRequests,
      pendingAtCollection: familyRequests.length - completedRequests,
      scope: "authenticated sidebar reset and target SPA URL transitions with the original 10ms fixture settle; excludes provider latency",
    });
  }
  const retryScenario = await page.evaluate(async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch("/api/v1/__perf/retry503");
      statuses.push(response.status);
      if (response.ok) break;
    }
    return statuses;
  });
  expect(retryScenario).toEqual([503, 200]);
  await page.waitForTimeout(20);
  await flushSamples();
  const retrySamples = samples.splice(0);
  const report = {
    schemaVersion: 1,
    runLabel: process.env.G6_PERF_RUN_LABEL || "local",
    browser: "Chromium via Playwright",
    measurement: "full browser route load, controlled login, and content region visible after 100ms fixture-network settle; auth and content intervals separate",
    api: "Playwright-intercepted deterministic local responses; no provider or live Gateway latency",
    bytes: "request/response body bytes only; excludes HTTP headers, TLS and browser assets",
    navigationCancellationNote: "net::ERR_ABORTED caused by leaving a route is reported separately from HTTP/network failures; it remains present in each route's HTTP trace and the cancellations collection",
    routeCount: results.length,
    familyCount: new Set(routes.map((route) => route.family)).size,
    screenReadinessNote: "A visible heading does not establish provider availability. Read-only fixtures use endpoint-specific DTO fields from OpenAPI/adapters; route data remains synthetic, and only catalogListDatasetRuns populates a paginated product dataset.",
    routeReadiness: Object.fromEntries([...new Set(results.map((result) => result.screenReadiness as string))].map((status) => [status, results.filter((result) => result.screenReadiness === status).length])),
    alertClassification: Object.fromEntries([...new Set(results.map((result) => result.alertClassification as string))].map((classification) => [classification, results.filter((result) => result.alertClassification === classification).length])),
    familyUiSamples: familySamples,
    catalogListDatasetRuns: { note: "real /productos screen and useProductList using contract-shaped fixture on the actual administrative list endpoint; page size is capped at 100 so 1000 total rows are paginated over ten requests", series: catalogListDatasetRuns },
    catalogListSearch: { query: "benchmark", requests: catalogSearchSamples },
    retry503Scenario: { note: "explicit harness-level retry against controlled fixture; does not exercise application or upstream recovery", statuses: retryScenario, attempts: retrySamples },
    consoleErrors,
    expectedConsoleErrors: consoleErrors.filter((message) => message.includes("503 (Service Unavailable)")),
    unexpectedConsoleErrors: consoleErrors.filter((message) => !message.includes("503 (Service Unavailable)")),
    consoleWarnings,
    pageErrors,
    cancellations: results.flatMap((result) => result.http as HttpSample[]).filter((sample) => sample.failed),
    routes: results,
  };
  const reportPath = testInfo.outputPath("admin-browser-performance.json");
  await mkdir(testInfo.outputDir, { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  await testInfo.attach("admin-browser-performance.json", { path: reportPath, contentType: "application/json" });
  expect(results).toHaveLength(routes.length);
  expect(familySamples.every((sample) => sample.measuredSamples === 100 && sample.warmupSamples === 5)).toBe(true);
  expect(catalogListDatasetRuns.map((run) => run.fixtureTotal)).toEqual([20, 100, 1000]);
  expect(results.some((result) => (result.failedRequests as number) > 0)).toBe(false);
});
