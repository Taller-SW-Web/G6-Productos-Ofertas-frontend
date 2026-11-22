import { expect, test } from "@playwright/test";

test("CAT real HTTP: Chromium carga Catalog, edita por UI, lee variantes y conserva evidencia de errores/reintento", async ({ page }) => {
  test.skip(!process.env.CATALOG_REAL_JWT, "Requiere que el runner E2E real inyecte el JWT local firmado.");
  const token = process.env.CATALOG_REAL_JWT;
  const forbiddenToken = process.env.CATALOG_REAL_FORBIDDEN_JWT;
  const browserOrigin = process.env.CATALOG_REAL_BROWSER_ORIGIN;
  const productId = process.env.CATALOG_REAL_PRODUCT_ID;
  const variantProductId = process.env.CATALOG_REAL_VARIANT_PRODUCT_ID;
  const variantId = process.env.CATALOG_REAL_VARIANT_ID;
  const variantSku = process.env.CATALOG_REAL_VARIANT_SKU;
  const correlation = process.env.CATALOG_REAL_CORRELATION_ID ?? "00000000-0000-4000-8000-000000000050";
  expect(token, "JWT signed by the local real Gateway harness").toBeTruthy();
  expect(forbiddenToken).toBeTruthy();
  expect(browserOrigin).toMatch(/^http:\/\/127\.0\.0\.1:/);
  expect(productId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(variantProductId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(variantId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(variantSku).toMatch(/^E2E-VARIANT-/);
  expect(correlation).toMatch(/^[0-9a-f-]{36}$/i);

  const catalogRequests: string[] = [];
  page.on("pageerror", error => console.log(`[catalog-http-real-pageerror] ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") console.log(`[catalog-http-real-console] ${message.text()}`);
  });
  page.on("response", response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/v1/"))
      console.log(`[catalog-http-real-browser] ${response.request().method()} ${url.pathname} -> ${response.status()}`);
  });
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/v1/productos")) {
      catalogRequests.push(`${request.method()} ${url.pathname}${url.search}`);
      console.log(`[catalog-http-real-request] ${request.method()} ${url.href}`);
    }
  });
  page.on("requestfailed", request => {
    if (new URL(request.url()).pathname.startsWith("/api/v1/"))
      console.log(`[catalog-http-real-request-failed] ${request.url()} ${request.failure()?.errorText ?? "unknown"}`);
  });
  await page.addInitScript(({ jwt, id, apiOrigin }: { jwt: string; id: string; apiOrigin: string }) => {
    window.__G6_CATALOG_E2E_JWT__ = jwt;
    window.__G6_CATALOG_E2E_CORRELATION__ = id;
    window.__G6_CATALOG_E2E_API_ORIGIN__ = apiOrigin;
  }, { jwt: token!, id: correlation, apiOrigin: browserOrigin! });

  const listResponsePromise = page.waitForResponse(response =>
    response.request().method() === "GET" &&
    new URL(response.url()).pathname === "/api/v1/productos/administracion" &&
    new URL(response.url()).searchParams.get("pagina") === "1",
  );
  const taxonomy503Promise = page.waitForResponse(response =>
    response.status() === 503 &&
    /^\/api\/v1\/(categorias|marcas|tipos-producto)/.test(new URL(response.url()).pathname),
  );
  await page.goto("/tests/harness/catalog-http-real.html?path=/productos");
  const listResponse = await listResponsePromise;
  expect(listResponse.status()).toBe(200);
  const list = await listResponse.json() as { items: Array<{ productId: string; nombre: string }>; meta: { total: number } };
  expect(list.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ productId, nombre: "Gateway E2E write preflight" }),
  ]));
  expect(list.meta.total).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("heading", { name: "Gestión de productos" })).toBeVisible({ timeout: 30_000 });
  const taxonomyFailure = await taxonomy503Promise;
  expect(taxonomyFailure.status()).toBe(503);
  await expect(page.getByRole("button", { name: "Reintentar filtros" })).toBeVisible();
  const retriedTaxonomyPromise = page.waitForResponse(response =>
    response.status() === 200 &&
    /^\/api\/v1\/(categorias|marcas|tipos-producto)/.test(new URL(response.url()).pathname),
  );
  await page.getByRole("button", { name: "Reintentar filtros" }).click();
  expect((await retriedTaxonomyPromise).status()).toBe(200);

  const statuses = await page.evaluate(async ({ origin, id, valid, forbidden }: { origin: string; id: string; valid: string; forbidden: string }) => {
    const read = async (path: string, bearer?: string) => (await fetch(new URL(path, origin), {
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
    })).status;
    return {
      unauthorized: await read("/api/v1/productos/administracion"),
      forbidden: await read("/api/v1/productos/administracion", forbidden),
      missing: await read(`/api/v1/productos/administracion/${id}`, valid),
    };
  }, { origin: browserOrigin!, id: "ffffffff-ffff-4fff-8fff-ffffffffffff", valid: token!, forbidden: forbiddenToken! });
  expect(statuses.unauthorized).toBe(401);
  expect(statuses.forbidden).toBe(403);
  expect(statuses.missing).toBe(404);

  const detailLink = page.getByRole("link", { name: "Ver detalle de Gateway E2E write preflight" });
  await expect(detailLink).toBeVisible();
  await detailLink.focus();
  await expect(detailLink).toBeFocused();
  const detailResponsePromise = page.waitForResponse(response =>
    response.request().method() === "GET" &&
    new URL(response.url()).pathname === `/api/v1/productos/administracion/${productId}`,
  );
  await page.keyboard.press("Enter");
  const detailResponse = await detailResponsePromise;
  expect(detailResponse.status()).toBe(200);
  const detail = await detailResponse.json() as { productId: string; nombre: string; descripcion: string };
  expect(detail).toMatchObject({ productId, nombre: "Gateway E2E write preflight", descripcion: "Disposable PostgreSQL updated" });
  await expect(page.getByRole("heading", { name: detail.nombre })).toBeVisible();
  await expect(page.getByText(detail.descripcion, { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Editar", exact: true }).click();
  await expect(page.getByRole("heading", { name: `Editar: ${detail.nombre}` })).toBeVisible();
  await page.getByLabel("Descripción comercial").fill("Chromium actualizó el borrador mediante HTTP real");
  const patchResponsePromise = page.waitForResponse(response =>
    response.request().method() === "PATCH" &&
    new URL(response.url()).pathname === `/api/v1/productos/${productId}`,
  );
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  const patchResponse = await patchResponsePromise;
  expect(patchResponse.status()).toBe(200);
  await expect(page.getByText("Chromium actualizó el borrador mediante HTTP real", { exact: true })).toBeVisible();
  const reloadedDetailPromise = page.waitForResponse(response =>
    response.request().method() === "GET" &&
    new URL(response.url()).pathname === `/api/v1/productos/administracion/${productId}`,
  );
  await page.goto(`/tests/harness/catalog-http-real.html?path=/productos/${productId}`);
  const reloadedDetail = await reloadedDetailPromise;
  expect(reloadedDetail.status()).toBe(200);
  expect(await reloadedDetail.json()).toMatchObject({ productId, descripcion: "Chromium actualizó el borrador mediante HTTP real" });
  const browserReloadResponsePromise = page.waitForResponse(response =>
    response.request().method() === "GET" &&
    new URL(response.url()).pathname === `/api/v1/productos/administracion/${productId}`,
  );
  await page.reload();
  const browserReloadResponse = await browserReloadResponsePromise;
  expect(browserReloadResponse.status()).toBe(200);
  await expect(page.getByText("Chromium actualizó el borrador mediante HTTP real", { exact: true })).toBeVisible();

  await page.goto(`/tests/harness/catalog-http-real.html?path=/productos/${variantProductId}/variantes`);
  const variantsResponse = await page.waitForResponse(response =>
    response.request().method() === "GET" &&
    new URL(response.url()).pathname === `/api/v1/productos/${variantProductId}/variantes`,
  );
  expect(variantsResponse.status()).toBe(200);
  const variants = await variantsResponse.json() as { items: Array<{ variant_id: string; sku: string }> };
  expect(variants.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ variant_id: variantId, sku: variantSku }),
  ]));
  const variantLink = page.getByRole("link", { name: `Ver detalle de ${variantSku}` });
  await expect(variantLink).toBeVisible();
  await variantLink.focus();
  await expect(variantLink).toBeFocused();
  const variantDetailPromise = page.waitForResponse(response =>
    response.request().method() === "GET" &&
    new URL(response.url()).pathname === `/api/v1/productos/${variantProductId}/variantes/${variantId}`,
  );
  await variantLink.click();
  const variantResponse = await variantDetailPromise;
  expect(variantResponse.status()).toBe(200);
  await expect(page.getByRole("heading", { name: `Variante: ${variantSku}` })).toBeVisible();
  expect(catalogRequests.some(request => request.startsWith("PATCH /api/v1/productos/"))).toBe(true);
});
