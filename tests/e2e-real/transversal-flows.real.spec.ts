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
      "cupones:consumir cupones:restaurar cupones:operaciones:leer stock:reservar inventario:reservas:estado:leer",
    );
    const consumeOpId = randomUUID();
    const reserveOpId = randomUUID();
    const orderId = randomUUID();
    const effectiveAt = new Date().toISOString();

    // 4.0 Preparar stock real, crear reserva Inventory (CrearReservaRequest) hasta COMPLETED y verificar estado ACTIVA/VIGENTE
    if (!env.g5SeedOrigin || !env.g5EvidenceOrigin) {
      throw new Error("PREFLIGHT_BLOCKED: g5SeedOrigin y g5EvidenceOrigin requeridos para N01.");
    }
    expect(env.g5EvidenceOrigin.startsWith("https://127.0.0.1:")).toBe(true);
    expect(env.g5SeedOrigin.startsWith("http://127.0.0.1:")).toBe(true);

    const skuForCoupon = `SKU-N01-${randomUUID().slice(0, 6).toUpperCase()}`;
    const stockSeedRes = await request.post(`${env.g5SeedOrigin}/__test/inventory-stock`, {
      data: { sku: skuForCoupon, on_hand: 25 },
    });
    expect(stockSeedRes.status()).toBe(201);

    const createReserveRes = await request.post(`${env.gatewayUrl}/api/v1/inventario/reservas`, {
      headers: {
        Authorization: `Bearer ${g5Token}`,
        "X-Correlation-Id": randomUUID(),
        "Idempotency-Key": reserveOpId,
        "Content-Type": "application/json",
      },
      data: {
        operation_id: reserveOpId,
        order_id: orderId,
        channel_id: "MARKETPLACE",
        lines: [{ sku: skuForCoupon, quantity: 1 }],
      },
    });
    expect([200, 202]).toContain(createReserveRes.status());

    let reserveOpSnapshot: {
      operation_id?: string;
      status?: string;
      reservation_id?: string | null;
    } = {};
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const pollReserve = await request.get(
        `${env.gatewayUrl}/api/v1/inventario/operaciones/${encodeURIComponent(reserveOpId)}`,
        { headers: { Authorization: `Bearer ${g5Token}` } },
      );
      expect(pollReserve.status()).toBe(200);
      reserveOpSnapshot = (await pollReserve.json()) as typeof reserveOpSnapshot;
      if (reserveOpSnapshot.status === "COMPLETED" || reserveOpSnapshot.status === "REJECTED") {
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(reserveOpSnapshot.status).toBe("COMPLETED");
    const reservationId = reserveOpSnapshot.reservation_id ?? "";
    expect(reservationId).toMatch(/^[0-9a-f-]{36}$/i);

    const reserveStateRes = await request.get(
      `${env.gatewayUrl}/api/v1/inventario/reservas/${encodeURIComponent(reservationId)}/estado?order_id=${encodeURIComponent(orderId)}`,
      { headers: { Authorization: `Bearer ${g5Token}` } },
    );
    expect(reserveStateRes.status()).toBe(200);
    const reserveState = (await reserveStateRes.json()) as {
      reservation_id: string;
      order_id: string;
      estado_persistido: string;
      vigencia_efectiva: string;
      expires_at: string;
      permite_consumo_cupon: boolean;
    };
    expect(reserveState.reservation_id).toBe(reservationId);
    expect(reserveState.order_id).toBe(orderId);
    expect(reserveState.estado_persistido).toBe("ACTIVA");
    expect(reserveState.vigencia_efectiva).toBe("VIGENTE");
    expect(reserveState.permite_consumo_cupon).toBe(true);
    expect(Date.parse(reserveState.expires_at)).toBeGreaterThan(Date.now());

    const snapRes = await request.post(
      `${env.g5SeedOrigin}/__test/g5-snapshots`,
      {
        data: {
          order_id: orderId,
          reservation_id: reservationId,
          commercial_snapshot_ref: orderId,
          channel_id: "MARKETPLACE",
          coupon_code: couponCode,
          effective_at: effectiveAt,
          customer_ref: null,
          lines: [
            {
              sku: skuForCoupon,
              product_id: prodDto.productId,
              quantity: 1,
              regular_price: "120.00",
              offer_price: null,
              currency: "PEN",
            },
          ],
        },
      },
    );
    expect(snapRes.status()).toBe(201);

    const consumeBody = {
      operation_id: consumeOpId,
      order_id: orderId,
      coupon_code: couponCode,
      channel_id: "MARKETPLACE",
      effective_at: effectiveAt,
      reservation_id: reservationId,
      commercial_snapshot_ref: orderId,
    };
    const consumeHeaders = {
      Authorization: `Bearer ${g5Token}`,
      "X-Correlation-Id": randomUUID(),
      "Idempotency-Key": consumeOpId,
      "Content-Type": "application/json",
    };

    // 4a. Admisión consumo N01
    const consumeRes = await request.post(
      `${env.gatewayUrl}/api/v1/cupones/consumos`,
      { headers: consumeHeaders, data: consumeBody },
    );
    expect([200, 202]).toContain(consumeRes.status());
    const consumeOp = (await consumeRes.json()) as {
      operation_id?: string;
      status?: string;
    };
    expect(consumeOp.operation_id).toBe(consumeOpId);

    // 4b. Duplicación idempotente (mismo Idempotency-Key === operation_id y mismo payload)
    const dupConsumeRes = await request.post(
      `${env.gatewayUrl}/api/v1/cupones/consumos`,
      { headers: consumeHeaders, data: consumeBody },
    );
    expect([200, 202]).toContain(dupConsumeRes.status());
    const dupOp = (await dupConsumeRes.json()) as { operation_id?: string };
    expect(dupOp.operation_id).toBe(consumeOpId);

    // 4c. Polling explícito hasta estado terminal válido (ACCEPTED | PROCESSING | COMPLETED | REJECTED)
    let consumeSnapshot: {
      operation_id?: string;
      order_id?: string;
      operation_type?: string;
      status?: string;
      result?: Record<string, unknown> | null;
    } = {};
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const opStatusRes = await request.get(
        `${env.gatewayUrl}/api/v1/cupones/operaciones/${encodeURIComponent(consumeOpId)}?order_id=${encodeURIComponent(orderId)}`,
        { headers: { Authorization: `Bearer ${g5Token}` } },
      );
      expect(opStatusRes.status()).toBe(200);
      consumeSnapshot = (await opStatusRes.json()) as typeof consumeSnapshot;
      expect(["ACCEPTED", "PROCESSING", "COMPLETED", "REJECTED"]).toContain(
        consumeSnapshot.status,
      );
      expect(consumeSnapshot.operation_id).toBe(consumeOpId);
      expect(consumeSnapshot.order_id).toBe(orderId);
      expect(consumeSnapshot.operation_type).toBe("CONSUMIR_CUPON");
      if (
        consumeSnapshot.status === "COMPLETED" ||
        consumeSnapshot.status === "REJECTED"
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(consumeSnapshot.status).toBe("COMPLETED");
    expect(consumeSnapshot.result).toBeTruthy();

    // 4d. Restauración N01 referenciando consumption_operation_id + polling hasta estado terminal
    const restoreOpId = randomUUID();
    const restoreRes = await request.post(
      `${env.gatewayUrl}/api/v1/cupones/restauraciones`,
      {
        headers: {
          Authorization: `Bearer ${g5Token}`,
          "X-Correlation-Id": randomUUID(),
          "Idempotency-Key": restoreOpId,
          "Content-Type": "application/json",
        },
        data: {
          operation_id: restoreOpId,
          order_id: orderId,
          consumption_operation_id: consumeOpId,
          cancellation_reason: "CANCELACION_E2E",
          cancelled_at: new Date().toISOString(),
        },
      },
    );
    expect([200, 202]).toContain(restoreRes.status());

    let restoreSnapshot: {
      operation_id?: string;
      order_id?: string;
      operation_type?: string;
      status?: string;
      result?: { outcome?: string } | null;
    } = {};
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const restorePoll = await request.get(
        `${env.gatewayUrl}/api/v1/cupones/operaciones/${encodeURIComponent(restoreOpId)}?order_id=${encodeURIComponent(orderId)}`,
        { headers: { Authorization: `Bearer ${g5Token}` } },
      );
      expect(restorePoll.status()).toBe(200);
      restoreSnapshot = (await restorePoll.json()) as typeof restoreSnapshot;
      expect(["ACCEPTED", "PROCESSING", "COMPLETED", "REJECTED"]).toContain(
        restoreSnapshot.status,
      );
      expect(restoreSnapshot.operation_type).toBe("RESTAURAR_CUPON");
      if (
        restoreSnapshot.status === "COMPLETED" ||
        restoreSnapshot.status === "REJECTED"
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(restoreSnapshot.status).toBe("COMPLETED");
    expect(["RESTORED", "POLICY_KEEPS_CONSUMPTION", "NO_CONSUMPTION"]).toContain(
      restoreSnapshot.result?.outcome,
    );

    // 4e. Rechazo contractual HTTP (commercial_snapshot_ref !== order_id -> 400 Problem Details)
    const badOpId = randomUUID();
    const badContractRes = await request.post(
      `${env.gatewayUrl}/api/v1/cupones/consumos`,
      {
        headers: {
          Authorization: `Bearer ${g5Token}`,
          "X-Correlation-Id": randomUUID(),
          "Idempotency-Key": badOpId,
          "Content-Type": "application/json",
        },
        data: {
          operation_id: badOpId,
          order_id: orderId,
          coupon_code: couponCode,
          channel_id: "MARKETPLACE",
          effective_at: new Date().toISOString(),
          reservation_id: randomUUID(),
          commercial_snapshot_ref: "MISMATCH-REF",
        },
      },
    );
    expect(badContractRes.status()).toBe(400);

    // 4f. Rechazo asíncrono de negocio (cupón inexistente: 202 admisión -> REJECTED por worker)
    const missingCouponOpId = randomUUID();
    const missingOrderId = `PED-MISS-${randomUUID().slice(0, 8)}`;
    const missingRes = await request.post(
      `${env.gatewayUrl}/api/v1/cupones/consumos`,
      {
        headers: {
          Authorization: `Bearer ${g5Token}`,
          "X-Correlation-Id": randomUUID(),
          "Idempotency-Key": missingCouponOpId,
          "Content-Type": "application/json",
        },
        data: {
          operation_id: missingCouponOpId,
          order_id: missingOrderId,
          coupon_code: "NO-EXISTE-9999",
          channel_id: "MARKETPLACE",
          effective_at: new Date().toISOString(),
          reservation_id: randomUUID(),
          commercial_snapshot_ref: missingOrderId,
        },
      },
    );
    expect([200, 202]).toContain(missingRes.status());
    let missingSnapshot: { status?: string; result?: { result_code?: string } | null } = {};
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const pollMissing = await request.get(
        `${env.gatewayUrl}/api/v1/cupones/operaciones/${encodeURIComponent(missingCouponOpId)}?order_id=${encodeURIComponent(missingOrderId)}`,
        { headers: { Authorization: `Bearer ${g5Token}` } },
      );
      expect(pollMissing.status()).toBe(200);
      missingSnapshot = (await pollMissing.json()) as typeof missingSnapshot;
      if (missingSnapshot.status === "REJECTED" || missingSnapshot.status === "COMPLETED") {
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(missingSnapshot.status).toBe("REJECTED");
    expect(missingSnapshot.result?.result_code).toBeTruthy();

    // 4g. Rechazo asíncrono por reserva inexistente en Inventory (202 admisión -> REJECTED)
    const noResOpId = randomUUID();
    const noResOrderId = randomUUID();
    const missingReservationId = randomUUID();
    const noResTime = new Date().toISOString();
    await request.post(`${env.g5SeedOrigin}/__test/g5-snapshots`, {
      data: {
        order_id: noResOrderId,
        reservation_id: missingReservationId,
        commercial_snapshot_ref: noResOrderId,
        channel_id: "MARKETPLACE",
        coupon_code: couponCode,
        effective_at: noResTime,
        customer_ref: null,
        lines: [
          {
            sku: skuForCoupon,
            product_id: prodDto.productId,
            quantity: 1,
            regular_price: "120.00",
            offer_price: null,
            currency: "PEN",
          },
        ],
      },
    });
    const noResAdm = await request.post(`${env.gatewayUrl}/api/v1/cupones/consumos`, {
      headers: {
        Authorization: `Bearer ${g5Token}`,
        "X-Correlation-Id": randomUUID(),
        "Idempotency-Key": noResOpId,
        "Content-Type": "application/json",
      },
      data: {
        operation_id: noResOpId,
        order_id: noResOrderId,
        coupon_code: couponCode,
        channel_id: "MARKETPLACE",
        effective_at: noResTime,
        reservation_id: missingReservationId,
        commercial_snapshot_ref: noResOrderId,
      },
    });
    expect([200, 202]).toContain(noResAdm.status());
    let noResSnap: { status?: string; result?: { result_code?: string } | null } = {};
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const poll = await request.get(
        `${env.gatewayUrl}/api/v1/cupones/operaciones/${encodeURIComponent(noResOpId)}?order_id=${encodeURIComponent(noResOrderId)}`,
        { headers: { Authorization: `Bearer ${g5Token}` } },
      );
      expect(poll.status()).toBe(200);
      noResSnap = (await poll.json()) as typeof noResSnap;
      if (noResSnap.status === "REJECTED" || noResSnap.status === "COMPLETED") break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(noResSnap.status).toBe("REJECTED");
    expect(noResSnap.result?.result_code).toBeTruthy();
  });
});
