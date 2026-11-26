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
    const catName = `Cat UI ${catSlug}`;
    const catRes = await request.post(`${env.gatewayUrl}/api/v1/categorias`, {
      headers,
      data: { nombre: catName, slugConfirmado: catSlug, categoriaPadreId: null },
    });
    expect([200, 201]).toContain(catRes.status());
    const catDto = (await catRes.json()) as { categoriaId: string };
    expect(catDto.categoriaId).toBeTruthy();

    const logoPath = resolve(
      process.env.G6_BACKEND_ROOT ?? resolve(process.cwd(), "../backend"),
      "apps/taxonomy-svc/test/fixtures/logo.png",
    );
    const brandName = `Marca UI ${randomUUID().slice(0, 6)}`;
    const brandRes = await request.post(`${env.gatewayUrl}/api/v1/marcas`, {
      headers: { Authorization: `Bearer ${token}`, "X-Correlation-Id": randomUUID() },
      multipart: {
        nombre: brandName,
        logo: { name: "logo.png", mimeType: "image/png", buffer: readFileSync(logoPath) },
      },
    });
    expect([200, 201]).toContain(brandRes.status());
    const brandDto = (await brandRes.json()) as { marcaId: string };
    expect(brandDto.marcaId).toBeTruthy();

    const typeName = `Tipo UI ${randomUUID().slice(0, 6)}`;
    const typeRes = await request.post(`${env.gatewayUrl}/api/v1/tipos-producto`, {
      headers,
      data: { nombre: typeName },
    });
    expect([200, 201]).toContain(typeRes.status());
    const typeDto = (await typeRes.json()) as { tipoProductoId: string };
    expect(typeDto.tipoProductoId).toBeTruthy();

    const uniqueName = `Producto E2E ${randomUUID().slice(0, 8)}`;
    const skuBase = `SKU-UI-${randomUUID().slice(0, 6).toUpperCase()}`;
    const newBtn = page.locator('a[href="/productos/nuevo"]').first();
    await expect(newBtn).toBeVisible();
    await newBtn.click();

    const nameField = page.getByRole("textbox", { name: /nombre/i }).first();
    await expect(nameField).toBeVisible();
    await nameField.fill(uniqueName);

    const descInput = page.getByRole("textbox", { name: /descripci/i }).first();
    await expect(descInput).toBeVisible();
    await descInput.fill("Descripción completa de producto creada desde React E2E");

    const skuInput = page.getByRole("textbox", { name: /sku/i }).first();
    await expect(skuInput).toBeVisible();
    await skuInput.fill(skuBase);

    const priceInput = page.getByRole("spinbutton", { name: /precio/i }).first();
    await expect(priceInput).toBeVisible();
    await priceInput.fill("120");

    for (const [selectLabel, optionLabel] of [
      [/categor/i, catName],
      [/marca/i, brandName],
      [/tipo/i, typeName],
    ] as const) {
      const sel = page.getByRole("combobox", { name: selectLabel }).first();
      await expect(sel).toBeVisible();
      await sel.click();
      const opt = page.getByRole("option", { name: optionLabel, exact: true }).first();
      await expect(opt).toBeVisible();
      await opt.click();
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

  test("3. Pricing: preprovisionar producto ACTIVO y definición vigente, editar vía PriceEditForm + ConfirmDialog (PATCH) y verificar persistencia tras recarga", async ({
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

    const catSlug = `cat-prc-${randomUUID().slice(0, 6)}`;
    const catRes = await request.post(`${env.gatewayUrl}/api/v1/categorias`, {
      headers,
      data: { nombre: `Cat Prc ${catSlug}`, slugConfirmado: catSlug, categoriaPadreId: null },
    });
    expect([200, 201]).toContain(catRes.status());
    const catDto = (await catRes.json()) as { categoriaId: string };
    const logoPath = resolve(
      process.env.G6_BACKEND_ROOT ?? resolve(process.cwd(), "../backend"),
      "apps/taxonomy-svc/test/fixtures/logo.png",
    );
    const brandRes = await request.post(`${env.gatewayUrl}/api/v1/marcas`, {
      headers: { Authorization: `Bearer ${token}`, "X-Correlation-Id": randomUUID() },
      multipart: {
        nombre: `Marca Prc ${randomUUID().slice(0, 6)}`,
        logo: { name: "logo.png", mimeType: "image/png", buffer: readFileSync(logoPath) },
      },
    });
    expect([200, 201]).toContain(brandRes.status());
    const brandDto = (await brandRes.json()) as { marcaId: string };
    const typeRes = await request.post(`${env.gatewayUrl}/api/v1/tipos-producto`, {
      headers,
      data: { nombre: `Tipo Prc ${randomUUID().slice(0, 6)}` },
    });
    expect([200, 201]).toContain(typeRes.status());
    const typeDto = (await typeRes.json()) as { tipoProductoId: string };

    const targetProductId = randomUUID();
    const targetSku = `SKU-PRC-${randomUUID().slice(0, 6).toUpperCase()}`;
    const seedProd = await request.post(`${env.g5SeedOrigin}/__test/catalog-active-product`, {
      data: {
        productId: targetProductId,
        skuBase: targetSku,
        categoriaId: catDto.categoriaId,
        marcaId: brandDto.marcaId,
        tipoProductoId: typeDto.tipoProductoId,
      },
    });
    expect(seedProd.status()).toBe(201);

    const seedPriceRes = await request.patch(
      `${env.gatewayUrl}/api/v1/precios/productos/${encodeURIComponent(targetProductId)}`,
      {
        headers: { ...headers, "Idempotency-Key": randomUUID() },
        data: {
          accionPrecioOferta: "CONSERVAR",
          priceVersion: 0,
          precioRegular: 80,
          moneda: "PEN",
          motivoCambio: "SEED_E2E_PRICING",
        },
      },
    );
    expect(seedPriceRes.status()).toBe(200);
    const initialPriceDto = (await seedPriceRes.json()) as {
      product_id: string;
      price_version: number;
      precio_regular: string;
      channel_id: string | null;
    };
    expect(initialPriceDto.product_id).toBe(targetProductId);
    expect(initialPriceDto.precio_regular).toBe("80.00");

    await navigateViaSpa(page, "/precios");
    await navigateViaSubLink(
      page,
      `/precios/editar?targetId=${encodeURIComponent(targetProductId)}&channel=global&scope=product`,
    );

    const regularInput = page.getByLabel(/nuevo precio regular/i).first();
    await expect(regularInput).toBeVisible();
    await regularInput.fill("99.50");

    const reasonInput = page.getByLabel(/motivo del cambio/i).first();
    await expect(reasonInput).toBeVisible();
    await reasonInput.fill("Ajuste E2E Pricing");

    const saveBtn = page.getByRole("button", { name: "Guardar cambios", exact: true }).first();
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    const confirmBtn = page
      .getByRole("dialog", { name: /confirmar cambio de precio/i })
      .getByRole("button", { name: "Confirmar cambio de precio", exact: true });
    await expect(confirmBtn).toBeVisible();

    const [patchRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "PATCH" &&
          new URL(res.url()).pathname === `/api/v1/precios/productos/${targetProductId}`,
      ),
      confirmBtn.click(),
    ]);
    expect(patchRes.status()).toBe(200);
    const dto = (await patchRes.json()) as {
      product_id: string;
      price_version: number;
      precio_regular: string;
      channel_id: string | null;
    };
    expect(dto.product_id).toBe(targetProductId);
    expect(dto.price_version).toBeGreaterThan(initialPriceDto.price_version);
    expect(dto.precio_regular).toBe("99.50");

    await reloadVerifySessionLostAndReauth(page);
    const persistedRes = await request.get(
      `${env.gatewayUrl}/api/v1/precios/productos/${encodeURIComponent(targetProductId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(persistedRes.status()).toBe(200);
    const persistedDto = (await persistedRes.json()) as {
      precioRegular?: string;
      precio_regular?: string;
      priceVersion?: number;
      price_version?: number;
    };
    expect(persistedDto.precio_regular ?? persistedDto.precioRegular).toBe("99.50");
    expect(persistedDto.price_version ?? persistedDto.priceVersion).toBe(dto.price_version);
  });

  test("4. Price Audit: cambio causal en Pricing -> Service Bus aislado -> Price Audit, exportar CSV hasta COMPLETED y verificar contenido", async ({
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

    const catSlug = `cat-aud-${randomUUID().slice(0, 6)}`;
    const catRes = await request.post(`${env.gatewayUrl}/api/v1/categorias`, {
      headers,
      data: { nombre: `Cat Aud ${catSlug}`, slugConfirmado: catSlug, categoriaPadreId: null },
    });
    expect([200, 201]).toContain(catRes.status());
    const catDto = (await catRes.json()) as { categoriaId: string };
    const logoPath = resolve(
      process.env.G6_BACKEND_ROOT ?? resolve(process.cwd(), "../backend"),
      "apps/taxonomy-svc/test/fixtures/logo.png",
    );
    const brandRes = await request.post(`${env.gatewayUrl}/api/v1/marcas`, {
      headers: { Authorization: `Bearer ${token}`, "X-Correlation-Id": randomUUID() },
      multipart: {
        nombre: `Marca Aud ${randomUUID().slice(0, 6)}`,
        logo: { name: "logo.png", mimeType: "image/png", buffer: readFileSync(logoPath) },
      },
    });
    expect([200, 201]).toContain(brandRes.status());
    const brandDto = (await brandRes.json()) as { marcaId: string };
    const typeRes = await request.post(`${env.gatewayUrl}/api/v1/tipos-producto`, {
      headers,
      data: { nombre: `Tipo Aud ${randomUUID().slice(0, 6)}` },
    });
    expect([200, 201]).toContain(typeRes.status());
    const typeDto = (await typeRes.json()) as { tipoProductoId: string };

    const causalProductId = randomUUID();
    const causalSku = `SKU-AUD-${randomUUID().slice(0, 6).toUpperCase()}`;
    const seedProd = await request.post(`${env.g5SeedOrigin}/__test/catalog-active-product`, {
      data: {
        productId: causalProductId,
        skuBase: causalSku,
        categoriaId: catDto.categoriaId,
        marcaId: brandDto.marcaId,
        tipoProductoId: typeDto.tipoProductoId,
      },
    });
    expect(seedProd.status()).toBe(201);

    const patchPriceRes = await request.patch(
      `${env.gatewayUrl}/api/v1/precios/productos/${encodeURIComponent(causalProductId)}`,
      {
        headers: { ...headers, "Idempotency-Key": randomUUID() },
        data: {
          accionPrecioOferta: "CONSERVAR",
          priceVersion: 0,
          precioRegular: 145,
          moneda: "PEN",
          motivoCambio: "CAUSAL_AUDIT_E2E",
        },
      },
    );
    expect(patchPriceRes.status()).toBe(200);

    let causalPersisted = false;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const pollAudit = await request.get(
        `${env.gatewayUrl}/api/v1/auditoria-precios/administracion?pagina=1&tamanio=20`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      expect(pollAudit.status()).toBe(200);
      const body = (await pollAudit.json()) as {
        items?: Array<{ productId?: string; motivoCambio?: string }>;
      };
      if (
        (body.items ?? []).some(
          (item) =>
            item.productId === causalProductId ||
            item.motivoCambio === "CAUSAL_AUDIT_E2E",
        )
      ) {
        causalPersisted = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(causalPersisted).toBe(true);

    const [auditRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname.startsWith("/api/v1/auditoria-precios"),
      ),
      navigateViaSpa(page, "/precios/auditoria"),
    ]);
    expect(auditRes.status()).toBe(200);
    await expect(page.getByText(/CAUSAL_AUDIT_E2E|145/).first()).toBeVisible();

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

  test("5. Promotions: crear promoción CUPON vigente y luego cupón asociado via CouponForm (estado, promoción exacta y radio restitución)", async ({
    page,
    request,
  }) => {
    const env = assertRealStackPreflight();
    const token = await issueTokenFromTrustedG7(env.g7ApiBase, "gestor@example.test");
    const nowMs = Date.now();
    const promoName = `Promo UI ${randomUUID().slice(0, 6)}`;
    const promoRes = await request.post(`${env.gatewayUrl}/api/v1/promociones`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Correlation-Id": randomUUID(),
        "Idempotency-Key": randomUUID(),
        "Content-Type": "application/json",
      },
      data: {
        nombre: promoName,
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
    const codeInput = page.getByLabel(/c[oó]digo del cup[oó]n/i).first();
    await expect(codeInput).toBeVisible();
    await codeInput.fill(code);

    const promoSelect = page.getByLabel(/promoci[oó]n asociada/i).first();
    await expect(promoSelect).toBeVisible();
    await promoSelect.click();
    const promoOpt = page.getByRole("option", { name: promoName, exact: true }).first();
    await expect(promoOpt).toBeVisible();
    await promoOpt.click();

    const statusSelect = page.getByLabel(/estado inicial/i).first();
    await expect(statusSelect).toBeVisible();
    await statusSelect.click();
    const activeOpt = page.getByRole("option", { name: "Activo", exact: true }).first();
    await expect(activeOpt).toBeVisible();
    await activeOpt.click();

    const restoreRadio = page.getByRole("radio", { name: "Restaurar uso al cancelar" }).first();
    await expect(restoreRadio).toBeVisible();
    await restoreRadio.check();

    const submitBtn = page.getByRole("button", { name: "Crear cupón", exact: true }).first();
    await expect(submitBtn).toBeEnabled();
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
    const verifyCouponRes = await request.get(
      `${env.gatewayUrl}/api/v1/cupones?codigo=${encodeURIComponent(code)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(verifyCouponRes.status()).toBe(200);
    const couponListDto = (await verifyCouponRes.json()) as {
      items?: Array<{
        codigo?: string;
        promocionId?: string;
        estado?: string;
        politicaCancelacion?: string;
      }>;
    };
    const foundCoupon = (couponListDto.items ?? []).find((c) => c.codigo === code);
    expect(foundCoupon).toBeTruthy();
    expect(foundCoupon?.promocionId).toBe(promoDto.promotionId);
    expect(foundCoupon?.estado).toBe("ACTIVO");
    expect(foundCoupon?.politicaCancelacion).toBe("RESTAURAR_EN_CANCELACION");
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
      const priceRes = await request.patch(
        `${env.gatewayUrl}/api/v1/precios/productos/${encodeURIComponent(productId)}`,
        {
          headers: { ...headers, "Idempotency-Key": randomUUID() },
          data: {
            accionPrecioOferta: "CONSERVAR",
            priceVersion: 0,
            precioRegular: 100,
            moneda: "PEN",
            motivoCambio: "COMBO_E2E_SEED",
          },
        },
      );
      expect(priceRes.status()).toBe(200);
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
    await page.getByLabel("Nombre", { exact: true }).fill(comboName);

    const productSelector = page.getByLabel("Producto", { exact: true }).first();
    const addComponentBtn = page.getByRole("button", { name: "Agregar componente", exact: true });
    for (const skuItem of [sku1, sku2]) {
      await expect(productSelector).toBeVisible();
      await productSelector.click();
      await productSelector.fill(skuItem);
      const option = page.getByRole("option", { name: new RegExp(skuItem, "i") }).first();
      await expect(option).toBeVisible();
      await option.click();
      await expect(addComponentBtn).toBeEnabled();
      await addComponentBtn.click();
    }

    await expect(page.getByText(sku1)).toBeVisible();
    await expect(page.getByText(sku2)).toBeVisible();

    const comboPriceInput = page.getByLabel("Precio del combo (PEN)", { exact: true }).first();
    await expect(comboPriceInput).toBeVisible();
    await comboPriceInput.fill("180.00");

    await expect(page.getByText("Precio con beneficio económico")).toBeVisible();
    const submitBtn = page.getByRole("button", { name: "Crear combo", exact: true }).first();
    await expect(submitBtn).toBeEnabled();
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

  test("8a. Bulk (admisión HTTP): descargar plantilla CSV V2, preparar maestros reales de Taxonomy, subir lote válido y verificar 202 QUEUED y persistencia inicial", async ({
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

    const catSlug = `cat-blk-${randomUUID().slice(0, 6)}`;
    const catRes = await request.post(`${env.gatewayUrl}/api/v1/categorias`, {
      headers,
      data: { nombre: `Cat Bulk ${catSlug}`, slugConfirmado: catSlug, categoriaPadreId: null },
    });
    expect([200, 201]).toContain(catRes.status());
    const catDto = (await catRes.json()) as { categoriaId: string };
    const logoPath = resolve(
      process.env.G6_BACKEND_ROOT ?? resolve(process.cwd(), "../backend"),
      "apps/taxonomy-svc/test/fixtures/logo.png",
    );
    const brandRes = await request.post(`${env.gatewayUrl}/api/v1/marcas`, {
      headers: { Authorization: `Bearer ${token}`, "X-Correlation-Id": randomUUID() },
      multipart: {
        nombre: `Marca Bulk ${randomUUID().slice(0, 6)}`,
        logo: { name: "logo.png", mimeType: "image/png", buffer: readFileSync(logoPath) },
      },
    });
    expect([200, 201]).toContain(brandRes.status());
    const brandDto = (await brandRes.json()) as { marcaId: string };
    const typeRes = await request.post(`${env.gatewayUrl}/api/v1/tipos-producto`, {
      headers,
      data: { nombre: `Tipo Bulk ${randomUUID().slice(0, 6)}` },
    });
    expect([200, 201]).toContain(typeRes.status());
    const typeDto = (await typeRes.json()) as { tipoProductoId: string };

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
      catDto.categoriaId,
      brandDto.marcaId,
      typeDto.tipoProductoId,
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
    const env = assertRealStackPreflight();
    const token = await issueTokenFromTrustedG7(env.g7ApiBase, "gestor@example.test");
    const headers = {
      Authorization: `Bearer ${token}`,
      "X-Correlation-Id": randomUUID(),
      "Content-Type": "application/json",
    };

    const catSlug = `cat-blk8b-${randomUUID().slice(0, 6)}`;
    const catRes = await request.post(`${env.gatewayUrl}/api/v1/categorias`, {
      headers,
      data: { nombre: `Cat Bulk 8b ${catSlug}`, slugConfirmado: catSlug, categoriaPadreId: null },
    });
    expect([200, 201]).toContain(catRes.status());
    const catDto = (await catRes.json()) as { categoriaId: string };
    const logoPath = resolve(
      process.env.G6_BACKEND_ROOT ?? resolve(process.cwd(), "../backend"),
      "apps/taxonomy-svc/test/fixtures/logo.png",
    );
    const brandRes = await request.post(`${env.gatewayUrl}/api/v1/marcas`, {
      headers: { Authorization: `Bearer ${token}`, "X-Correlation-Id": randomUUID() },
      multipart: {
        nombre: `Marca Bulk 8b ${randomUUID().slice(0, 6)}`,
        logo: { name: "logo.png", mimeType: "image/png", buffer: readFileSync(logoPath) },
      },
    });
    expect([200, 201]).toContain(brandRes.status());
    const brandDto = (await brandRes.json()) as { marcaId: string };
    const typeRes = await request.post(`${env.gatewayUrl}/api/v1/tipos-producto`, {
      headers,
      data: { nombre: `Tipo Bulk 8b ${randomUUID().slice(0, 6)}` },
    });
    expect([200, 201]).toContain(typeRes.status());
    const typeDto = (await typeRes.json()) as { tipoProductoId: string };

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
      catDto.categoriaId,
      brandDto.marcaId,
      typeDto.tipoProductoId,
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
