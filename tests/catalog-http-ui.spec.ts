import { expect, test } from "@playwright/test";

test("UI API 1440: POST contractual, error 409 visible, datos conservados y sin reenvío automático", async ({ page }) => {
  let posts = 0;
  await page.route("https://gateway.test/api/v1/**", async route => {
    const request = route.request(); const url = new URL(request.url());
    let body: unknown;
    let status = 200;
    if (request.method() === "OPTIONS") { await route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST, PATCH" } }); return; }
    if (request.method() === "POST") {
      posts++; status = 409; body = { code: "SKU_DUPLICADO" };
      expect(request.postDataJSON()).toMatchObject({ nombre: "Producto HTTP", skuBase: "000-SKU", categoriaId: "cat-api", tipoProductoId: "type-api", marcaId: "brand-api" });
      expect(request.headers()).not.toHaveProperty("authorization");
    } else if (url.pathname.endsWith("/categorias/administracion")) body = { items: [{ categoriaId: "cat-api", nombre: "Categoría HTTP", estado: "ACTIVO" }], meta: { pagina: 1, tamanio: 200, total: 1, totalPaginas: 1 } };
    else if (url.pathname.endsWith("/marcas/administracion")) body = { items: [{ marcaId: "brand-api", nombre: "Marca HTTP", estado: "ACTIVO" }], meta: { pagina: 1, tamanio: 200, total: 1, totalPaginas: 1 } };
    else if (url.pathname.endsWith("/tipos-producto")) body = { items: [{ tipoProductoId: "type-api", nombre: "Tipo HTTP", estado: "ACTIVO" }], meta: { pagina: 1, tamanio: 100, total: 1, totalPaginas: 1 } };
    else body = { tipoProducto: { tipoProductoId: "type-api" }, schemaVersion: 1, caracteristicas: [] };
    await route.fulfill({ status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(body) });
  });
  await page.goto("/tests/harness/catalog-http.html");
  await expect(page.getByRole("heading", { name: "Crear producto" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("combobox", { name: "Categoría", exact: true })).toHaveValue("Categoría HTTP");
  await page.getByLabel("Nombre del producto").fill("Producto HTTP");
  await page.getByLabel("Descripción comercial").fill("Se conserva tras error");
  await page.getByLabel("SKU Base").fill("000-SKU");
  await page.getByLabel("Precio base inicial (S/.)").fill("20");
  await page.getByRole("button", { name: "Guardar borrador", exact: true }).click();
  await expect(page.getByText(/409, SKU_DUPLICADO/)).toBeVisible();
  await expect(page.getByLabel("Nombre del producto")).toHaveValue("Producto HTTP");
  await expect(page.getByLabel("SKU Base")).toHaveValue("000-SKU");
  expect(posts).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath("catalogo-http-error-1440.png"), fullPage: true });
});

for (const status of [401, 403, 503]) {
  test(`UI API: ${status} no muestra fixtures ni lo transforma en lista vacía`, async ({ page }) => {
    await page.route("https://gateway.test/api/v1/**", route => route.fulfill({ status, contentType: "application/problem+json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ code: status === 401 ? "TOKEN_INVALIDO" : status === 403 ? "SCOPE_INSUFICIENTE" : "SERVICIO_NO_DISPONIBLE" }) }));
    await page.goto("/tests/harness/catalog-http.html?path=/productos");
    await expect(page.getByRole("heading", { name: "Gestión de productos" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(new RegExp(`${status},`)).first()).toBeVisible();
    await expect(page.getByText("Camiseta Running Endurance", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("row").filter({ hasText: "CAM-RUN" })).toHaveCount(0);
  });
}

test("UI API: lectura administrativa bloqueada conserva preparación independiente y no afirma 404", async ({ page }) => {
  await page.route("https://gateway.test/api/v1/**", route => {
    const preparation = route.request().url().endsWith("/preparacion");
    return route.fulfill({ status: preparation ? 200 : 404, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(preparation ? {
      product_id: "product", tiene_variantes: false, pricing: { status: "PENDING", manual_retry_allowed: false },
      inventario: { status: "REJECTED", manual_retry_allowed: false, code: "UBICACION_NO_ENCONTRADA" }, variantes: [],
    } : { code: "PRODUCTO_NO_ENCONTRADO" }) });
  });
  await page.goto("/tests/harness/catalog-http.html?path=/productos/product/preparacion");
  await expect(page.getByRole("heading", { name: "Preparación del producto" })).toBeVisible();
  await expect(page.getByText("Estado administrativo no disponible", { exact: true })).toBeVisible();
  await expect(page.getByText("Pricing: En preparación", { exact: true })).toBeVisible();
  await expect(page.getByText("Inventario: Rechazado", { exact: true })).toBeVisible();
  await expect(page.getByText("404 - Producto inexistente", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Reintentar preparación/ })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("catalogo-preparacion-parcial-1440.png"), fullPage: true });
});

test("UI API 1440: un borrador reaparece en el listado y se edita con la versión persistida", async ({ page }) => {
  const id = "11111111-1111-4111-8111-111111111111";
  let description = "Descripción original";
  let version = 4;
  let created = false;
  const sentVersions: number[] = [];
  const productWrite = () => ({
    product_id: id, status: "BORRADOR", catalog_version: version, name: "Borrador H4", description,
    sku_base: "H4-DRAFT", categoria_id: "cat-api", marca_id: "brand-api", tipo_producto_id: "type-api",
    tiene_variantes: false, images: [], attributes: [], variants: [], perfil_fisico: null,
  });
  const summary = () => ({
    productId: id, estado: "BORRADOR", catalogVersion: version, nombre: "Borrador H4", descripcion: description,
    skuBase: "H4-DRAFT", categoriaId: "cat-api", marcaId: "brand-api", tipoProductoId: "type-api", tieneVariantes: false,
    slug: "borrador-h4", publicadoAlgunaVez: false, creadoEn: "2026-11-07T13:00:00Z", actualizadoEn: "2026-11-07T13:00:00Z",
  });
  await page.route("https://gateway.test/api/v1/**", async route => {
    const request = route.request();
    const { pathname, searchParams } = new URL(request.url());
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST, PATCH" };
    const respond = (json: unknown, status = 200) => route.fulfill({ json, status, headers });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (pathname.endsWith("/preparacion")) return respond({
      product_id: id, tiene_variantes: false, pricing: { status: "PENDING", manual_retry_allowed: false },
      inventario: { status: "PENDING", manual_retry_allowed: false }, variantes: [],
    });
    if (pathname === "/api/v1/productos" && request.method() === "POST") {
      expect(request.postDataJSON()).toMatchObject({ nombre: "Borrador H4", skuBase: "H4-DRAFT" });
      created = true;
      return respond(productWrite(), 201);
    }
    if (pathname === `/api/v1/productos/${id}` && request.method() === "PATCH") {
      const body = request.postDataJSON();
      sentVersions.push(body.catalogVersion);
      if (body.catalogVersion !== version) return respond({ code: "VERSION_CONFLICT" }, 409);
      version++;
      description = body.descripcion;
      return respond(productWrite());
    }
    if (pathname === "/api/v1/productos/administracion") return respond({
      items: created ? [summary()] : [],
      meta: { pagina: Number(searchParams.get("pagina")), tamanio: Number(searchParams.get("tamanio")), total: Number(created), totalPaginas: Number(created) },
    });
    if (pathname === `/api/v1/productos/administracion/${id}` && created)
      return respond({ ...summary(), imagenes: [], atributos: [], caracteristicasIdentificadoras: [], perfilFisico: null });
    if (pathname.endsWith("/categorias/administracion") || pathname.endsWith("/marcas/administracion") || pathname.endsWith("/tipos-producto")) {
      const item = pathname.includes("categorias") ? { categoriaId: "cat-api", nombre: "Categoría HTTP" }
        : pathname.includes("marcas") ? { marcaId: "brand-api", nombre: "Marca HTTP" }
          : { tipoProductoId: "type-api", nombre: "Tipo HTTP" };
      return respond({ items: [{ ...item, estado: "ACTIVO" }], meta: { pagina: 1, tamanio: Number(searchParams.get("tamanio")), total: 1, totalPaginas: 1 } });
    }
    if (pathname === "/api/v1/tipos-producto/type-api/caracteristicas")
      return respond({ tipoProducto: { tipoProductoId: "type-api" }, schemaVersion: 1, caracteristicas: [] });
    return respond({ code: "PRODUCTO_NO_ENCONTRADO" }, 404);
  });

  await page.goto("/tests/harness/catalog-http.html");
  await page.getByLabel("Nombre del producto").fill("Borrador H4");
  await page.getByLabel("Descripción comercial").fill(description);
  await page.getByLabel("SKU Base").fill("H4-DRAFT");
  await page.getByLabel("Precio base inicial (S/.)").fill("20");
  await page.getByRole("button", { name: "Guardar borrador", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/productos/${id}/preparacion`));

  await page.goto("/tests/harness/catalog-http.html?path=/productos");
  await page.getByRole("link", { name: "Ver detalle de Borrador H4" }).click();
  await page.getByRole("link", { name: "Editar", exact: true }).click();
  await expect(page.getByLabel("Descripción comercial")).toHaveValue("Descripción original");
  await page.getByLabel("Descripción comercial").fill("Descripción corregida");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.getByText("Descripción corregida", { exact: true })).toBeVisible();
  expect(sentVersions).toEqual([4]);
  await expect(page.getByText("v5", { exact: true })).toBeVisible();
});
