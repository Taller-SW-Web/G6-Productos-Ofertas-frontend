import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  assertRealStackPreflight,
  issueTokenFromTrustedG7,
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

  test("1. Catalog: preparar maestros en Taxonomy, crear producto BORRADOR completo via SPA, recargar, reautenticar y verificar lectura administrativa y preparación", async ({
    page,
    request,
  }) => {
    const env = assertRealStackPreflight();
    const token = await issueTokenFromTrustedG7(env.g7ApiBase, "gestor@example.test");
    const headers = {
      Authorization: `Bearer ${token}`,
      "X-Correlation-Id": randomUUID(),
      "Content-Type": "application/json",
    };

    const catSlug = `cat-ui-${randomUUID().slice(0, 6)}`;
    const catRes = await request.post(`${env.gatewayUrl}/api/v1/categorias`, {
      headers,
      data: { nombre: `Cat UI ${catSlug}`, slugConfirmado: catSlug, categoriaPadreId: null },
    });
    expect([200, 201]).toContain(catRes.status());
    const catDto = (await catRes.json()) as { categoriaId: string };
    expect(catDto.categoriaId).toBeTruthy();

    const logoPath = resolve(
      process.env.G6_BACKEND_ROOT ?? resolve(process.cwd(), "../backend"),
      "apps/taxonomy-svc/test/fixtures/logo.png",
    );
    const brandRes = await request.post(`${env.gatewayUrl}/api/v1/marcas`, {
      headers: { Authorization: `Bearer ${token}`, "X-Correlation-Id": randomUUID() },
      multipart: {
        nombre: `Marca UI ${randomUUID().slice(0, 6)}`,
        logo: { name: "logo.png", mimeType: "image/png", buffer: readFileSync(logoPath) },
      },
    });
    expect([200, 201]).toContain(brandRes.status());

    const typeRes = await request.post(`${env.gatewayUrl}/api/v1/tipos-producto`, {
      headers,
      data: { nombre: `Tipo UI ${randomUUID().slice(0, 6)}` },
    });
    expect([200, 201]).toContain(typeRes.status());

    const uniqueName = `Producto E2E ${randomUUID().slice(0, 8)}`;
    const skuBase = `SKU-UI-${randomUUID().slice(0, 6).toUpperCase()}`;
    const newBtn = page.locator('a[href="/productos/nuevo"]').first();
    await expect(newBtn).toBeVisible();
    await newBtn.click();

    await page.getByRole("textbox", { name: /nombre/i }).first().fill(uniqueName);
    const descInput = page.getByRole("textbox", { name: /descripci/i }).first();
    if (await descInput.isVisible().catch(() => false)) {
      await descInput.fill("Descripción completa de producto creada desde React E2E");
    }
    const skuInput = page.getByRole("textbox", { name: /sku/i }).first();
    if (await skuInput.isVisible().catch(() => false)) {
      await skuInput.fill(skuBase);
    }
    const priceInput = page.getByRole("spinbutton", { name: /precio/i }).first();
    if (await priceInput.isVisible().catch(() => false)) {
      await priceInput.fill("120");
    }
    for (const selectLabel of [/categor/i, /marca/i, /tipo/i]) {
      const sel = page.getByRole("combobox", { name: selectLabel }).first();
      if (await sel.isVisible().catch(() => false)) {
        await sel.click();
        const opt = page.getByRole("option").first();
        if (await opt.isVisible().catch(() => false)) {
          await opt.click();
        }
      }
    }

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

    const adminRes = await request.get(
      `${env.gatewayUrl}/api/v1/productos/administracion/${encodeURIComponent(createdDto.productId!)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(adminRes.status()).toBe(200);
    const adminDto = (await adminRes.json()) as {
      productId: string;
      estado: string;
      categoriaId: string;
    };
    expect(adminDto.productId).toBe(createdDto.productId);
    expect(adminDto.estado).toBe("BORRADOR");
    expect(adminDto.categoriaId).toBeTruthy();

    const prepRes = await request.get(
      `${env.gatewayUrl}/api/v1/productos/${encodeURIComponent(createdDto.productId!)}/preparacion`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(prepRes.status()).toBe(200);
    const prepDto = (await prepRes.json()) as {
      product_id: string;
      pricing: { status: string };
      inventario: { status: string };
    };
    expect(prepDto.product_id).toBe(createdDto.productId);
    expect(prepDto.pricing.status).toBe("PENDING");
    expect(prepDto.inventario.status).toBe("PENDING");
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

  test("3. Pricing: preprovisionar objetivo editable, verificar precio/versión anterior y posterior vía formulario real y persistencia tras recarga", async ({
    page,
    request,
  }) => {
    const env = assertRealStackPreflight();
    const token = await issueTokenFromTrustedG7(env.g7ApiBase, "gestor@example.test");
    const targetProductId = randomUUID();
    const seedPriceRes = await request.put(
      `${env.gatewayUrl}/api/v1/precios/productos/${encodeURIComponent(targetProductId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Correlation-Id": randomUUID(),
          "Idempotency-Key": randomUUID(),
          "Content-Type": "application/json",
        },
        data: { precioRegular: "80.00", currency: "PEN", motivoCambio: "SEED_E2E_PRICING" },
      },
    );
    expect([200, 201]).toContain(seedPriceRes.status());
    const initialPriceDto = (await seedPriceRes.json()) as {
      priceVersion: number;
      precioRegular: string;
    };

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
    const prodInput = page.getByRole("textbox", { name: /producto|sku/i }).first();
    if (await prodInput.isVisible().catch(() => false)) {
      await prodInput.fill(targetProductId);
    }
    const priceInput = page.getByRole("textbox").last();
    await expect(priceInput).toBeVisible();
    await priceInput.fill("99.50");

    const saveBtn = page.getByRole("button", { name: /guardar|actualizar/i }).first();
    await expect(saveBtn).toBeVisible();
    const [putRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "PUT" &&
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
    expect(dto.priceVersion).toBeGreaterThan(initialPriceDto.priceVersion);
    expect(dto.precioRegular).toBe("99.50");

    await reloadVerifySessionLostAndReauth(page);
    const persistedRes = await request.get(
      `${env.gatewayUrl}/api/v1/precios/productos/${encodeURIComponent(targetProductId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(persistedRes.status()).toBe(200);
    const persistedDto = (await persistedRes.json()) as {
      precioRegular?: string;
      priceVersion?: number;
    };
    expect(persistedDto.precioRegular).toBe("99.50");
    expect(persistedDto.priceVersion).toBe(dto.priceVersion);
  });

  test("4. Price Audit: generar cambio causal de precio, comprobar registro en auditoría, exportar CSV hasta COMPLETED y verificar contenido", async ({
    page,
    request,
  }) => {
    const env = assertRealStackPreflight();
    const token = await issueTokenFromTrustedG7(env.g7ApiBase, "gestor@example.test");
    const causalProductId = randomUUID();
    const putPriceRes = await request.put(
      `${env.gatewayUrl}/api/v1/precios/productos/${encodeURIComponent(causalProductId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Correlation-Id": randomUUID(),
          "Idempotency-Key": randomUUID(),
          "Content-Type": "application/json",
        },
        data: { precioRegular: "145.00", currency: "PEN", motivoCambio: "CAUSAL_AUDIT_E2E" },
      },
    );
    expect([200, 201]).toContain(putPriceRes.status());

    const [auditRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname.startsWith("/api/v1/auditoria-precios"),
      ),
      navigateViaSpa(page, "/precios/auditoria"),
    ]);
    expect(auditRes.status()).toBe(200);
    const auditPayload = (await auditRes.json()) as { items?: unknown[] };
    expect(Array.isArray(auditPayload.items)).toBe(true);
    expect((auditPayload.items ?? []).length).toBeGreaterThanOrEqual(1);

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

    let exportStatus = job.status ?? "";
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const pollRes = await request.get(
        `${env.gatewayUrl}/api/v1/auditoria-precios/exportaciones/${encodeURIComponent(job.exportId!)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      expect(pollRes.status()).toBe(200);
      const pollDto = (await pollRes.json()) as { status?: string };
      exportStatus = pollDto.status ?? "";
      if (exportStatus === "COMPLETED" || exportStatus === "FAILED_GENERAL") break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(exportStatus).toBe("COMPLETED");

    const downloadRes = await request.get(
      `${env.gatewayUrl}/api/v1/auditoria-precios/exportaciones/${encodeURIComponent(job.exportId!)}/archivo`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "text/csv" } },
    );
    expect(downloadRes.status()).toBe(200);
    expect(downloadRes.headers()["content-type"]).toContain("text/csv");
    const csvText = await downloadRes.text();
    expect(csvText.length).toBeGreaterThan(0);
    expect(csvText).toMatch(/sku|precio|fecha/i);
  });

  test("5. Promotions: crear promoción CUPON vigente y luego cupón asociado via SPA, recargar, reautenticar y verificar persistencia", async ({
    page,
    request,
  }) => {
    const env = assertRealStackPreflight();
    const token = await issueTokenFromTrustedG7(env.g7ApiBase, "gestor@example.test");
    const nowMs = Date.now();
    const promoRes = await request.post(`${env.gatewayUrl}/api/v1/promociones`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Correlation-Id": randomUUID(),
        "Idempotency-Key": randomUUID(),
        "Content-Type": "application/json",
      },
      data: {
        nombre: `Promo UI ${randomUUID().slice(0, 6)}`,
        tipoDescuento: "PORCENTAJE",
        valor: 15,
        modalidad: "CUPON",
        estado: "ACTIVO",
        validFrom: new Date(nowMs - 60_000).toISOString(),
        validUntil: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
        alcance: { productIds: [randomUUID()], skus: [`SKU-PROMO-${randomUUID().slice(0, 4)}`] },
        prioridad: 10,
        canalesHabilitados: ["MARKETPLACE"],
        politicaCombinacion: { ofertaPricing: true, promocionAutomatica: false, cupon: true },
      },
    });
    expect([200, 201]).toContain(promoRes.status());
    const promoDto = (await promoRes.json()) as { promotionId: string };
    expect(promoDto.promotionId).toBeTruthy();

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
    const promoSelect = page.getByRole("combobox", { name: /promoci/i }).first();
    if (await promoSelect.isVisible().catch(() => false)) {
      await promoSelect.click();
      const opt = page.getByRole("option").first();
      if (await opt.isVisible().catch(() => false)) await opt.click();
    }
    const policySelect = page.getByRole("combobox", { name: /pol[ií]tica|cancelaci/i }).first();
    if (await policySelect.isVisible().catch(() => false)) {
      await policySelect.click();
      const opt = page.getByRole("option", { name: /restaurar/i }).first();
      if (await opt.isVisible().catch(() => false)) await opt.click();
    }

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

  test("7. Combos: preprovisionar dos SKU activos con precios, crear combo via SPA con componentes y precioCombo, recargar y verificar composición", async ({
    page,
    request,
  }) => {
    const env = assertRealStackPreflight();
    const token = await issueTokenFromTrustedG7(env.g7ApiBase, "gestor@example.test");
    const headers = {
      Authorization: `Bearer ${token}`,
      "X-Correlation-Id": randomUUID(),
      "Content-Type": "application/json",
    };
    const catSlug = `cat-cmb-${randomUUID().slice(0, 6)}`;
    const catRes = await request.post(`${env.gatewayUrl}/api/v1/categorias`, {
      headers,
      data: { nombre: `Cat Combo ${catSlug}`, slugConfirmado: catSlug, categoriaPadreId: null },
    });
    expect([200, 201]).toContain(catRes.status());
    const catDto = (await catRes.json()) as { categoriaId: string };
    expect(catDto.categoriaId).toBeTruthy();
    const logoPath = resolve(
      process.env.G6_BACKEND_ROOT ?? resolve(process.cwd(), "../backend"),
      "apps/taxonomy-svc/test/fixtures/logo.png",
    );
    const brandRes = await request.post(`${env.gatewayUrl}/api/v1/marcas`, {
      headers: { Authorization: `Bearer ${token}`, "X-Correlation-Id": randomUUID() },
      multipart: {
        nombre: `Marca Combo ${randomUUID().slice(0, 6)}`,
        logo: { name: "logo.png", mimeType: "image/png", buffer: readFileSync(logoPath) },
      },
    });
    expect([200, 201]).toContain(brandRes.status());
    const brandDto = (await brandRes.json()) as { marcaId: string };
    const typeRes = await request.post(`${env.gatewayUrl}/api/v1/tipos-producto`, {
      headers,
      data: { nombre: `Tipo Combo ${randomUUID().slice(0, 6)}` },
    });
    expect([200, 201]).toContain(typeRes.status());
    const typeDto = (await typeRes.json()) as { tipoProductoId: string };

    const sku1 = `SKU-C1-${randomUUID().slice(0, 6).toUpperCase()}`;
    const sku2 = `SKU-C2-${randomUUID().slice(0, 6).toUpperCase()}`;
    const prod1 = randomUUID();
    const prod2 = randomUUID();
    for (const [productId, skuBase] of [
      [prod1, sku1],
      [prod2, sku2],
    ] as const) {
      const seedRes = await request.post(`${env.g5SeedOrigin}/__test/catalog-active-product`, {
        data: {
          productId,
          skuBase,
          categoriaId: catDto.categoriaId,
          marcaId: brandDto.marcaId,
          tipoProductoId: typeDto.tipoProductoId,
        },
      });
      expect(seedRes.status()).toBe(201);
      const priceRes = await request.put(
        `${env.gatewayUrl}/api/v1/precios/productos/${encodeURIComponent(productId)}`,
        {
          headers: { ...headers, "Idempotency-Key": randomUUID() },
          data: { precioRegular: "100.00", currency: "PEN", motivoCambio: "COMBO_E2E_SEED" },
        },
      );
      expect([200, 201]).toContain(priceRes.status());
    }

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
    await page.getByRole("textbox", { name: /nombre/i }).first().fill(comboName);
    const comboPriceInput = page.getByRole("spinbutton", { name: /precio/i }).first();
    if (await comboPriceInput.isVisible().catch(() => false)) {
      await comboPriceInput.fill("180");
    }
    const skuInputs = page.getByRole("textbox", { name: /sku/i });
    if ((await skuInputs.count()) >= 2) {
      await skuInputs.nth(0).fill(sku1);
      await skuInputs.nth(1).fill(sku2);
    }

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
    const detailDto = (await detailRes.json()) as {
      comboId?: string;
      componentes?: Array<{ sku?: string; cantidad?: number }>;
    };
    expect(detailDto.comboId).toBe(comboDto.comboId);
    expect((detailDto.componentes ?? []).length).toBeGreaterThanOrEqual(2);
    await expect(page.getByText(comboName)).toBeVisible();
  });

  test("8a. Bulk (admisión HTTP): descargar plantilla CSV, subir lote válido y verificar 202 QUEUED y persistencia inicial", async ({
    page,
    request,
  }) => {
    const env = assertRealStackPreflight();
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
    const templateCsvText = await templateRes.text();
    const templateHeaderLine = templateCsvText.replace(/^\uFEFF/, "").split(/\r?\n/)[0]?.trim();
    const expectedV2Headers =
      "operacion,producto_id,catalog_version,sku_base,sku_variante,nombre,descripcion,categoria_id,marca_id,tipo_producto_id,tiene_variantes,precio_regular,atributos_producto,atributos_variante,imagen_url,stock_inicial";
    expect(templateHeaderLine).toBe(expectedV2Headers);

    await navigateViaSpa(page, "/carga-masiva");
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached();
    const bulkRow = [
      "ALTA",
      "",
      "",
      `BULK-E2E-${randomUUID().slice(0, 6).toUpperCase()}`,
      "",
      "Producto Bulk E2E",
      "Descripcion valida para carga masiva V2",
      "cat-bulk-e2e",
      "marca-bulk-e2e",
      "tipo-bulk-e2e",
      "false",
      "25.00",
      "{}",
      "",
      "https://example.test/bulk-e2e.png",
      "10",
    ].join(",");
    const csvContent = `${templateHeaderLine}\r\n${bulkRow}\r\n`;
    await fileInput.setInputFiles({
      name: "lote-admision-e2e.csv",
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
    expect(importRes.status()).toBe(202);
    const batchDto = (await importRes.json()) as { batch_id?: string; status?: string };
    expect(batchDto.batch_id).toBeTruthy();
    expect(batchDto.status).toBe("QUEUED");

    const token = await issueTokenFromTrustedG7(env.g7ApiBase, "gestor@example.test");
    const initialRes = await request.get(
      `${env.gatewayUrl}/api/v1/carga-masiva/productos/importaciones/${encodeURIComponent(batchDto.batch_id!)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(initialRes.status()).toBe(200);
    const initialSnap = (await initialRes.json()) as {
      batch_id?: string;
      status?: string;
      total_rows?: number;
      rows?: Array<{ row_id?: string; status?: string }>;
    };
    expect(initialSnap.batch_id).toBe(batchDto.batch_id);
    expect(["QUEUED", "PROCESSING", "COMPLETED"]).toContain(initialSnap.status);
    expect(initialSnap.total_rows).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(initialSnap.rows)).toBe(true);
    expect((initialSnap.rows ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test("8b. Bulk (procesamiento integral con mensajería): exige COMPLETED, conteo íntegro de filas, cero errores y sin conciliación pendiente", async ({
    page,
    request,
  }) => {
    test.skip(
      process.env.G6_BULK_INTEGRAL_BUS_ENABLED !== "1",
      "Requiere laboratorio con transporte aislado operativo para Bulk<->Catalog (no Azure Chile ni RabbitMQ productivo).",
    );
    const env = assertRealStackPreflight();
    await navigateViaSpa(page, "/carga-masiva");
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached();
    const v2Headers =
      "operacion,producto_id,catalog_version,sku_base,sku_variante,nombre,descripcion,categoria_id,marca_id,tipo_producto_id,tiene_variantes,precio_regular,atributos_producto,atributos_variante,imagen_url,stock_inicial";
    const integralRow = [
      "ALTA",
      "",
      "",
      `BULK-E2E-INT-${randomUUID().slice(0, 6).toUpperCase()}`,
      "",
      "Prod Bulk Integral",
      "Descripcion valida para procesamiento integral V2",
      "cat-bulk-e2e",
      "marca-bulk-e2e",
      "tipo-bulk-e2e",
      "false",
      "25.00",
      "{}",
      "",
      "https://example.test/bulk-integral-e2e.png",
      "10",
    ].join(",");
    const csvContent = `${v2Headers}\r\n${integralRow}\r\n`;
    await fileInput.setInputFiles({
      name: "lote-integral-e2e.csv",
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
    expect(importRes.status()).toBe(202);
    const batchDto = (await importRes.json()) as { batch_id?: string; status?: string };
    expect(batchDto.batch_id).toBeTruthy();
    expect(batchDto.status).toBe("QUEUED");

    const token = await issueTokenFromTrustedG7(env.g7ApiBase, "gestor@example.test");
    let batchSnapshot: {
      batch_id?: string;
      status?: string;
      total_rows?: number;
      completed_rows?: number;
      failed_rows?: number;
      needs_reconciliation?: boolean;
      rows?: Array<{ row_id?: string; status?: string }>;
    } = {};
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const pollRes = await request.get(
        `${env.gatewayUrl}/api/v1/carga-masiva/productos/importaciones/${encodeURIComponent(batchDto.batch_id!)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      expect(pollRes.status()).toBe(200);
      batchSnapshot = (await pollRes.json()) as typeof batchSnapshot;
      if (batchSnapshot.status === "COMPLETED" || batchSnapshot.status === "FAILED_GENERAL") {
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(batchSnapshot.batch_id).toBe(batchDto.batch_id);
    expect(batchSnapshot.status).toBe("COMPLETED");
    expect(batchSnapshot.total_rows).toBeGreaterThanOrEqual(1);
    expect(batchSnapshot.completed_rows).toBe(batchSnapshot.total_rows);
    expect(batchSnapshot.failed_rows).toBe(0);
    expect(batchSnapshot.needs_reconciliation).toBe(false);
    expect(Array.isArray(batchSnapshot.rows)).toBe(true);
    expect((batchSnapshot.rows ?? []).length).toBe(batchSnapshot.total_rows);
    expect(batchSnapshot.rows?.[0]?.status).toBe("COMPLETED");
  });

  test("8c. Bulk (CSV inválido): falla de forma explícita (400/422 o FAILED_GENERAL separado del caso positivo)", async ({
    page,
    request,
  }) => {
    const env = assertRealStackPreflight();
    await navigateViaSpa(page, "/carga-masiva");
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached();
    const invalidCsv = "columna_invalida\nvalor_invalido\n";
    await fileInput.setInputFiles({
      name: "lote-invalido-e2e.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(invalidCsv, "utf8"),
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
    if (importRes.status() === 202) {
      const batchDto = (await importRes.json()) as { batch_id?: string };
      expect(batchDto.batch_id).toBeTruthy();
      const token = await issueTokenFromTrustedG7(env.g7ApiBase, "gestor@example.test");
      let snap: { status?: string; failed_rows?: number } = {};
      for (let attempt = 0; attempt < 25; attempt += 1) {
        const pollRes = await request.get(
          `${env.gatewayUrl}/api/v1/carga-masiva/productos/importaciones/${encodeURIComponent(batchDto.batch_id!)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        expect(pollRes.status()).toBe(200);
        snap = (await pollRes.json()) as typeof snap;
        if (snap.status === "COMPLETED" || snap.status === "FAILED_GENERAL") break;
        await new Promise((r) => setTimeout(r, 250));
      }
      expect(snap.status).toBe("FAILED_GENERAL");
    } else {
      expect([400, 422]).toContain(importRes.status());
    }
  });
});
