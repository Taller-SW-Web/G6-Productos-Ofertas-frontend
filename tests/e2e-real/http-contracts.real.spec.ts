import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  assertRealStackPreflight,
  issueTokenFromTrustedG7,
  loginViaReactUi,
  navigateViaSpa,
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
    const [listRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          new URL(res.url()).pathname.startsWith("/api/v1/productos"),
      ),
      loginViaReactUi(page, "gestor@example.test", "isolated-g7-password"),
    ]);
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

  test("usuario sin GESTOR_COMERCIAL ve AccessDenied en React sin emitir peticiones administrativas; Gateway devuelve 401 sin firma válida y 403 con JWT válido sin permisos", async ({
    page,
    request,
  }) => {
    const env = assertRealStackPreflight();
    await verifyGatewayAndServicesReady(env.gatewayUrl);

    // 1. UI: usuario sin GESTOR_COMERCIAL recibe AccessDenied y 0 requests administrativos
    const adminRequests: string[] = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.pathname.startsWith("/api/v1/")) {
        adminRequests.push(`${req.method()} ${url.pathname}`);
      }
    });

    await page.goto("/productos");
    await loginViaReactUi(page, "sinrol@example.test", "isolated-g7-password");
    await expect(
      page.getByText(/acceso denegado|no tienes permisos/i).first(),
    ).toBeVisible();
    expect(adminRequests).toEqual([]);

    // 2. Gateway: 401 sin JWT y 401 JWT sin firma válida
    const correlationId = randomUUID();
    const unauth = await request.get(`${env.gatewayUrl}/api/v1/productos`, {
      headers: { "X-Correlation-Id": correlationId },
    });
    expect(unauth.status()).toBe(401);
    expect(unauth.headers()["content-type"]).toContain("application/problem+json");

    const badJwt = await request.get(`${env.gatewayUrl}/api/v1/productos`, {
      headers: {
        Authorization: "Bearer header.invalid.sig",
        "X-Correlation-Id": correlationId,
      },
    });
    expect(badJwt.status()).toBe(401);

    // 3. Gateway: JWT RS256 válido del MISMO emisor confiable (sinrol@example.test) -> 403 autorización
    const noPermJwt = await issueTokenFromTrustedG7(
      env.g7ApiBase,
      "sinrol@example.test",
      "isolated-g7-password",
    );
    const forbidden = await request.get(`${env.gatewayUrl}/api/v1/productos`, {
      headers: {
        Authorization: `Bearer ${noPermJwt}`,
        "X-Correlation-Id": correlationId,
      },
    });
    expect(forbidden.status()).toBe(403);
    expect(forbidden.headers()["content-type"]).toContain("application/problem+json");
  });

  test("navegación SPA conserva sesión, verifica 429 Retry-After y no reintenta mutaciones ambiguas 503", async ({
    page,
  }) => {
    const env = assertRealStackPreflight();
    await verifyGatewayAndServicesReady(env.gatewayUrl);

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

    // Navegación SPA hacia Combos (conserva sesión en memoria sin page.goto)
    await navigateViaSpa(page, "/combos");
    const newComboLink = page.locator('a[href="/combos/nuevo"]').first();
    await expect(newComboLink).toBeVisible();
    await newComboLink.click();

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

    const nameInput = page.getByRole("textbox").first();
    await expect(nameInput).toBeVisible();
    await nameInput.fill(`Combo-503-${randomUUID().slice(0, 6)}`);
    const submitBtn = page.getByRole("button", { name: /guardar|crear/i }).first();
    await expect(submitBtn).toBeVisible();
    const [err503] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "POST" &&
          new URL(res.url()).pathname === "/api/v1/combos/administracion",
      ),
      submitBtn.click(),
    ]);
    expect(err503.status()).toBe(503);
    await page.waitForTimeout(300);
    expect(postAttempts).toBe(1);
    await page.unroute("**/api/v1/combos/administracion");

    // 429 con Retry-After mediante navegación SPA a Dashboard Inventario
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
    const [rateRes] = await Promise.all([
      page.waitForResponse((res) =>
        new URL(res.url()).pathname.startsWith("/api/v1/inventario/dashboard"),
      ),
      navigateViaSpa(page, "/inventario/dashboard"),
    ]);
    expect(rateRes.status()).toBe(429);
    expect(rateRes.headers()["retry-after"]).toBe("2");
    await page.unroute("**/api/v1/inventario/dashboard*");
  });
});
