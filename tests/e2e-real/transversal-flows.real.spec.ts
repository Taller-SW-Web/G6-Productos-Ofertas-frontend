import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  assertRealStackPreflight,
  issueTechnicalServiceToken,
  loginViaReactUi,
  verifyGatewayAndServicesReady,
} from "./realStackPreflight.ts";

test.describe("Recorridos transversales encadenados Frontend <-> Gateway <-> Microservicios + N01 técnico (ESCRITA_NO_EJECUTADA)", () => {
  test("causalidad real: Taxonomy -> Catalog -> Pricing/Inventory -> Audit -> Combos -> Coupons + N01 técnico separado", async ({
    page,
    request,
  }) => {
    const env = assertRealStackPreflight();
    await verifyGatewayAndServicesReady(env.gatewayUrl);

    let capturedBearer = "";
    page.on("request", (req) => {
      const auth = req.headers()["authorization"];
      if (auth?.startsWith("Bearer eyJ")) {
        capturedBearer = auth;
      }
    });

    await page.goto("/productos");
    const [loginRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname.startsWith("/api/v1/productos"),
      ),
      loginViaReactUi(page, "gestor@example.test", "isolated-g7-password"),
    ]);
    expect(loginRes.status()).toBe(200);
    expect(capturedBearer).toMatch(/^Bearer eyJ/);

    const humanHeaders = {
      Authorization: capturedBearer,
      "X-Correlation-Id": randomUUID(),
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // 1. Taxonomy -> Catalog
    const catSlug = `cat-trans-${randomUUID().slice(0, 6)}`;
    const createCat = await request.post(`${env.gatewayUrl}/api/v1/categorias`, {
      headers: humanHeaders,
      data: {
        nombre: `Categoría ${catSlug}`,
        slugConfirmado: catSlug,
        categoriaPadreId: null,
      },
    });
    expect([200, 201]).toContain(createCat.status());
    const catDto = (await createCat.json()) as { categoriaId: string };
    expect(catDto.categoriaId).toBeTruthy();

    const createProd = await request.post(`${env.gatewayUrl}/api/v1/productos`, {
      headers: { ...humanHeaders, "Idempotency-Key": randomUUID() },
      data: {
        nombre: `Prod Transversal ${randomUUID().slice(0, 6)}`,
        categoriaId: catDto.categoriaId,
      },
    });
    expect([200, 201]).toContain(createProd.status());
    const prodDto = (await createProd.json()) as { productId: string };
    expect(prodDto.productId).toBeTruthy();

    // 2. Catalog -> Pricing -> Price Audit
    const putPrice = await request.put(
      `${env.gatewayUrl}/api/v1/precios/productos/${encodeURIComponent(prodDto.productId)}`,
      {
        headers: { ...humanHeaders, "Idempotency-Key": randomUUID() },
        data: {
          precioRegular: "120.00",
          currency: "PEN",
          motivoCambio: "E2E_TRANSVERSAL",
        },
      },
    );
    expect([200, 201]).toContain(putPrice.status());

    const getPrice = await request.get(
      `${env.gatewayUrl}/api/v1/precios/productos/${encodeURIComponent(prodDto.productId)}`,
      { headers: humanHeaders },
    );
    expect(getPrice.status()).toBe(200);

    const auditRes = await request.get(
      `${env.gatewayUrl}/api/v1/auditoria-precios/administracion?pagina=1&tamanio=10`,
      { headers: humanHeaders },
    );
    expect(auditRes.status()).toBe(200);

    // 3. Catalog/Inventory -> Combos
    const createCombo = await request.post(
      `${env.gatewayUrl}/api/v1/combos/administracion`,
      {
        headers: { ...humanHeaders, "Idempotency-Key": randomUUID() },
        data: {
          nombre: `Combo Trans ${randomUUID().slice(0, 6)}`,
          productoId: prodDto.productId,
        },
      },
    );
    expect([200, 201]).toContain(createCombo.status());
    const comboDto = (await createCombo.json()) as { comboId: string };
    expect(comboDto.comboId).toBeTruthy();

    const getCombo = await request.get(
      `${env.gatewayUrl}/api/v1/combos/${encodeURIComponent(comboDto.comboId)}`,
      { headers: humanHeaders },
    );
    expect(getCombo.status()).toBe(200);

    // 4. Promotions -> Coupons (admin humano) + N01 consumo/restauración (cliente técnico modulo-ventas separado)
    const couponCode = `TRN${randomUUID().slice(0, 6).toUpperCase()}`;
    const createCoupon = await request.post(`${env.gatewayUrl}/api/v1/cupones`, {
      headers: { ...humanHeaders, "Idempotency-Key": randomUUID() },
      data: {
        codigo: couponCode,
        tipoDescuento: "PORCENTAJE",
        valor: 10,
      },
    });
    expect([200, 201]).toContain(createCoupon.status());
    const couponDto = (await createCoupon.json()) as { cuponId: string };
    expect(couponDto.cuponId).toBeTruthy();

    const g5Token = await issueTechnicalServiceToken(
      env.g7ApiBase,
      "modulo-ventas",
      "cupones:consumir cupones:restaurar cupones:operaciones:leer",
    );
    const consumeKey = randomUUID();
    const orderId = randomUUID();
    const consumeBody = { codigo: couponCode, orderId };
    const consumeHeaders = {
      Authorization: `Bearer ${g5Token}`,
      "X-Correlation-Id": randomUUID(),
      "Idempotency-Key": consumeKey,
      "Content-Type": "application/json",
    };

    // 4a. Consumo N01 + polling hasta estado terminal
    const consumeRes = await request.post(
      `${env.gatewayUrl}/api/v1/cupones/consumos`,
      { headers: consumeHeaders, data: consumeBody },
    );
    expect([200, 202]).toContain(consumeRes.status());
    const consumeOp = (await consumeRes.json()) as { operation_id?: string };
    expect(consumeOp.operation_id).toBeTruthy();

    // 4b. Duplicación idempotente (mismo Idempotency-Key + payload debe conservar operation_id)
    const dupConsumeRes = await request.post(
      `${env.gatewayUrl}/api/v1/cupones/consumos`,
      { headers: consumeHeaders, data: consumeBody },
    );
    expect([200, 202]).toContain(dupConsumeRes.status());
    const dupOp = (await dupConsumeRes.json()) as { operation_id?: string };
    expect(dupOp.operation_id).toBe(consumeOp.operation_id);

    // 4c. Polling hasta estado terminal de operación N01
    let terminalStatus = "";
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const opStatusRes = await request.get(
        `${env.gatewayUrl}/api/v1/cupones/operaciones/${encodeURIComponent(consumeOp.operation_id!)}`,
        { headers: { Authorization: `Bearer ${g5Token}` } },
      );
      expect(opStatusRes.status()).toBe(200);
      const opBody = (await opStatusRes.json()) as { status?: string };
      terminalStatus = opBody.status ?? "";
      if (["COMPLETED", "APPLIED", "REJECTED", "FAILED"].includes(terminalStatus)) {
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(["COMPLETED", "APPLIED"]).toContain(terminalStatus);

    // 4d. Restauración N01 + polling hasta estado terminal
    const restoreRes = await request.post(
      `${env.gatewayUrl}/api/v1/cupones/restauraciones`,
      {
        headers: {
          Authorization: `Bearer ${g5Token}`,
          "X-Correlation-Id": randomUUID(),
          "Idempotency-Key": randomUUID(),
          "Content-Type": "application/json",
        },
        data: { codigo: couponCode, orderId, motivo: "CANCELACION_E2E" },
      },
    );
    expect([200, 202]).toContain(restoreRes.status());
    const restoreOp = (await restoreRes.json()) as { operation_id?: string };
    expect(restoreOp.operation_id).toBeTruthy();

    let restoreTerminal = "";
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const restorePoll = await request.get(
        `${env.gatewayUrl}/api/v1/cupones/operaciones/${encodeURIComponent(restoreOp.operation_id!)}`,
        { headers: { Authorization: `Bearer ${g5Token}` } },
      );
      expect(restorePoll.status()).toBe(200);
      const body = (await restorePoll.json()) as { status?: string };
      restoreTerminal = body.status ?? "";
      if (["COMPLETED", "APPLIED", "RESTORED", "REJECTED", "FAILED"].includes(restoreTerminal)) {
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(["COMPLETED", "APPLIED", "RESTORED"]).toContain(restoreTerminal);

    // 4e. Rechazo contractual ante cupón inexistente
    const rejectRes = await request.post(
      `${env.gatewayUrl}/api/v1/cupones/consumos`,
      {
        headers: {
          Authorization: `Bearer ${g5Token}`,
          "X-Correlation-Id": randomUUID(),
          "Idempotency-Key": randomUUID(),
          "Content-Type": "application/json",
        },
        data: { codigo: "NO-EXISTE-9999", orderId: randomUUID() },
      },
    );
    expect([404, 422]).toContain(rejectRes.status());
  });
});
