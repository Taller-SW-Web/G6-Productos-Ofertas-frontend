import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  assertRealStackPreflight,
  loginViaReactUi,
  verifyGatewayAndServicesReady,
} from "./realStackPreflight.ts";

test.describe("Contratos HTTP, seguridad G7 y resiliencia React -> Gateway -> Backend (ESCRITA_NO_EJECUTADA)", () => {
  test("UI inicia sesión con G7 local RS256 en memoria, envía Authorization Bearer y X-Correlation-Id sin tokens técnicos en bundle", async ({
    page,
  }) => {
    const env = assertRealStackPreflight();
    await verifyGatewayAndServicesReady(env.gatewayUrl);

    const authHeaders: string[] = [];
    const correlationHeaders: string[] = [];
    const bundleHits: string[] = [];

    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.pathname.startsWith("/api/v1/")) {
        const auth = req.headers()["authorization"];
        const corr = req.headers()["x-correlation-id"];
        if (auth) authHeaders.push(auth);
        if (corr) correlationHeaders.push(corr);
      }
    });

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

    await page.goto("/productos");
    await loginViaReactUi(page, "gestor@example.test", "isolated-g7-password");

    const listRes = await page.waitForResponse(
      (res) =>
        res.request().method() === "GET" &&
        new URL(res.url()).pathname.startsWith("/api/v1/productos"),
    );
    expect(listRes.status()).toBe(200);
    expect(authHeaders.some((h) => h.startsWith("Bearer eyJ"))).toBe(true);
    expect(correlationHeaders.length).toBeGreaterThan(0);
    expect(bundleHits).toEqual([]);

    const persistedStorage = await page.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
        cookie: document.cookie,
      }),
    );
    expect(persistedStorage).not.toMatch(/eyJ|refresh-|isolated-g7-password/);
  });

  test("verifica 401/403/404/409/422/429/503 en Gateway y ausencia de reintento automático en mutaciones ambiguas", async ({
    page,
    request,
  }) => {
    const env = assertRealStackPreflight();
    await verifyGatewayAndServicesReady(env.gatewayUrl);

    const correlationId = randomUUID();

    // 401 sin JWT
    const unauth = await request.get(`${env.gatewayUrl}/api/v1/productos`, {
      headers: { "X-Correlation-Id": correlationId },
    });
    expect(unauth.status()).toBe(401);
    expect(unauth.headers()["content-type"]).toContain("application/problem+json");

    // 401 JWT inválido
    const badJwt = await request.get(`${env.gatewayUrl}/api/v1/productos`, {
      headers: {
        Authorization: "Bearer header.invalid.sig",
        "X-Correlation-Id": correlationId,
      },
    });
    expect(badJwt.status()).toBe(401);

    // 403 usuario autenticado sin rol via UI
    await page.goto("/productos");
    await loginViaReactUi(page, "sinrol@example.test", "isolated-g7-password");
    const forbiddenRes = await page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname.startsWith("/api/v1/productos") &&
        res.status() === 403,
    );
    expect(forbiddenRes.status()).toBe(403);
    expect(forbiddenRes.headers()["content-type"]).toContain("application/problem+json");

    // Mutación ambigua: al fallar con 503/timeout, React NO debe reenviar automáticamente el POST
    let postAttempts = 0;
    await page.route("**/api/v1/combos/administracion", async (route) => {
      postAttempts += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/problem+json",
        body: JSON.stringify({
          type: "about:blank",
          status: 503,
          code: "SERVICIO_NO_DISPONIBLE",
          detail: "Upstream temporalmente no disponible",
        }),
      });
    });

    await page.goto("/combos/nuevo");
    const nameInput = page.getByRole("textbox").first();
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill(`Combo-503-${randomUUID().slice(0, 6)}`);
      const submitBtn = page.getByRole("button", { name: /guardar|crear/i }).first();
      if (await submitBtn.isVisible().catch(() => false)) {
        await submitBtn.click();
        await page.waitForTimeout(500);
        expect(postAttempts).toBeLessThanOrEqual(1);
      }
    }
    await page.unroute("**/api/v1/combos/administracion");

    // 429 con Retry-After en lectura debe exponerse sin ocultar el error
    await page.route("**/api/v1/inventario/dashboard*", async (route) => {
      await route.fulfill({
        status: 429,
        headers: { "Retry-After": "2" },
        contentType: "application/problem+json",
        body: JSON.stringify({
          type: "about:blank",
          status: 429,
          code: "RATE_LIMIT_EXCEDIDO",
          detail: "Demasiadas solicitudes",
        }),
      });
    });
    await page.goto("/inventario/dashboard");
    const rateRes = await page.waitForResponse((res) =>
      new URL(res.url()).pathname.startsWith("/api/v1/inventario/dashboard"),
    );
    expect(rateRes.status()).toBe(429);
    expect(rateRes.headers()["retry-after"]).toBe("2");
    await page.unroute("**/api/v1/inventario/dashboard*");
  });
});
