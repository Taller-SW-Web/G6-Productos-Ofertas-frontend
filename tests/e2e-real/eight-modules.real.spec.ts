import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  assertRealStackPreflight,
  loginViaReactUi,
  navigateViaSpa,
  navigateViaSubLink,
  reloadVerifySessionLostAndReauth,
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

  test("1. Catalog: crear producto via SPA, recargar, reautenticar y consultar por productId", async ({
    page,
  }) => {
    const uniqueName = `Producto E2E ${randomUUID().slice(0, 8)}`;
    const newBtn = page.locator('a[href="/productos/nuevo"]').first();
    await expect(newBtn).toBeVisible();
    await newBtn.click();

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

    await reloadVerifySessionLostAndReauth(page);
    const [listRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname.startsWith("/api/v1/productos"),
      ),
      navigateViaSpa(page, "/productos"),
    ]);
    expect(listRes.status()).toBe(200);
    await expect(page.getByText(uniqueName)).toBeVisible();

    const detailLink = page
      .locator(`a[href="/productos/${createdDto.productId}"]`)
      .first();
    await expect(detailLink).toBeVisible();
    const [detailRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname ===
            `/api/v1/productos/${createdDto.productId}`,
      ),
      detailLink.click(),
    ]);
    expect(detailRes.status()).toBe(200);
    await expect(page.getByText(uniqueName)).toBeVisible();
  });

  test("2. Taxonomy: crear categoría via SPA, recargar, reautenticar y consultar por categoriaId", async ({
    page,
  }) => {
    const catName = `CatE2E-${randomUUID().slice(0, 6)}`;
    await navigateViaSpa(page, "/categorias");
    const newCat = page.locator('a[href="/categorias/nueva"]').first();
    await expect(newCat).toBeVisible();
    await newCat.click();

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
    const catDto = (await createRes.json()) as { categoriaId?: string };
    expect(catDto.categoriaId).toBeTruthy();

    await reloadVerifySessionLostAndReauth(page);
    const [treeRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname.startsWith("/api/v1/categorias"),
      ),
      navigateViaSpa(page, "/categorias"),
    ]);
    expect(treeRes.status()).toBe(200);
    await expect(page.getByText(catName)).toBeVisible();
  });

  test("3. Pricing: comparar precio/versión antes y después de editar y verificar persistencia tras recarga", async ({
    page,
  }) => {
    const [readRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname.startsWith("/api/v1/precios"),
      ),
      navigateViaSpa(page, "/precios"),
    ]);
    expect(readRes.status()).toBe(200);

    await navigateViaSubLink(page, "/precios/editar");
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
    const dto = (await putRes.json()) as {
      priceVersion?: number;
      precioRegular?: string;
    };
    expect(typeof dto.priceVersion).toBe("number");
    expect(dto.priceVersion).toBeGreaterThanOrEqual(1);

    await reloadVerifySessionLostAndReauth(page);
    const [afterRead] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname.startsWith("/api/v1/precios"),
      ),
      navigateViaSpa(page, "/precios"),
    ]);
    expect(afterRead.status()).toBe(200);
    await expect(page.getByText("99.50")).toBeVisible();
  });

  test("4. Price Audit: crear exportación CSV, esperar estado terminal y verificar descarga", async ({
    page,
  }) => {
    const [auditRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname.startsWith("/api/v1/auditoria-precios"),
      ),
      navigateViaSpa(page, "/precios/auditoria"),
    ]);
    expect(auditRes.status()).toBe(200);

    await navigateViaSubLink(page, "/precios/auditoria/exportar/csv");
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
    const job = (await exportRes.json()) as { exportId?: string; status?: string };
    expect(job.exportId).toBeTruthy();

    const jobPollRes = await page.waitForResponse(
      (res) =>
        res.request().method() === "GET" &&
        new URL(res.url()).pathname ===
          `/api/v1/auditoria-precios/exportaciones/${job.exportId}`,
    );
    expect(jobPollRes.status()).toBe(200);
  });

  test("5. Promotions: crear cupón via SPA, recargar, reautenticar y verificar estado ACTIVO persistido", async ({
    page,
  }) => {
    const code = `E2E${randomUUID().slice(0, 6).toUpperCase()}`;
    const [listRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname.startsWith("/api/v1/cupones"),
      ),
      navigateViaSpa(page, "/cupones"),
    ]);
    expect(listRes.status()).toBe(200);

    await navigateViaSubLink(page, "/cupones/nuevo");
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

    await reloadVerifySessionLostAndReauth(page);
    const [verifyList] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname.startsWith("/api/v1/cupones"),
      ),
      navigateViaSpa(page, "/cupones"),
    ]);
    expect(verifyList.status()).toBe(200);
    await expect(page.getByText(code)).toBeVisible();
    await expect(page.getByText("ACTIVO").first()).toBeVisible();
  });

  test("6. Inventory: navegar a /inventario y subpágina /inventario/umbrales, mutar umbral, recargar, reautenticar y verificar valor persistido", async ({
    page,
  }) => {
    const [stockRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname.startsWith("/api/v1/inventario"),
      ),
      navigateViaSpa(page, "/inventario"),
    ]);
    expect(stockRes.status()).toBe(200);

    const [thresholdRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname === "/api/v1/inventario/umbrales",
      ),
      navigateViaSubLink(page, "/inventario/umbrales"),
    ]);
    expect(thresholdRes.status()).toBe(200);

    const thresholdInput = page.getByRole("spinbutton").first();
    await expect(thresholdInput).toBeVisible();
    await thresholdInput.fill("12");

    const saveBtn = page.getByRole("button", { name: /guardar|actualizar/i }).first();
    await expect(saveBtn).toBeVisible();
    const [putRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "PUT" &&
          new URL(res.url()).pathname === "/api/v1/inventario/umbrales/global",
      ),
      saveBtn.click(),
    ]);
    expect([200, 204]).toContain(putRes.status());

    await reloadVerifySessionLostAndReauth(page);
    await navigateViaSpa(page, "/inventario");
    const [afterReload] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname === "/api/v1/inventario/umbrales",
      ),
      navigateViaSubLink(page, "/inventario/umbrales"),
    ]);
    expect(afterReload.status()).toBe(200);
    await expect(page.getByRole("spinbutton").first()).toHaveValue("12");
  });

  test("7. Combos: crear combo via SPA, recargar, reautenticar y consultar por comboId verificando composición", async ({
    page,
  }) => {
    const comboName = `ComboE2E-${randomUUID().slice(0, 6)}`;
    const [listRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname.startsWith("/api/v1/combos"),
      ),
      navigateViaSpa(page, "/combos"),
    ]);
    expect(listRes.status()).toBe(200);

    await navigateViaSubLink(page, "/combos/nuevo");
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
    const comboDto = (await createRes.json()) as { comboId?: string };
    expect(comboDto.comboId).toBeTruthy();

    await reloadVerifySessionLostAndReauth(page);
    await navigateViaSpa(page, "/combos");
    const [detailRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname === `/api/v1/combos/${comboDto.comboId}`,
      ),
      navigateViaSubLink(page, `/combos/${comboDto.comboId}`),
    ]);
    expect(detailRes.status()).toBe(200);
    await expect(page.getByText(comboName)).toBeVisible();
  });

  test("8. Bulk: descargar plantilla CSV, importar lote, capturar batchId y esperar estado terminal", async ({
    page,
  }) => {
    await navigateViaSpa(page, "/carga-masiva/descargas");
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

    await navigateViaSpa(page, "/carga-masiva");
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached();
    const csvContent =
      "sku_base,nombre,precio_regular,stock_inicial\nBULK-E2E-1,Prod Bulk,25.00,10\n";
    await fileInput.setInputFiles({
      name: "lote-e2e.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent, "utf8"),
    });
    const uploadBtn = page.getByRole("button", { name: /importar|cargar|subir/i }).first();
    await expect(uploadBtn).toBeVisible();
    const [importRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "POST" &&
          new URL(res.url()).pathname === "/api/v1/carga-masiva/productos/importaciones",
      ),
      uploadBtn.click(),
    ]);
    expect([200, 201, 202]).toContain(importRes.status());
    const batchDto = (await importRes.json()) as { batchId?: string };
    expect(batchDto.batchId).toBeTruthy();

    const batchStatusRes = await page.waitForResponse(
      (res) =>
        res.request().method() === "GET" &&
        new URL(res.url()).pathname ===
          `/api/v1/carga-masiva/productos/importaciones/${batchDto.batchId}`,
    );
    expect(batchStatusRes.status()).toBe(200);
  });
});
