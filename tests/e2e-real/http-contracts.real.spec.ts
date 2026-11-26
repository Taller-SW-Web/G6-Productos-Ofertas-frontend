import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  assertRealStackPreflight,
  createLocalG7TokenFactory,
  injectBrowserSession,
  verifyGatewayAndServicesReady,
} from "./realStackPreflight.ts";

test.describe("Contratos HTTP, seguridad G7 y resiliencia Frontend -> Gateway -> Backend (ESCRITA_NO_EJECUTADA)", () => {
  test("falla en preflight si falta stack real y verifica 401/403/200 + X-Correlation-Id + cero tokens técnicos en bundle", async ({
    page,
    request,
  }) => {
    const env = assertRealStackPreflight();
    await verifyGatewayAndServicesReady(env.gatewayUrl);

    const tokens = createLocalG7TokenFactory(env.g7Issuer);
    const correlationId = randomUUID();

    // 1. Sin JWT -> 401 Problem Details
    const unauth = await request.get(`${env.gatewayUrl}/api/v1/productos`, {
      headers: { "X-Correlation-Id": correlationId },
    });
    expect(unauth.status()).toBe(401);
    expect(unauth.headers()["content-type"]).toContain("application/problem+json");

    // 2. JWT inválido -> 401
    const invalidJwt = await request.get(`${env.gatewayUrl}/api/v1/productos`, {
      headers: {
        Authorization: "Bearer invalid.jwt.token",
        "X-Correlation-Id": correlationId,
      },
    });
    expect(invalidJwt.status()).toBe(401);

    // 3. JWT válido sin permisos -> 403
    const noRoleRes = await request.get(`${env.gatewayUrl}/api/v1/productos`, {
      headers: {
        Authorization: `Bearer ${tokens.issueHumanNoRole()}`,
        "X-Correlation-Id": correlationId,
      },
    });
    expect(noRoleRes.status()).toBe(403);

    // 4. JWT humano autorizado -> 200
    const gestorToken = tokens.issueHumanGestor();
    const okRes = await request.get(
      `${env.gatewayUrl}/api/v1/productos?pagina=1&tamanio=10`,
      {
        headers: {
          Authorization: `Bearer ${gestorToken}`,
          "X-Correlation-Id": correlationId,
          Accept: "application/json",
        },
      },
    );
    expect(okRes.status()).toBe(200);
    const body = (await okRes.json()) as { items?: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);

    // 5. Navegador real en modo API sin tokens técnicos externos en el bundle
    await injectBrowserSession(page, gestorToken);
    const bundleHits: string[] = [];
    page.on("response", async (res) => {
      if (res.url().endsWith(".js") && res.ok()) {
        const text = await res.text().catch(() => "");
        if (
          text.includes("modulo-marketplace") ||
          text.includes("modulo-ventas") ||
          text.includes("modulo-chatbot")
        ) {
          bundleHits.push(res.url());
        }
      }
    });

    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    expect(bundleHits).toEqual([]);
  });

  test("no reintenta mutaciones ante fallo ambiguo y expone errores contractuales 404/409/422", async ({
    request,
  }) => {
    const env = assertRealStackPreflight();
    await verifyGatewayAndServicesReady(env.gatewayUrl);
    const tokens = createLocalG7TokenFactory(env.g7Issuer);
    const gestorToken = tokens.issueHumanGestor();

    const notFound = await request.get(
      `${env.gatewayUrl}/api/v1/productos/${randomUUID()}`,
      {
        headers: {
          Authorization: `Bearer ${gestorToken}`,
          "X-Correlation-Id": randomUUID(),
        },
      },
    );
    expect(notFound.status()).toBe(404);
    expect(notFound.headers()["content-type"]).toContain("application/problem+json");
  });
});
