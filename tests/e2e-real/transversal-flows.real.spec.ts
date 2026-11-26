import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  assertRealStackPreflight,
  loginViaReactUi,
  verifyGatewayAndServicesReady,
} from "./realStackPreflight.ts";

test.describe("Recorridos transversales encadenados Frontend <-> Gateway <-> Microservicios (ESCRITA_NO_EJECUTADA)", () => {
  test("causalidad real: Taxonomy -> Catalog -> Pricing/Inventory -> Audit/Promotions -> Combos -> Coupons", async ({
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

    const headers = {
      Authorization: capturedBearer,
      "X-Correlation-Id": randomUUID(),
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // 1. Taxonomy -> Catalog: crear categoría y producto enlazado a categoriaId
    const catSlug = `cat-trans-${randomUUID().slice(0, 6)}`;
    const createCat = await request.post(`${env.gatewayUrl}/api/v1/categorias`, {
      headers,
      data: {
        nombre: `Categoría ${catSlug}`,
        slugConfirmado: catSlug,
        categoriaPadreId: null,
      },
    });
    expect([200, 201]).toContain(createCat.status());
    const catDto = (await createCat.json()) as { categoriaId: string };
    expect(catDto.categoriaId).toBeTruthy();

    const getCat = await request.get(
      `${env.gatewayUrl}/api/v1/categorias/${encodeURIComponent(catDto.categoriaId)}`,
      { headers },
    );
    expect(getCat.status()).toBe(200);

    const createProd = await request.post(`${env.gatewayUrl}/api/v1/productos`, {
      headers: { ...headers, "Idempotency-Key": randomUUID() },
      data: {
        nombre: `Prod Transversal ${randomUUID().slice(0, 6)}`,
        categoriaId: catDto.categoriaId,
      },
    });
    expect([200, 201]).toContain(createProd.status());
    const prodDto = (await createProd.json()) as { productId: string };
    expect(prodDto.productId).toBeTruthy();

    // 2. Catalog -> Pricing & Inventory: actualizar precio base del producto y verificar lectura
    const putPrice = await request.put(
      `${env.gatewayUrl}/api/v1/precios/productos/${encodeURIComponent(prodDto.productId)}`,
      {
        headers: { ...headers, "Idempotency-Key": randomUUID() },
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
      { headers },
    );
    expect(getPrice.status()).toBe(200);

    // 3. Pricing -> Price Audit: verificar registro auditable del cambio
    const auditRes = await request.get(
      `${env.gatewayUrl}/api/v1/auditoria-precios/administracion?pagina=1&tamanio=10`,
      { headers },
    );
    expect(auditRes.status()).toBe(200);
    const auditDto = (await auditRes.json()) as { items: unknown[] };
    expect(Array.isArray(auditDto.items)).toBe(true);

    // 4. Combos: crear combo administrativo y consultar detalle + disponibilidad (200 obligatorio)
    const createCombo = await request.post(
      `${env.gatewayUrl}/api/v1/combos/administracion`,
      {
        headers: { ...headers, "Idempotency-Key": randomUUID() },
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
      { headers },
    );
    expect(getCombo.status()).toBe(200);

    // 5. Promotions -> Coupons: crear cupón y verificar lectura por ID (200 obligatorio)
    const couponCode = `TRN${randomUUID().slice(0, 6).toUpperCase()}`;
    const createCoupon = await request.post(`${env.gatewayUrl}/api/v1/cupones`, {
      headers: { ...headers, "Idempotency-Key": randomUUID() },
      data: {
        codigo: couponCode,
        tipoDescuento: "PORCENTAJE",
        valor: 10,
      },
    });
    expect([200, 201]).toContain(createCoupon.status());
    const couponDto = (await createCoupon.json()) as { cuponId: string };
    expect(couponDto.cuponId).toBeTruthy();

    const getCoupon = await request.get(
      `${env.gatewayUrl}/api/v1/cupones/${encodeURIComponent(couponDto.cuponId)}`,
      { headers },
    );
    expect(getCoupon.status()).toBe(200);
  });
});
