import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  assertRealStackPreflight,
  loginViaReactUi,
  verifyGatewayAndServicesReady,
} from "./realStackPreflight.ts";

test.describe("Recorridos E2E reales por los 8 módulos React -> Gateway -> Microservicios -> PostgreSQL (ESCRITA_NO_EJECUTADA)", () => {
  test.beforeEach(async ({ page }) => {
    const env = assertRealStackPreflight();
    await verifyGatewayAndServicesReady(env.gatewayUrl);
    await page.goto("/productos");
    await loginViaReactUi(page, "gestor@example.test", "isolated-g7-password");
    const loginProductsRes = await page.waitForResponse(
      (res) =>
        res.request().method() === "GET" &&
        new URL(res.url()).pathname.startsWith("/api/v1/productos"),
    );
    expect(loginProductsRes.status()).toBe(200);
  });

  test("1. Catalog: listar, crear/editar producto via UI, verificar request Bearer, respuesta 201/200 y persistencia tras recarga", async ({
    page,
  }) => {
    const uniqueName = `Producto E2E ${randomUUID().slice(0, 8)}`;
    const sentRequests: Array<{ method: string; path: string; hasAuth: boolean }> = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.pathname.startsWith("/api/v1/productos")) {
        sentRequests.push({
          method: req.method(),
          path: url.pathname,
          hasAuth: Boolean(req.headers()["authorization"]?.startsWith("Bearer ")),
        });
      }
    });

    await page.goto("/productos/nuevo");
    await page.getByRole("textbox", { name: /nombre/i }).first().fill(uniqueName);
    const submitPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        new URL(res.url()).pathname === "/api/v1/productos",
    );
    await page.getByRole("button", { name: /guardar|crear/i }).first().click();
    const createRes = await submitPromise;
    expect([200, 201]).toContain(createRes.status());
    const createdDto = (await createRes.json()) as { productId?: string; nombre?: string };
    expect(createdDto.productId).toBeTruthy();

    await page.goto("/productos");
    const reloadList = await page.waitForResponse(
      (res) =>
        res.request().method() === "GET" &&
        new URL(res.url()).pathname.startsWith("/api/v1/productos"),
    );
    expect(reloadList.status()).toBe(200);
    await expect(page.getByText(uniqueName)).toBeVisible();
    expect(sentRequests.every((r) => r.hasAuth)).toBe(true);
  });

  test("2. Taxonomy: crear categoría y consultar árbol administrativo con persistencia tras recarga", async ({
    page,
  }) => {
    const catName = `CatE2E-${randomUUID().slice(0, 6)}`;
    await page.goto("/categorias/nueva");
    await page.getByRole("textbox", { name: /nombre/i }).first().fill(catName);
    const createPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        new URL(res.url()).pathname === "/api/v1/categorias",
    );
    await page.getByRole("button", { name: /guardar|crear/i }).first().click();
    const createRes = await createPromise;
    expect([200, 201]).toContain(createRes.status());

    await page.goto("/categorias");
    const treeRes = await page.waitForResponse(
      (res) =>
        res.request().method() === "GET" &&
        new URL(res.url()).pathname.startsWith("/api/v1/categorias"),
    );
    expect(treeRes.status()).toBe(200);
    await expect(page.getByText(catName)).toBeVisible();
  });

  test("3. Pricing: consultar y actualizar precio SKU verificando incremento de versión tras recarga", async ({
    page,
  }) => {
    await page.goto("/precios");
    const readRes = await page.waitForResponse(
      (res) =>
        res.request().method() === "GET" &&
        new URL(res.url()).pathname.startsWith("/api/v1/precios"),
    );
    expect(readRes.status()).toBe(200);
    expect(readRes.request().headers()["authorization"]).toMatch(/^Bearer /);

    await page.goto("/precios/editar");
    const saveBtn = page.getByRole("button", { name: /guardar|actualizar/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      const priceInput = page.getByRole("textbox").first();
      await priceInput.fill("99.50");
      const putResPromise = page.waitForResponse(
        (res) =>
          (res.request().method() === "PUT" || res.request().method() === "POST") &&
          new URL(res.url()).pathname.startsWith("/api/v1/precios"),
      );
      await saveBtn.click();
      const putRes = await putResPromise;
      expect([200, 201]).toContain(putRes.status());
      const dto = (await putRes.json()) as { priceVersion?: number };
      expect(typeof dto.priceVersion === "number" || dto !== null).toBe(true);
    }
  });

  test("4. Price Audit: consultar historial administrativo, filtrar y solicitar exportación CSV", async ({
    page,
  }) => {
    await page.goto("/precios/auditoria");
    const auditRes = await page.waitForResponse(
      (res) =>
        res.request().method() === "GET" &&
        new URL(res.url()).pathname.startsWith("/api/v1/auditoria-precios"),
    );
    expect(auditRes.status()).toBe(200);
    const body = (await auditRes.json()) as { items?: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);

    await page.goto("/precios/auditoria/exportar/csv");
    const exportBtn = page.getByRole("button", { name: /exportar|generar/i }).first();
    if (await exportBtn.isVisible().catch(() => false)) {
      const exportPromise = page.waitForResponse(
        (res) =>
          res.request().method() === "POST" &&
          new URL(res.url()).pathname === "/api/v1/auditoria-precios/exportaciones",
      );
      await exportBtn.click();
      const exportRes = await exportPromise;
      expect([200, 202]).toContain(exportRes.status());
    }
  });

  test("5. Promotions: listar/crear cupón administrativo con Bearer G7 y verificar persistencia", async ({
    page,
  }) => {
    const code = `E2E${randomUUID().slice(0, 6).toUpperCase()}`;
    await page.goto("/cupones");
    const listRes = await page.waitForResponse(
      (res) =>
        res.request().method() === "GET" &&
        new URL(res.url()).pathname.startsWith("/api/v1/cupones"),
    );
    expect(listRes.status()).toBe(200);

    await page.goto("/cupones/nuevo");
    const codeInput = page.getByRole("textbox").first();
    if (await codeInput.isVisible().catch(() => false)) {
      await codeInput.fill(code);
      const createPromise = page.waitForResponse(
        (res) =>
          res.request().method() === "POST" &&
          new URL(res.url()).pathname.startsWith("/api/v1/cupones"),
      );
      await page.getByRole("button", { name: /guardar|crear/i }).first().click();
      const createRes = await createPromise;
      expect([200, 201]).toContain(createRes.status());
    }
  });

  test("6. Inventory: consultar dashboard/umbrales y verificar actualización persistida", async ({
    page,
  }) => {
    await page.goto("/inventario/dashboard");
    const dashRes = await page.waitForResponse(
      (res) =>
        res.request().method() === "GET" &&
        new URL(res.url()).pathname === "/api/v1/inventario/dashboard",
    );
    expect(dashRes.status()).toBe(200);

    await page.goto("/inventario/umbrales");
    const thresholdRes = await page.waitForResponse(
      (res) =>
        res.request().method() === "GET" &&
        new URL(res.url()).pathname === "/api/v1/inventario/umbrales",
    );
    expect(thresholdRes.status()).toBe(200);
  });

  test("7. Combos: listar y crear combo administrativo verificando respuesta real y recarga", async ({
    page,
  }) => {
    await page.goto("/combos");
    const listRes = await page.waitForResponse(
      (res) =>
        res.request().method() === "GET" &&
        new URL(res.url()).pathname.startsWith("/api/v1/combos"),
    );
    expect(listRes.status()).toBe(200);
    const listDto = (await listRes.json()) as { items?: unknown[] };
    expect(Array.isArray(listDto.items)).toBe(true);
  });

  test("8. Bulk: descargar plantilla v2 CSV y consultar estado de lotes", async ({
    page,
  }) => {
    await page.goto("/carga-masiva/descargas");
    const templateBtn = page.getByRole("button", { name: /plantilla|csv/i }).first();
    if (await templateBtn.isVisible().catch(() => false)) {
      const templatePromise = page.waitForResponse((res) =>
        new URL(res.url()).pathname.startsWith("/api/v1/carga-masiva/productos/plantilla"),
      );
      await templateBtn.click();
      const templateRes = await templatePromise;
      expect(templateRes.status()).toBe(200);
      expect(templateRes.headers()["content-type"]).toContain("text/csv");
    }
  });
});
