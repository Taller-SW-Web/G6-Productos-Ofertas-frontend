// Evidencia histórica L1: Frontend cf634b50d046dbd42035cfd5233021eef769da04; Actions 46106563240.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  assertRealStackPreflight,
  issueTechnicalServiceToken,
  loginViaReactUi,
  verifyGatewayAndServicesReady,
} from "./realStackPreflight.ts";

interface CatalogAdminProductDto {
  productId: string;
  skuBase: string;
  estado: "BORRADOR" | "ACTIVO" | "INACTIVO";
  categoriaId: string;
  marcaId: string;
  tipoProductoId: string;
}

interface CatalogCommercialProductDto {
  product_id: string;
  sku_base: string;
  nombre: string;
  estado?: string;
}

interface CatalogSkuContextDto {
  productId: string;
  sku: string;
  isVariant: boolean;
  active: boolean;
  eligible: boolean;
}

test.describe("Recorridos transversales encadenados Frontend <-> Gateway <-> Microservicios + N01 técnico (EJECUTADA_L1)", () => {
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
      Accept: "application/json",
    };

    // 1. Taxonomy (categoría, marca, tipo de producto) -> Catalog (producto simple con skuBase)
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

    const logoPath = resolve(
      process.env.G6_BACKEND_ROOT ?? resolve(process.cwd(), "../backend"),
      "apps/taxonomy-svc/test/fixtures/logo.png",
    );
    const logoBuffer = readFileSync(logoPath);
    const brandRes = await request.post(`${env.gatewayUrl}/api/v1/marcas`, {
      headers: {
        Authorization: capturedBearer,
        "X-Correlation-Id": randomUUID(),
      },
      multipart: {
        nombre: `Marca Trans ${randomUUID().slice(0, 6)}`,
        logo: {
          name: "logo.png",
          mimeType: "image/png",
          buffer: logoBuffer,
        },
      },
    });
    expect([200, 201]).toContain(brandRes.status());
    const brandDto = (await brandRes.json()) as { marcaId: string };
    expect(brandDto.marcaId).toBeTruthy();

    const typeRes = await request.post(`${env.gatewayUrl}/api/v1/tipos-producto`, {
      headers: humanHeaders,
      data: {
        nombre: `Tipo Trans ${randomUUID().slice(0, 6)}`,
      },
    });
    expect([200, 201]).toContain(typeRes.status());
    const typeDto = (await typeRes.json()) as { tipoProductoId: string };
    expect(typeDto.tipoProductoId).toBeTruthy();

    const draftSkuBase = `SKU-DRAFT-${randomUUID().slice(0, 8).toUpperCase()}`;
    const createProd = await request.post(`${env.gatewayUrl}/api/v1/productos`, {
      headers: { ...humanHeaders, "Idempotency-Key": randomUUID() },
      data: {
        nombre: `Prod Borrador ${randomUUID().slice(0, 6)}`,
        descripcion: "Alta administrativa BORRADOR E2E H5",
        categoriaId: catDto.categoriaId,
        marcaId: brandDto.marcaId,
        tipoProductoId: typeDto.tipoProductoId,
        skuBase: draftSkuBase,
        tieneVariantes: false,
        precioBaseInicial: 120,
      },
    });
    expect([200, 201]).toContain(createProd.status());
    const draftProdDto = (await createProd.json()) as { product_id: string };
    expect(draftProdDto.product_id).toBeTruthy();

    // Evidencia A: BORRADOR persists while its asynchronous preparation completes.
    const adminReadRes = await request.get(
      `${env.gatewayUrl}/api/v1/productos/administracion/${encodeURIComponent(draftProdDto.product_id)}`,
      { headers: humanHeaders },
    );
    expect(adminReadRes.status()).toBe(200);
    const adminProdDto = (await adminReadRes.json()) as CatalogAdminProductDto;
    expect(adminProdDto.productId).toBe(draftProdDto.product_id);
    expect(adminProdDto.skuBase).toBe(draftSkuBase);
    expect(adminProdDto.estado).toBe("BORRADOR");
    expect(adminProdDto.categoriaId).toBe(catDto.categoriaId);
    expect(adminProdDto.marcaId).toBe(brandDto.marcaId);
    expect(adminProdDto.tipoProductoId).toBe(typeDto.tipoProductoId);

    const prepRes = await request.get(
      `${env.gatewayUrl}/api/v1/productos/${encodeURIComponent(draftProdDto.product_id)}/preparacion`,
      { headers: humanHeaders },
    );
    expect(prepRes.status()).toBe(200);
    const prepDto = (await prepRes.json()) as {
      product_id: string;
      tiene_variantes: boolean;
      pricing: { status: string };
      inventario: { status: string };
      variantes: unknown[];
    };
    expect(prepDto.product_id).toBe(draftProdDto.product_id);
    expect(prepDto.tiene_variantes).toBe(false);
    await expect.poll(async () => {
      const result = await request.get(`${env.gatewayUrl}/api/v1/productos/${draftProdDto.product_id}/preparacion`, { headers: humanHeaders });
      expect(result.status()).toBe(200);
      const preparation = await result.json();
      return [preparation.pricing.status, preparation.inventario.status];
    }, { timeout: 10000 }).toEqual(['COMPLETED', 'COMPLETED']);

    // Evidencia B: Fixture comercial preprovisionada ACTIVO en PostgreSQL descartable para N01
    // (No acredita el ciclo completo de publicación asíncrona Catalog -> Pricing/Inventory -> Catalog)
    if (!env.g5SeedOrigin || !env.g5EvidenceOrigin) {
      throw new Error("PREFLIGHT_BLOCKED: g5SeedOrigin y g5EvidenceOrigin requeridos para N01.");
    }
    const activeProductId = randomUUID();
    const skuBase = `SKU-N01-${randomUUID().slice(0, 8).toUpperCase()}`;
    const seedCatalogRes = await request.post(
      `${env.g5SeedOrigin}/__test/catalog-active-product`,
      {
        data: {
          productId: activeProductId,
          skuBase,
          categoriaId: catDto.categoriaId,
          marcaId: brandDto.marcaId,
          tipoProductoId: typeDto.tipoProductoId,
        },
      },
    );
    expect(seedCatalogRes.status()).toBe(201);
    const prodDto = { productId: activeProductId };

    const readProdRes = await request.get(
      `${env.gatewayUrl}/api/v1/productos/${encodeURIComponent(prodDto.productId)}`,
      { headers: humanHeaders },
    );
    expect(readProdRes.status()).toBe(200);
    const readProdDto = (await readProdRes.json()) as CatalogCommercialProductDto;
    expect(readProdDto.product_id).toBe(prodDto.productId);
    expect(readProdDto.sku_base).toBe(skuBase);

    if (!env.catalogServiceUrl) {
      throw new Error("PREFLIGHT_BLOCKED: catalogServiceUrl requerido para lectura privada de contexto SKU.");
    }
    const catalogServiceToken = await issueTechnicalServiceToken(
      env.g7ApiBase,
      "modulo-productos",
      "catalogo:leer",
    );
    const skuCtxRes = await request.get(
      `${env.catalogServiceUrl}/api/v1/productos/skus/${encodeURIComponent(skuBase)}/contexto`,
      { headers: { Authorization: `Bearer ${catalogServiceToken}` } },
    );
    expect(skuCtxRes.status()).toBe(200);
    const skuCtx = (await skuCtxRes.json()) as CatalogSkuContextDto;
    expect(skuCtx.productId).toBe(prodDto.productId);
    expect(skuCtx.sku).toBe(skuBase);
    expect(skuCtx.active).toBe(true);
    expect(skuCtx.eligible).toBe(true);

    // Segundo producto comercial ACTIVO preprovisionado para formar Combo de 2 SKU distintos
    const activeProductId2 = randomUUID();
    const skuBase2 = `SKU-N01-B-${randomUUID().slice(0, 6).toUpperCase()}`;
    const seedCatalogRes2 = await request.post(
      `${env.g5SeedOrigin}/__test/catalog-active-product`,
      {
        data: {
          productId: activeProductId2,
          skuBase: skuBase2,
          categoriaId: catDto.categoriaId,
          marcaId: brandDto.marcaId,
          tipoProductoId: typeDto.tipoProductoId,
        },
      },
    );
    expect(seedCatalogRes2.status()).toBe(201);
    const skuCtxRes2 = await request.get(
      `${env.catalogServiceUrl}/api/v1/productos/skus/${encodeURIComponent(skuBase2)}/contexto`,
      { headers: { Authorization: `Bearer ${catalogServiceToken}` } },
    );
    expect(skuCtxRes2.status()).toBe(200);
    const skuCtx2 = (await skuCtxRes2.json()) as CatalogSkuContextDto;
    expect(skuCtx2.productId).toBe(activeProductId2);
    expect(skuCtx2.sku).toBe(skuBase2);
    expect(skuCtx2.active).toBe(true);
    expect(skuCtx2.eligible).toBe(true);

    // 2. Catalog -> Pricing (PATCH DTO oficial) -> Price Audit (causal vía Service Bus aislado)
    const putPrice = await request.patch(
      `${env.gatewayUrl}/api/v1/precios/productos/${encodeURIComponent(prodDto.productId)}`,
      {
        headers: { ...humanHeaders, "Idempotency-Key": randomUUID() },
        data: {
          accionPrecioOferta: "CONSERVAR",
          priceVersion: 0,
          precioRegular: 120,
          moneda: "PEN",
          motivoCambio: "E2E_TRANSVERSAL",
        },
      },
    );
    expect(putPrice.status()).toBe(200);
    const putPriceDto = (await putPrice.json()) as {
      product_id: string;
      precio_regular: number;
      price_version: number;
      channel_id: string | null;
    };
    expect(putPriceDto.product_id).toBe(prodDto.productId);
    expect(putPriceDto.precio_regular).toBe(120);
    expect(putPriceDto.price_version).toBeGreaterThanOrEqual(1);

    const getPrice = await request.get(
      `${env.gatewayUrl}/api/v1/precios/productos/${encodeURIComponent(prodDto.productId)}`,
      { headers: humanHeaders },
    );
    expect(getPrice.status()).toBe(200);

    const putPrice2 = await request.patch(
      `${env.gatewayUrl}/api/v1/precios/productos/${encodeURIComponent(activeProductId2)}`,
      {
        headers: { ...humanHeaders, "Idempotency-Key": randomUUID() },
        data: {
          accionPrecioOferta: "CONSERVAR",
          priceVersion: 0,
          precioRegular: 110,
          moneda: "PEN",
          motivoCambio: "E2E_TRANSVERSAL_COMBO",
        },
      },
    );
    expect(putPrice2.status()).toBe(200);
    const putPrice2Dto = (await putPrice2.json()) as {
      product_id: string;
      precio_regular: number;
      price_version: number;
    };
    expect(putPrice2Dto.product_id).toBe(activeProductId2);
    expect(putPrice2Dto.precio_regular).toBe(110);

    const getPrice2 = await request.get(
      `${env.gatewayUrl}/api/v1/precios/productos/${encodeURIComponent(activeProductId2)}`,
      { headers: humanHeaders },
    );
    expect(getPrice2.status()).toBe(200);

    let auditFound = false;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const auditRes = await request.get(
        `${env.gatewayUrl}/api/v1/auditoria-precios/administracion?pagina=1&tamanio=20`,
        { headers: humanHeaders },
      );
      expect(auditRes.status()).toBe(200);
      const auditBody = (await auditRes.json()) as { items?: Array<{ sku?: string; product_id?: string; motivo_cambio?: string }> };
      if ((auditBody.items ?? []).some((row) => row.motivo_cambio === "E2E_TRANSVERSAL" && row.product_id === prodDto.productId)) {
        auditFound = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(auditFound).toBe(true);

    // 3. Catalog/Pricing -> Combos (2 componentes distintos y precioCombo positivo)
    const createCombo = await request.post(
      `${env.gatewayUrl}/api/v1/combos/administracion`,
      {
        headers: { ...humanHeaders, "Idempotency-Key": randomUUID() },
        data: {
          nombre: `Combo transversal E2E ${randomUUID().slice(0, 6)}`,
          componentes: [
            { sku: skuBase, cantidad: 1 },
            { sku: skuBase2, cantidad: 1 },
          ],
          precioCombo: 200,
        },
      },
    );
    expect([200, 201]).toContain(createCombo.status());
    const comboDto = (await createCombo.json()) as { combo_id: string };
    expect(comboDto.combo_id).toBeTruthy();

    const getCombo = await request.get(
      `${env.gatewayUrl}/api/v1/combos/${encodeURIComponent(comboDto.combo_id)}`,
      { headers: humanHeaders },
    );
    expect(getCombo.status()).toBe(200);
    const comboDetail = (await getCombo.json()) as {
      combo_id: string;
      components: Array<{ sku: string; quantity: number }>;
    };
    expect(comboDetail.combo_id).toBe(comboDto.combo_id);
    const comboSkus = comboDetail.components.map((c) => c.sku);
    expect(comboSkus).toContain(skuBase);
    expect(comboSkus).toContain(skuBase2);

    // 4. Promotions -> Promoción CUPON vigente + Cupón elegible + N01 consumo/restauración (cliente técnico modulo-ventas)
    const nowMs = Date.now();
    const createPromo = await request.post(`${env.gatewayUrl}/api/v1/promociones`, {
      headers: { ...humanHeaders, "Idempotency-Key": randomUUID() },
      data: {
        nombre: `Promo Cupón E2E ${randomUUID().slice(0, 6)}`,
        tipoDescuento: "PORCENTAJE",
        valor: 10,
        modalidad: "CUPON",
        estado: "ACTIVO",
        validFrom: new Date(nowMs - 60_000).toISOString(),
        validUntil: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
        alcance: {
          productIds: [prodDto.productId],
          skus: [skuBase],
        },
        prioridad: 10,
        canalesHabilitados: ["MARKETPLACE"],
        politicaCombinacion: {
          ofertaPricing: true,
          promocionAutomatica: false,
          cupon: true,
        },
      },
    });
    expect([200, 201]).toContain(createPromo.status());
    const promoDto = (await createPromo.json()) as { promotionId: string };
    expect(promoDto.promotionId).toBeTruthy();

    const getPromo = await request.get(
      `${env.gatewayUrl}/api/v1/promociones/${encodeURIComponent(promoDto.promotionId)}`,
      { headers: humanHeaders },
    );
    expect(getPromo.status()).toBe(200);

    const couponCode = `TRN${randomUUID().slice(0, 6).toUpperCase()}`;
    const createCoupon = await request.post(`${env.gatewayUrl}/api/v1/cupones`, {
      headers: { ...humanHeaders, "Idempotency-Key": randomUUID() },
      data: {
        codigo: couponCode,
        promocionId: promoDto.promotionId,
        estado: "ACTIVO",
        politicaCancelacion: "RESTAURAR_EN_CANCELACION",
      },
    });
    expect([200, 201]).toContain(createCoupon.status());
    const couponDto = (await createCoupon.json()) as { cuponId?: string; codigo?: string };
    expect(couponDto.cuponId ?? couponDto.codigo).toBeTruthy();

    const getCoupon = await request.get(
      `${env.gatewayUrl}/api/v1/cupones?codigo=${encodeURIComponent(couponCode)}`,
      { headers: humanHeaders },
    );
    expect(getCoupon.status()).toBe(200);

    const g5Token = await issueTechnicalServiceToken(
      env.g7ApiBase,
      "modulo-ventas",
      "cupones:consumir cupones:restaurar cupones:operaciones:leer inventario:reservar inventario:operaciones:leer inventario:reservas:estado:leer",
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

    const skuForCoupon = skuBase;
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
    expect(restoreSnapshot.result?.outcome).toBe("RESTORED");

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

    // 4f. Rechazo asíncrono de negocio (cupón inexistente con reserva y snapshot G5 válidos -> REJECTED COUPON_NOT_ELIGIBLE)
    const missingCouponOpId = randomUUID();
    const missingReserveOpId = randomUUID();
    const missingOrderId = randomUUID();
    const missingEffectiveAt = new Date().toISOString();
    const missingReserveReq = await request.post(`${env.gatewayUrl}/api/v1/inventario/reservas`, {
      headers: {
        Authorization: `Bearer ${g5Token}`,
        "X-Correlation-Id": randomUUID(),
        "Idempotency-Key": missingReserveOpId,
        "Content-Type": "application/json",
      },
      data: {
        operation_id: missingReserveOpId,
        order_id: missingOrderId,
        channel_id: "MARKETPLACE",
        lines: [{ sku: skuForCoupon, quantity: 1 }],
      },
    });
    expect([200, 202]).toContain(missingReserveReq.status());
    let missingReserveOp: { status?: string; reservation_id?: string | null } = {};
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const poll = await request.get(
        `${env.gatewayUrl}/api/v1/inventario/operaciones/${encodeURIComponent(missingReserveOpId)}`,
        { headers: { Authorization: `Bearer ${g5Token}` } },
      );
      expect(poll.status()).toBe(200);
      missingReserveOp = (await poll.json()) as typeof missingReserveOp;
      if (missingReserveOp.status === "COMPLETED" || missingReserveOp.status === "REJECTED") break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(missingReserveOp.status).toBe("COMPLETED");
    const missingCouponResId = missingReserveOp.reservation_id ?? "";
    expect(missingCouponResId).toMatch(/^[0-9a-f-]{36}$/i);

    const missingSnap = await request.post(`${env.g5SeedOrigin}/__test/g5-snapshots`, {
      data: {
        order_id: missingOrderId,
        reservation_id: missingCouponResId,
        commercial_snapshot_ref: missingOrderId,
        channel_id: "MARKETPLACE",
        coupon_code: "NO-EXISTE-9999",
        effective_at: missingEffectiveAt,
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
    expect(missingSnap.status()).toBe(201);

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
          effective_at: missingEffectiveAt,
          reservation_id: missingCouponResId,
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
    expect(missingSnapshot.result?.result_code).toBe("COUPON_NOT_ELIGIBLE");

    // 4g. Rechazo asíncrono por reserva inexistente en Inventory (202 admisión -> REJECTED COUPON_NOT_ELIGIBLE)
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
    expect(noResSnap.result?.result_code).toBe("COUPON_NOT_ELIGIBLE");
  });
});
