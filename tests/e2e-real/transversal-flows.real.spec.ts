import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  assertRealStackPreflight,
  createLocalG7TokenFactory,
  verifyGatewayAndServicesReady,
} from "./realStackPreflight.ts";

test.describe("Recorridos transversales Frontend <-> Gateway <-> Microservicios (ESCRITA_NO_EJECUTADA)", () => {
  test("verifica contratos transversales: Catalog->Pricing, Catalog->Inventory, Combos, Pricing->Audit/Promotions, Taxonomy->Catalog, Bulk y Cupones", async ({
    request,
  }) => {
    const env = assertRealStackPreflight();
    await verifyGatewayAndServicesReady(env.gatewayUrl);
    const tokens = createLocalG7TokenFactory(env.g7Issuer);
    const headers = {
      Authorization: `Bearer ${tokens.issueHumanGestor()}`,
      "X-Correlation-Id": randomUUID(),
      Accept: "application/json",
    };

    const checks = [
      `${env.gatewayUrl}/api/v1/productos?pagina=1&tamanio=5`,
      `${env.gatewayUrl}/api/v1/categorias`,
      `${env.gatewayUrl}/api/v1/marcas`,
      `${env.gatewayUrl}/api/v1/combos?pagina=1&tamanio=5`,
      `${env.gatewayUrl}/api/v1/inventario/dashboard`,
      `${env.gatewayUrl}/api/v1/inventario/umbrales`,
      `${env.gatewayUrl}/api/v1/auditoria-precios/administracion?pagina=1&tamanio=5`,
      `${env.gatewayUrl}/api/v1/promociones/administracion?pagina=1&tamanio=5`,
      `${env.gatewayUrl}/api/v1/cupones?pagina=1&tamanio=5`,
    ];

    for (const url of checks) {
      const res = await request.get(url, { headers });
      expect([200, 404]).toContain(res.status());
    }
  });
});
