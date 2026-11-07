import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { authContractFixture } from "./auth-contract-fixture.mjs";
import { verifyAuthenticatedMock } from "./verify-authenticated-mock.mjs";

const fixture = await authContractFixture();
const artifacts = await mkdtemp(join(tmpdir(), "g6-auth-compiled-"));
const browser = await chromium.launch();
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const env = { ...process.env, VITE_G7_API_BASE: fixture.origin + "/g7/api/v1", VITE_GATEWAY_ORIGIN: fixture.origin, VITE_G6_READ_DEMO: "false" };
async function freePort() { const s = createServer(); s.listen(0, "127.0.0.1"); await once(s, "listening"); const port = s.address().port; await new Promise(r => s.close(r)); return port; }
async function run(args, environment) {
  const child = spawn(process.execPath, args, { env: environment, stdio: "inherit" });
  const [code] = await once(child, "exit"); assert.equal(code, 0, args.join(" "));
}
async function authenticate(page, account = "a") {
  await page.getByRole("heading", { name: "Iniciar sesión", exact: true }).or(page.getByRole("navigation", { name: "Navegación de la aplicación" })).first().waitFor();
  if (new URL(page.url()).pathname !== "/login") return;
  await page.getByRole("textbox", { name: "Correo electrónico", exact: true }).fill(`${account}@example.test`);
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill("isolated-fixture-password");
  await page.getByRole("button", { name: "Ingresar al panel", exact: true }).click();
  if (fixture.state.mfa) {
    await page.getByRole("button", { name: "Enviar código al correo" }).click();
    await page.getByLabel("Código de verificación").fill("123456");
    await page.getByRole("button", { name: "Verificar código", exact: true }).click();
  }
  if (fixture.state.roles.includes("GESTOR_COMERCIAL")) await page.getByRole("navigation", { name: "Navegación de la aplicación" }).waitFor();
  else await page.getByRole("heading", { name: "Acceso denegado", exact: true }).waitFor();
}
async function visit(page, base, path, account) { await page.goto(base + path); await page.waitForURL("**/login"); await authenticate(page, account); }
try {
  for (const mode of ["mock", "api"]) {
    const output = join(artifacts, mode);
    await run(["node_modules/vite/bin/vite.js", "build", "--outDir", output], { ...env, VITE_DATA_MODE: mode });
    const port = await freePort(), base = `http://127.0.0.1:${port}`;
    const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--outDir", output, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { env, stdio: "ignore" });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(15000);
    const errors = []; page.on("pageerror", () => errors.push("browser-error"));
    try {
      for (let n = 0; n < 100; n++) { try { if ((await fetch(base)).ok) break; } catch { /* Preview is still starting. */ } await new Promise(r => setTimeout(r, 100)); }
      await run(["scripts/verify-production.mjs", mode, base], env);
      fixture.state.roles = ["CLIENTE"];
      await visit(page, base, "/combos");
      check(await page.getByRole("navigation").count() === 0, "rol insuficiente no monta el panel");
      await page.getByRole("button", { name: "Cerrar sesión" }).click();
      fixture.state.roles = ["GESTOR_COMERCIAL"];
      fixture.state.expiresIn = 2;
      fixture.state.mfa = true;
      await page.getByRole("textbox", { name: "Correo electrónico", exact: true }).fill("a@example.test");
      await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill("isolated-fixture-password");
      await page.getByRole("button", { name: "Ingresar al panel", exact: true }).click();
      await page.getByRole("heading", { name: "Verificar identidad", exact: true }).waitFor();
      check(await page.getByRole("navigation").count() === 0, "MFA pendiente no monta el panel");
      await page.getByLabel("Código de verificación").fill("000000");
      await page.getByRole("button", { name: "Verificar código", exact: true }).click();
      await page.getByRole("alert").waitFor(); checks++;
      await page.getByLabel("Código de verificación").fill("123456");
      await page.getByRole("button", { name: "Verificar código", exact: true }).click();
      await page.getByRole("navigation", { name: "Navegación de la aplicación" }).waitFor();
      const before = fixture.state.calls.filter(c => c.path.endsWith("/auth/refresh")).length;
      for (let n = 0; n < 100 && fixture.state.calls.filter(c => c.path.endsWith("/auth/refresh")).length === before; n++) await new Promise(r => setTimeout(r, 100));
      check(fixture.state.calls.filter(c => c.path.endsWith("/auth/refresh")).length > before, "renovación de sesión vencida");
      fixture.state.failure = "REFRESCO_INVALIDO";
      await page.waitForURL("**/login");
      await page.getByRole("alert").filter({ hasText: "Tu sesión terminó" }).waitFor(); checks++;
      fixture.state.failure = ""; fixture.state.expiresIn = 900; fixture.state.mfa = false;
      if (mode === "mock") {
        await verifyAuthenticatedMock(page, base, authenticate);
        checks++;
        // Real UI write A, logout, B, then A: private data retained only for A.
        await visit(page, base, "/marcas/nueva", "a");
        await page.getByLabel("Nombre", { exact: false }).fill("Marca privada A");
        await page.getByRole("button", { name: "Crear marca", exact: true }).click();
        await page.getByRole("heading", { name: "Marca privada A", exact: true }).waitFor();
        await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
        await page.waitForURL("**/login"); await page.getByRole("heading", { name: "Iniciar sesión", exact: true }).waitFor();
        await authenticate(page, "b");
        await page.getByRole("link", { name: "Marcas", exact: true }).click();
        await page.getByRole("heading", { level: 1 }).waitFor();
        check(await page.getByText("Marca privada A", { exact: true }).count() === 0, "B no hereda la marca privada de A");
        await visit(page, base, "/marcas", "a");
        await page.getByRole("row").filter({ hasText: "Marca privada A" }).waitFor(); checks++;
        const other = await context.newPage();
        await visit(other, base, "/marcas", "a");
        await other.getByRole("row").filter({ hasText: "Marca privada A" }).waitFor(); checks++;
        await visit(page, base, "/marcas/nueva", "a");
        await page.getByLabel("Nombre", { exact: false }).fill("Marca sincronizada A");
        await page.getByRole("button", { name: "Crear marca", exact: true }).click();
        await other.getByRole("row").filter({ hasText: "Marca sincronizada A" }).waitFor(); checks++;
        await visit(page, base, "/marcas", "b");
        check(await page.getByText("Marca sincronizada A", { exact: true }).count() === 0, "namespace B ignora los datos sincronizados de A");
        await other.close();
      } else {
        fixture.state.mfa = true;
        await visit(page, base, "/productos/nuevo");
        check(new URL(page.url()).pathname === "/productos/nuevo", "retorno seguro después de MFA");
        await page.getByLabel("Nombre del producto").fill("Producto contractual");
        await page.getByLabel("Descripción comercial").fill("Prueba aislada");
        await page.getByLabel("SKU Base").fill("SKU-CONTRACT");
        await page.getByLabel("Precio base inicial (S/.)").fill("20");
        await page.getByRole("button", { name: "Guardar borrador", exact: true }).click();
        await page.getByText(/409, SKU_DUPLICADO/).waitFor();
        check(fixture.state.calls.filter(c => c.method === "POST" && c.path === "/api/v1/productos").length === 1, "escritura nunca se repite");
        await visit(page, base, "/cupones");
        await page.getByRole("heading", { name: "Cupones de descuento", exact: true }).waitFor();
        await page.getByText("Todavía no hay cupones", { exact: true }).waitFor();
        check(fixture.state.calls.some(c => c.path === "/api/v1/cupones"), "Promociones conectado");
        await visit(page, base, "/carga-masiva/descargas");
        await page.getByRole("heading", { level: 1 }).waitFor();
        // Connected operation is exercised by the existing native HTTP UI suite;
        // compiled navigation must still expose its actual template control.
        const template = page.getByRole("button", { name: "Descargar CSV de ejemplo", exact: true });
        const download = page.waitForEvent("download"); await template.click(); await download; checks++;
        for (const [status, code] of [[403, "SCOPE_INSUFICIENTE"], [401, "DESCONOCIDO"], [401, "TOKEN_INVALIDO"]]) {
          fixture.state.gatewayStatus = status; fixture.state.gatewayCode = code;
          const refreshes = fixture.state.calls.filter(c => c.path.endsWith("/auth/refresh")).length;
          await visit(page, base, "/productos");
          if (code === "TOKEN_INVALIDO") {
            await page.waitForURL("**/login");
            await page.waitForFunction(() => performance.getEntriesByType("navigation")[0]?.type === "reload");
            await page.getByRole("heading", { name: "Iniciar sesión", exact: true }).waitFor(); checks++;
          }
          else { await page.getByRole("navigation", { name: "Navegación de la aplicación" }).waitFor(); check(fixture.state.calls.filter(c => c.path.endsWith("/auth/refresh")).length === refreshes, "401 desconocido y 403 no renuevan sesión"); }
        }
        fixture.state.gatewayStatus = 200; fixture.state.mfa = false;
        await run(["scripts/testing/verify-isolated-release.mjs"], { ...env,
          G6_ISOLATED_PREVIEW_URL: base, G6_ISOLATED_G7_API_BASE: fixture.origin + "/g7/api/v1",
          G6_ISOLATED_GATEWAY_ORIGIN: fixture.origin }); checks++;
      }
      check(errors.length === 0, "sin errores JavaScript");
      check(!/fixture-refresh|eyJhbGci|isolated-fixture-password/.test(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }))), "sin secretos persistidos");
      console.log(`PASS autenticación compilada ${mode}; proveedor contractual aislado, NO homologación real`);
    } catch (error) {
      console.error("Últimas operaciones de fixture al fallar:", fixture.state.calls.slice(-12));
      console.error(await page.locator("main").innerText().catch(() => "Sin pantalla"));
      throw error;
    } finally { await context.close(); preview.kill(); await once(preview, "exit"); }
  }
  console.log(`PASS ${checks} comprobaciones adicionales del build autenticado`);
} finally { await browser.close(); await fixture.close(); }
