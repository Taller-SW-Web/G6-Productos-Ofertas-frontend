import { expect, test, type Page, type Route } from "@playwright/test";

const productId = "11111111-1111-4111-8111-111111111111";
const allowCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Expose-Headers": "X-Correlation-Id",
};

async function runContractJourney(page: Page, recordEvent: (event: string) => void) {
  let description = "Descripción PERF06 inicial";
  let version = 1;
  let retryAccepted = false;
  let pendingReadsLeft = 0;
  let preparationReads = 0;
  let patchRequests = 0;
  let retryRequests = 0;
  let listedVersion = 0;
  const registered = new Set<string>([productId]);

  const summary = () => ({
    productId,
    nombre: "Producto PERF06 sintético",
    descripcion: description,
    skuBase: "POMA-PERF06-0001",
    categoriaId: "cat-h5",
    marcaId: "brand-h5",
    tipoProductoId: "type-h5",
    tieneVariantes: false,
    estado: "BORRADOR",
    catalogVersion: version,
  });
  const productWrite = () => ({
    product_id: productId,
    slug: "producto-perf06-sintetico",
    status: "BORRADOR",
    catalog_version: version,
    name: "Producto PERF06 sintético",
    description,
    sku_base: "POMA-PERF06-0001",
    categoria_id: "cat-h5",
    marca_id: "brand-h5",
    tipo_producto_id: "type-h5",
    tiene_variantes: false,
    images: [],
    attributes: [],
    variants: [],
    perfil_fisico: null,
  });

  const handler = async (route: Route) => {
    const request = route.request();
    const { pathname, searchParams } = new URL(request.url());
    const respond = (json: unknown, status = 200) => route.fulfill({ status, headers: allowCors, contentType: "application/json", json });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: allowCors });
    if (pathname === "/api/v1/productos/administracion" && request.method() === "GET") {
      listedVersion = version;
      const pageNo = Number(searchParams.get("pagina") ?? "1");
      const pageSize = Number(searchParams.get("tamanio") ?? "10");
      return respond({ items: [summary()], meta: { pagina: pageNo, tamanio: pageSize, total: 1, totalPaginas: 1 } });
    }
    if (pathname === `/api/v1/productos/administracion/${productId}` && request.method() === "GET")
      return respond({ ...summary(), elegibleCorreccionTipo: false, imagenes: [], atributos: [], caracteristicasIdentificadoras: [], perfilFisico: null });
    if (pathname === `/api/v1/productos/${productId}/preparacion` && request.method() === "GET") {
      preparationReads += 1;
      if (!retryAccepted) return respond({ product_id: productId, tiene_variantes: false, pricing: { status: "REJECTED", manual_retry_allowed: true, code: "PRICE_NOT_READY" }, inventario: { status: "COMPLETED", manual_retry_allowed: false }, variantes: [] });
      if (pendingReadsLeft > 0) {
        pendingReadsLeft -= 1;
        return respond({ product_id: productId, tiene_variantes: false, pricing: { status: "PENDING", manual_retry_allowed: false }, inventario: { status: "COMPLETED", manual_retry_allowed: false }, variantes: [] });
      }
      return respond({ product_id: productId, tiene_variantes: false, pricing: { status: "COMPLETED", manual_retry_allowed: false }, inventario: { status: "COMPLETED", manual_retry_allowed: false }, variantes: [] });
    }
    if (pathname === `/api/v1/productos/${productId}` && request.method() === "PATCH") {
      patchRequests += 1;
      const body = request.postDataJSON() as { catalogVersion?: number; descripcion?: string };
      if (body.catalogVersion !== version) return respond({ code: "VERSION_CONFLICT" }, 409);
      description = String(body.descripcion ?? "");
      version += 1;
      return respond(productWrite());
    }
    if (pathname === `/api/v1/productos/${productId}/preparacion/reintentar` && request.method() === "POST") {
      retryRequests += 1;
      const body = request.postDataJSON() as { dependencia?: string };
      if (retryRequests !== 1 || body.dependencia !== "PRICING") return respond({ code: "REINTENTO_NO_ADMITIDO" }, 409);
      retryAccepted = true;
      pendingReadsLeft = 2;
      return respond({ status: "ACCEPTED", operation_id: "22222222-2222-4222-8222-222222222222", correlation_id: "33333333-3333-4333-8333-333333333333" }, 202);
    }
    if (pathname.endsWith("/categorias/administracion") || pathname.endsWith("/marcas/administracion") || pathname.endsWith("/tipos-producto")) {
      const item = pathname.includes("categorias") ? { categoriaId: "cat-h5", nombre: "Categoría H5" }
        : pathname.includes("marcas") ? { marcaId: "brand-h5", nombre: "Marca H5" }
          : { tipoProductoId: "type-h5", nombre: "Tipo H5" };
      return respond({ items: [{ ...item, estado: "ACTIVO" }], meta: { pagina: 1, tamanio: Number(searchParams.get("tamanio") ?? "100"), total: 1, totalPaginas: 1 } });
    }
    if (pathname === "/api/v1/tipos-producto/type-h5/caracteristicas")
      return respond({ tipoProducto: { tipoProductoId: "type-h5" }, schemaVersion: 1, caracteristicas: [] });
    return respond({ code: "NO_ENCONTRADO" }, 404);
  };

  await page.route("https://gateway.test/api/v1/**", handler);
  try {
    recordEvent("journey-start");
    await page.goto("/tests/harness/catalog-http.html?path=/productos");
    await expect(page.getByRole("heading", { name: "Gestión de productos" })).toBeVisible();
    await page.getByRole("link", { name: "Ver detalle de Producto PERF06 sintético" }).click();
    await expect(page.getByRole("heading", { name: "Producto PERF06 sintético", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Editar", exact: true }).click();
    await expect(page.getByLabel("Descripción comercial")).toHaveValue("Descripción PERF06 inicial");
    await page.getByLabel("Descripción comercial").fill("Descripción PERF06 actualizada");
    await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await expect(page.getByText("Descripción PERF06 actualizada", { exact: true })).toBeVisible();
    await expect(page.getByText("v2", { exact: true })).toBeVisible();
    expect(patchRequests).toBe(1);
    await page.getByRole("link", { name: "Ver preparación", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Preparación del producto" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reintentar preparación de Pricing" })).toBeVisible();
    await page.getByRole("button", { name: "Reintentar preparación de Pricing" }).click();
    await expect(page.getByText("Solicitud admitida. Consulte la preparación para conocer el resultado final.", { exact: true })).toBeVisible();
    await expect(page.getByText("En preparación", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Precio regular base inicializado correctamente en Pricing. Estado terminal confirmado.", { exact: true })).toBeVisible({ timeout: 18_000 });
    expect(retryRequests).toBe(1);
    expect(preparationReads).toBeGreaterThanOrEqual(4);
    await page.getByRole("link", { name: "Productos", exact: true }).first().click();
    await expect(page.getByRole("link", { name: "Ver detalle de Producto PERF06 sintético" })).toBeVisible();
    expect(listedVersion).toBe(2);
    recordEvent("journey-complete");
  } finally {
    recordEvent("cleanup-outside-measurement");
    for (const id of registered) {
      registered.delete(id);
      registered.delete(id);
    }
    expect(registered.size).toBe(0);
  }
  return { patchRequests, retryRequests, preparationReads, version };
}

test("PERF06_MUTATION contractual: interfaz, versionado, HTTP 202 no terminal, polling acotado y cleanup idempotente", async ({ page }) => {
  const events: string[] = [];
  await runContractJourney(page, event => events.push(event));
  expect(events).toEqual(["journey-start", "journey-complete", "cleanup-outside-measurement"]);
});
