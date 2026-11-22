import { expect, test } from "@playwright/test";

test("Chromium recorre Vite → Gateway real → Catalog real con JWT firmado", async ({ page }) => {
  const token = process.env.CATALOG_REAL_JWT;
  const gatewayOrigin = process.env.CATALOG_REAL_GATEWAY_ORIGIN;
  const correlation = process.env.CATALOG_REAL_CORRELATION_ID ?? "00000000-0000-4000-8000-000000000050";
  expect(token, "JWT signed by the local real Gateway harness").toBeTruthy();
  expect(gatewayOrigin, "Gateway loopback origin").toBeTruthy();
  const catalogRequests: string[] = [];
  const catalogResponses: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname.startsWith("/api/v1/productos")) catalogRequests.push(`${request.method()} ${new URL(request.url()).pathname}${new URL(request.url()).search}`);
  });
  page.on("response", response => {
    if (new URL(response.url()).pathname.startsWith("/api/v1/productos")) catalogResponses.push(`${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}${new URL(response.url()).search}`);
  });
  await page.addInitScript(({ jwt, id }: { jwt: string; id: string }) => { window.__G6_CATALOG_E2E_JWT__ = jwt; window.__G6_CATALOG_E2E_CORRELATION__ = id; }, { jwt: token!, id: correlation });
  await page.goto("/tests/harness/catalog-http-real.html?path=/productos");
  await expect(page.getByRole("heading", { name: "Gestión de productos" })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => catalogRequests.some(request => request.startsWith("GET /api/v1/productos/administracion")), { timeout: 30_000 }).toBe(true);
  expect(page.url()).toContain("/productos");
  expect(catalogRequests.some(request => request.startsWith("GET /api/v1/productos/administracion"))).toBe(true);
  expect(gatewayOrigin).toMatch(/^http:\/\/127\.0\.0\.1:/);
  expect(token).toBeTruthy();
  expect(correlation).toMatch(/^[0-9a-f-]{36}$/i);
  expect(catalogRequests.some(request => request.startsWith("GET /api/v1/productos/administracion"))).toBe(true);
});
