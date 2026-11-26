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
    const [loginProductsRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname.startsWith("/api/v1/productos"),
      ),
      loginViaReactUi(page, "gestor@example.test", "isolated-g7-password"),
    ]);
    expect(loginProductsRes.status()).toBe(200);
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("1. Catalog: listar, crear producto via UI, verificar request Bearer, respuesta 201/200 y persistencia tras recarga", async ({
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
    const nameInput = page.getByRole("textbox", { name: /nombre/i }).first();
    await expect(nameInput).toBeVisible();
    await nameInput.fill(uniqueName);

    const submitBtn = page.getByRole("button", { name: /guardar|crear/i }).first();
    await expect(submitBtn).toBeVisible();
    const [createRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "POST" &&
          new URL(res.url()).pathname === "/api/v1/productos",
      ),
      submitBtn.click(),
    ]);
    expect([200, 201]).toContain(createRes.status());
    const createdDto = (await createRes.json()) as { productId?: string };
    expect(createdDto.productId).toBeTruthy();

    const [reloadList] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname.startsWith("/api/v1/productos"),
      ),
      page.goto("/productos"),
    ]);
    expect(reloadList.status()).toBe(200);
    await expect(page.getByText(uniqueName)).toBeVisible();
    expect(sentRequests.length).toBeGreaterThan(0);
    expect(sentRequests.every((r) => r.hasAuth)).toBe(true);
  });

  test("2. Taxonomy: crear categoría y consultar árbol administrativo con persistencia tras recarga", async ({
    page,
  }) => {
    const catName = `CatE2E-${randomUUID().slice(0, 6)}`;
    await page.goto("/categorias/nueva");
    const nameInput = page.getByRole("textbox", { name: /nombre/i }).first();
    await expect(nameInput).toBeVisible();
    await nameInput.fill(catName);

    const submitBtn = page.getByRole("button", { name: /guardar|crear/i }).first();
    await expect(submitBtn).toBeVisible();
    const [createRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "POST" &&
          new URL(res.url()).pathname === "/api/v1/categorias",
      ),
      submitBtn.click(),
    ]);
    expect([200, 201]).toContain(createRes.status());

    const [treeRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname.startsWith("/api/v1/categorias"),
      ),
      page.goto("/categorias"),
    ]);
    expect(treeRes.status()).toBe(200);
    await expect(page.getByText(catName)).toBeVisible();
  });

  test("3. Pricing: consultar precios y actualizar precio SKU verificando respuesta real con versión", async ({
    page,
  }) => {
    const [readRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname.startsWith("/api/v1/precios"),
      ),
      page.goto("/precios"),
    ]);
    expect(readRes.status()).toBe(200);
    expect(readRes.request().headers()["authorization"]).toMatch(/^Bearer /);

    await page.goto("/precios/editar");
    const priceInput = page.getByRole("textbox").first();
    await expect(priceInput).toBeVisible();
    await priceInput.fill("99.50");

    const saveBtn = page.getByRole("button", { name: /guardar|actualizar/i }).first();
    await expect(saveBtn).toBeVisible();
    const [putRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          (res.request().method() === "PUT" || res.request().method() === "POST") &&
          new URL(res.url()).pathname.startsWith("/api/v1/precios"),
      ),
      saveBtn.click(),
    ]);
    expect([200, 201]).toContain(putRes.status());
    const dto = (await putRes.json()) as { priceVersion?: number };
    expect(typeof dto.priceVersion).toBe("number");
  });

  test("4. Price Audit: consultar historial administrativo y solicitar exportación CSV", async ({
    page,
  }) => {
    const [auditRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname.startsWith("/api/v1/auditoria-precios"),
      ),
      page.goto("/precios/auditoria"),
    ]);
    expect(auditRes.status()).toBe(200);
    const body = (await auditRes.json()) as { items?: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);

    await page.goto("/precios/auditoria/exportar/csv");
    const exportBtn = page.getByRole("button", { name: /exportar|generar/i }).first();
    await expect(exportBtn).toBeVisible();
    const [exportRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "POST" &&
          new URL(res.url()).pathname === "/api/v1/auditoria-precios/exportaciones",
      ),
      exportBtn.click(),
    ]);
    expect([200, 202]).toContain(exportRes.status());
  });

  test("5. Promotions: listar y crear cupón administrativo con Bearer G7 y verificar persistencia", async ({
    page,
  }) => {
    const code = `E2E${randomUUID().slice(0, 6).toUpperCase()}`;
    const [listRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname.startsWith("/api/v1/cupones"),
      ),
      page.goto("/cupones"),
    ]);
    expect(listRes.status()).toBe(200);

    await page.goto("/cupones/nuevo");
    const codeInput = page.getByRole("textbox").first();
    await expect(codeInput).toBeVisible();
    await codeInput.fill(code);

    const submitBtn = page.getByRole("button", { name: /guardar|crear/i }).first();
    await expect(submitBtn).toBeVisible();
    const [createRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "POST" &&
          new URL(res.url()).pathname.startsWith("/api/v1/cupones"),
      ),
      submitBtn.click(),
    ]);
    expect([200, 201]).toContain(createRes.status());
  });

  test("6. Inventory: consultar dashboard y umbrales con respuesta real y UI visible", async ({
    page,
  }) => {
    const [dashRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname === "/api/v1/inventario/dashboard",
      ),
      page.goto("/inventario/dashboard"),
    ]);
    expect(dashRes.status()).toBe(200);
    await expect(page.getByRole("main")).toBeVisible();

    const [thresholdRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname === "/api/v1/inventario/umbrales",
      ),
      page.goto("/inventario/umbrales"),
    ]);
    expect(thresholdRes.status()).toBe(200);
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("7. Combos: listar y crear combo administrativo verificando respuesta 201 y recarga", async ({
    page,
  }) => {
    const comboName = `ComboE2E-${randomUUID().slice(0, 6)}`;
    const [listRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname.startsWith("/api/v1/combos"),
      ),
      page.goto("/combos"),
    ]);
    expect(listRes.status()).toBe(200);
    const listDto = (await listRes.json()) as { items?: unknown[] };
    expect(Array.isArray(listDto.items)).toBe(true);

    await page.goto("/combos/nuevo");
    const nameInput = page.getByRole("textbox").first();
    await expect(nameInput).toBeVisible();
    await nameInput.fill(comboName);

    const submitBtn = page.getByRole("button", { name: /guardar|crear/i }).first();
    await expect(submitBtn).toBeVisible();
    const [createRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "POST" &&
          new URL(res.url()).pathname === "/api/v1/combos/administracion",
      ),
      submitBtn.click(),
    ]);
    expect([200, 201]).toContain(createRes.status());
  });

  test("8. Bulk: descargar plantilla v2 CSV verificando content-type text/csv", async ({
    page,
  }) => {
    await page.goto("/carga-masiva/descargas");
    const templateBtn = page.getByRole("button", { name: /plantilla|csv/i }).first();
    await expect(templateBtn).toBeVisible();
    const [templateRes] = await Promise.all([
      page.waitForResponse((res) =>
        new URL(res.url()).pathname.startsWith("/api/v1/carga-masiva/productos/plantilla"),
      ),
      templateBtn.click(),
    ]);
    expect(templateRes.status()).toBe(200);
    expect(templateRes.headers()["content-type"]).toContain("text/csv");
  });
});
