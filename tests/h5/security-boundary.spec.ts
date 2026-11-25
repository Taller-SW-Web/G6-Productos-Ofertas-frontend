import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { once } from "node:events";

let provider: Server;
let providerOrigin: string;
let uiOrigin: string;
let preflightSeen = false;

test.beforeEach(async ({ baseURL }) => {
  uiOrigin = new URL(baseURL!).origin;
  preflightSeen = false;
  provider = createServer((req, res) => {
    const origin = req.headers.origin;
    if (origin === uiOrigin) {
      res.setHeader("Access-Control-Allow-Origin", uiOrigin);
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Idempotency-Key, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    }
    if (req.method === "OPTIONS") { preflightSeen = true; res.writeHead(204).end(); return; }
    if (req.url === "/api/v1/auth/login") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ accessToken: ["eyJhbGciOiJSUzI1NiJ9", "eyJzdWIiOiJpc29sYXRlZCJ9", "signature"].join("."), refreshToken: ["synthetic", "refresh"].join("-"), tokenType: "Bearer", expiresIn: 900, usuario: { id: "11111111-1111-4111-8111-111111111111", nombreCompleto: "<img src=x onerror=alert(1)>", correo: "isolated@example.test", roles: ["GESTOR_COMERCIAL"] } }));
      return;
    }
    const token = req.headers.authorization;
    if (!token) { res.writeHead(401).end(); return; }
    if (token !== "Bearer synthetic-user-with-scope") { res.writeHead(403).end(); return; }
    res.writeHead(202).end();
  });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  const address = provider.address();
  if (!address || typeof address === "string") throw new Error("NO_TEST_PORT");
  providerOrigin = `http://127.0.0.1:${address.port}`;
});
test.afterEach(async () => { provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve())); });

test("sesión anónima no accede a rutas administrativas ni emite mutaciones", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/v1/") && ["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) writes.push(request.method()); });
  await page.route("**/src/main.tsx*", async route => {
    const response = await route.fetch();
    const body = (await response.text()).replaceAll("import.meta.env.VITE_G6_READ_DEMO", "false").replaceAll("import.meta.env.VITE_DATA_MODE", JSON.stringify("api"));
    await route.fulfill({ response, body });
  });
  await page.goto("/categorias");
  await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /guardar|desactivar/i })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("CORS permite cabeceras autorizadas y el proveedor aislado exige identidad y scope", async ({ page }) => {
  await page.goto("/login");
  const result = await page.evaluate(async origin => {
    const call = (authorization?: string) => fetch(origin + "/write", { method: "POST", headers: { ...(authorization ? { Authorization: authorization } : {}), "Idempotency-Key": "synthetic-operation", "Content-Type": "application/json" }, body: "{}" }).then(r => r.status);
    return [await call(), await call("Bearer synthetic-m2m"), await call("Bearer synthetic-user-with-scope")];
  }, providerOrigin);
  expect(result).toEqual([401, 403, 202]);
  expect(preflightSeen).toBe(true);
});

test("origen no autorizado recibe bloqueo CORS del navegador", async ({ page }) => {
  await page.goto("http://localhost:" + new URL(uiOrigin).port + "/login");
  const blocked = await page.evaluate(async origin => {
    try { await fetch(origin + "/write", { method: "POST", headers: { Authorization: "Bearer synthetic-user-with-scope", "Idempotency-Key": "synthetic-operation" } }); return false; } catch { return true; }
  }, providerOrigin);
  expect(blocked).toBe(true);
});

test("CSP de proveedor aislado bloquea un script inocuo; no certifica el host real", async ({ page }) => {
  const fixture = createServer((_req, res) => { res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'none'"); res.end("<script>window.__h5Executed=true</script><p>fixture</p>"); });
  fixture.listen(0, "127.0.0.1"); await once(fixture, "listening");
  const address = fixture.address(); if (!address || typeof address === "string") throw new Error("NO_TEST_PORT");
  try {
    const response = await page.goto(`http://127.0.0.1:${address.port}/`);
    expect(response?.headers()["content-security-policy"]).toContain("script-src 'none'");
    expect(await page.evaluate(() => "__h5Executed" in window)).toBe(false);
  } finally { fixture.closeAllConnections(); await new Promise<void>(resolve => fixture.close(() => resolve())); }
});


test("identidad con HTML inocuo se presenta como texto y no ejecuta XSS", async ({ page }) => {
  await page.route("**/src/main.tsx*", async route => {
    const response = await route.fetch();
    const body = (await response.text())
      .replaceAll("import.meta.env.VITE_G6_READ_DEMO", "false")
      .replaceAll("import.meta.env.VITE_DATA_MODE", JSON.stringify("api"))
      .replaceAll("import.meta.env.VITE_G7_API_BASE", JSON.stringify(providerOrigin + "/api/v1"));
    await route.fulfill({ response, body });
  });
  let dialogOpened = false;
  page.on("dialog", async dialog => { dialogOpened = true; await dialog.dismiss(); });
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Correo electrónico", exact: true }).fill("isolated@example.test");
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Ingresar al panel", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Navegación de la aplicación" })).toBeVisible();
  await expect(page.getByText("Sesión de <img src=x onerror=alert(1)>", { exact: true }).first()).toBeVisible();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  expect(dialogOpened).toBe(false);
});

test("observa cabeceras efectivas de Vite sin atribuirlas al host desplegado", async ({ page }) => {
  const response = await page.goto("/login");
  expect(response?.status()).toBe(200);
  const headers = response?.headers() ?? {};
  console.log(JSON.stringify({ environment: "VITE_DEV_LOCAL", csp: headers["content-security-policy"] ? "OBSERVED" : "NOT_PRESENT", cors: headers["access-control-allow-origin"] ?? "NOT_PRESENT", deployed_host: "NOT_RUN" }));
});

test("dos pestañas, logout y recarga no recuperan datos privados ni persisten tokens", async ({ page, context }) => {
  await context.route("**/src/main.tsx*", async route => {
    const response = await route.fetch();
    const body = (await response.text())
      .replaceAll("import.meta.env.VITE_G6_READ_DEMO", "false")
      .replaceAll("import.meta.env.VITE_DATA_MODE", JSON.stringify("api"))
      .replaceAll("import.meta.env.VITE_G7_API_BASE", JSON.stringify(providerOrigin + "/api/v1"));
    await route.fulfill({ response, body });
  });
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Correo electrónico", exact: true }).fill("isolated@example.test");
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Ingresar al panel", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Navegación de la aplicación" })).toBeVisible();
  const other = await context.newPage();
  try {
    await other.goto("/categorias");
    await expect(other.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("navigation", { name: "Navegación de la aplicación" })).toHaveCount(0);
    for (const tab of [page, other]) {
      const storage = await tab.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookies: document.cookie }));
      expect(storage).not.toContain("synthetic-refresh");
      expect(storage).not.toContain("eyJhbGciOiJSUzI1NiJ9");
    }
  } finally { await other.close(); }
});
