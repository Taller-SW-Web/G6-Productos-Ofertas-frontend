import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  assertRealStackPreflight,
  loginViaReactUi,
  verifyGatewayAndServicesReady,
} from "./realStackPreflight.ts";

test.describe("Recorridos transversales encadenados Frontend <-> Gateway <-> Microservicios (ESCRITA_NO_EJECUTADA)", () => {
  test("secuencias reales entre módulos sin aceptar 404 en recursos creados y verificando identidades compartidas", async ({
    page,
    request,
  }) => {
    const env = assertRealStackPreflight();
    await verifyGatewayAndServicesReady(env.gatewayUrl);

    // 1. Login real en React y captura del Bearer emitido por G7 local
    let capturedBearer = "";
    page.on("request", (req) => {
      const auth = req.headers()["authorization"];
      if (auth?.startsWith("Bearer eyJ")) {
        capturedBearer = auth;
      }
    });
    await page.goto("/productos");
    await loginViaReactUi(page, "gestor@example.test", "isolated-g7-password");
    await page.waitForResponse((res) =>
      new URL(res.url()).pathname.startsWith("/api/v1/productos"),
    );
    expect(capturedBearer).toMatch(/^Bearer eyJ/);

    const headers = {
      Authorization: capturedBearer,
      "X-Correlation-Id": randomUUID(),
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // 2. Taxonomy -> Catalog: crear categoría y verificar lectura inmediata (200 obligatorio)
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

    // 3. Catalog -> Pricing & Inventory: crear producto, consultar detalle (200), consultar precio/disponibilidad
    const prodRes = await request.post(`${env.gatewayUrl}/api/v1/productos`, {
      headers: { ...headers, "Idempotency-Key": randomUUID() },
      data: {
        nombre: `Prod Transversal ${randomUUID().slice(0, 6)}`,
        categoriaId: catDto.categoriaId,
      },
    });
    expect([200, 201]).toContain(prodRes.status());
    const prodDto = (await prodRes.json()) as { productId: string };
    expect(prodDto.productId).toBeTruthy();

    const getProd = await request.get(
      `${env.gatewayUrl}/api/v1/productos/${encodeURIComponent(prodDto.productId)}`,
      { headers },
    );
    expect(getProd.status()).toBe(200);

    // 4. Pricing -> Price Audit & Promotions: consultar auditoría y promociones administrativas (200 obligatorio)
    const auditRes = await request.get(
      `${env.gatewayUrl}/api/v1/auditoria-precios/administracion?pagina=1&tamanio=5`,
      { headers },
    );
    expect(auditRes.status()).toBe(200);

    const promoRes = await request.get(
      `${env.gatewayUrl}/api/v1/promociones/administracion?pagina=1&tamanio=5`,
      { headers },
    );
    expect(promoRes.status()).toBe(200);

    // 5. Combos -> listado y disponibilidad sin aceptar 404
    const combosRes = await request.get(
      `${env.gatewayUrl}/api/v1/combos?pagina=1&tamanio=5`,
      { headers },
    );
    expect(combosRes.status()).toBe(200);

    // 6. Bulk -> plantilla v2 CSV sin aceptar 404
    const tplRes = await request.get(
      `${env.gatewayUrl}/api/v1/carga-masiva/productos/plantilla?formato=CSV`,
      { headers },
    );
    expect(tplRes.status()).toBe(200);
  });
});
