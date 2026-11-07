import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Contract provider isolated on loopback. Real browser fetch, no token injection.
let provider: Server;
let base: string;
let mfa: boolean;
let failure: string;
let expiry: number;
let roles: string[];
let demo: boolean;
let fullName: string;
let holdRefresh: boolean;
let releaseRefresh: (() => void) | undefined;
let calls: { path: string; body: Record<string, unknown> }[];
const dto = {
  accessToken: "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJpc29sYXRlZCJ9.signature",
  refreshToken: "isolated-contract-refresh", tokenType: "Bearer", expiresIn: 900,
  usuario: { id: "11111111-1111-4111-8111-111111111111", nombreCompleto: "Gestora de prueba", correo: "isolated@example.test", roles: ["GESTOR_COMERCIAL"] },
};
test.beforeEach(async ({ page }) => {
  mfa = false; failure = ""; expiry = 900; calls = []; roles = ["GESTOR_COMERCIAL"]; demo = false; fullName = dto.usuario.nombreCompleto; holdRefresh = false; releaseRefresh = undefined;
  provider = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? 5173}`);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
    let raw = "";
    for await (const chunk of req) raw += String(chunk);
    const body = JSON.parse(raw || "{}") as Record<string, unknown>;
    const path = req.url ?? "";
    calls.push({ path, body });
    res.setHeader("Content-Type", "application/json");
    if (path.endsWith("/logout")) { req.socket.destroy(); return; }
    if (path.endsWith("/refresh") && holdRefresh) await new Promise<void>(resolve => { releaseRefresh = resolve; });
    if (failure) { res.writeHead(failure === "UNAVAILABLE" ? 503 : failure === "OTP_EXPIRADO" ? 410 : 401).end(JSON.stringify({ code: failure, detail: "SENSITIVE_DETAIL" })); return; }
    if (path.endsWith("/login") && mfa) { res.end(JSON.stringify({ mfaRequerido: true, challengeToken: "isolated-challenge", expiraEn: 300 })); return; }
    if (path.endsWith("/solicitar")) { res.writeHead(202).end("{}"); return; }
    res.end(JSON.stringify({ ...dto, usuario: { ...dto.usuario, nombreCompleto: fullName, roles }, expiresIn: expiry, ...(path.endsWith("/refresh") ? { refreshToken: `isolated-rotation-${calls.length}` } : {}) }));
  });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  const address = provider.address();
  if (!address || typeof address === "string") throw new Error("NO_PORT");
  base = `http://127.0.0.1:${address.port}/api/v1`;
  await page.route("**/src/main.tsx*", async route => {
    const response = await route.fetch();
    let body = await response.text();
    for (const [key, value] of [["VITE_G6_READ_DEMO", demo ? "true" : "false"], ["VITE_DATA_MODE", "api"], ["VITE_GATEWAY_ORIGIN", `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? 5173}`], ["VITE_G7_API_BASE", base]]) {
      body = body.replaceAll(`import.meta.env.${key}`, JSON.stringify(value));
    }
    await route.fulfill({ response, body });
  });
});
test.afterEach(async () => {
  releaseRefresh?.();
  provider.closeAllConnections();
  await new Promise<void>(resolve => provider.close(() => resolve()));
});
async function login(page: Page) {
  await page.getByRole("textbox", { name: "Correo electrónico", exact: true }).fill("isolated@example.test");
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill("isolated-password");
  await page.getByRole("button", { name: "Ingresar al panel", exact: true }).click();
}

async function draftBeforeRefresh(page: Page) {
  const writes: string[] = [];
  page.on("request", request => {
    if (request.url().startsWith(`http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? 5173}/api/v1/`) && ["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) writes.push(request.method());
  });
  await page.clock.install({ time: new Date("2026-11-06T12:00:00Z") });
  expiry = 120;
  await page.route(`http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? 5173}/api/v1/**`, route => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith("/categorias") ? { categories: [{ categoria_id: "cat-api", name: "Categoría", status: "ACTIVA" }] }
      : path.endsWith("/marcas") ? { brands: [{ marca_id: "brand-api", name: "Marca", status: "ACTIVA" }] }
      : path.endsWith("/tipos-producto") ? { items: [{ tipoProductoId: "type-api", nombre: "Tipo", estado: "ACTIVO" }], meta: { pagina: 1, tamanio: 100, total: 1, totalPaginas: 1 } }
      : { tipoProducto: { tipoProductoId: "type-api" }, schemaVersion: 1, caracteristicas: [] };
    return route.fulfill({ json: body });
  });
  await page.goto("/productos/nuevo");
  await login(page);
  const input = page.getByLabel("Nombre del producto");
  await input.fill("Borrador sin guardar");
  await expect(page.getByRole("button", { name: "Guardar borrador", exact: true })).toBeEnabled();
  const node = await input.elementHandle();
  const header = await page.locator(".mantine-AppShell-header").elementHandle();
  holdRefresh = true;
  await page.clock.fastForward(120001);
  await expect.poll(() => Boolean(releaseRefresh)).toBe(true);
  return { input, node: node!, header: header!, writes };
}

test("regresión R2: refresh demorado conserva el borrador y los mismos nodos DOM", async ({ page }) => {
  const { input, node, header, writes } = await draftBeforeRefresh(page);
  const renewed = page.waitForResponse(response => response.url().endsWith("/auth/refresh") && response.status() === 200);
  void renewed.catch(() => undefined);
  try {
    expect(await node.evaluate(element => element.isConnected)).toBe(true);
    expect(await header.evaluate(element => element.isConnected)).toBe(true);
    await expect(input).toHaveValue("Borrador sin guardar");
  } finally { holdRefresh = false; expiry = 900; releaseRefresh?.(); }
  await (await renewed).finished();
  await page.clock.fastForward(1000);
  await expect.poll(() => calls.filter(call => call.path.endsWith("/refresh")).length).toBeGreaterThanOrEqual(1);
  await expect(input).toHaveValue("Borrador sin guardar");
  expect(await node.evaluate(element => element.isConnected)).toBe(true);
  expect(await header.evaluate(element => element.isConnected)).toBe(true);
  expect(writes).toEqual([]);
});

test("regresión R2: refresh rechazado retira el borrador sin reintentar escrituras", async ({ page }) => {
  const { writes } = await draftBeforeRefresh(page);
  failure = "REFRESCO_INVALIDO";
  holdRefresh = false;
  releaseRefresh?.();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByLabel("Nombre del producto")).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("regresión R2: error OTP mantiene foco en el mensaje al terminar busy", async ({ page }) => {
  mfa = true;
  await page.goto("/login");
  await login(page);
  await expect(page.getByLabel("Código de verificación")).toBeFocused();
  for (const code of ["CODIGO_INVALIDO", "OTP_EXPIRADO", "CODIGO_INVALIDO"]) {
    failure = code;
    await page.getByLabel("Código de verificación").fill("000000");
    await page.getByRole("button", { name: "Verificar código", exact: true }).click();
    await expect(page.getByRole("alert").locator("..")).toBeFocused();
    await expect(page.getByLabel("Código de verificación")).not.toBeFocused();
    await expect(page.getByRole("navigation")).toHaveCount(0);
  }
});

test("regresión R2: cancelar MFA no anuncia cierre de una sesión autenticada", async ({ page }) => {
  mfa = true;
  await page.goto("/login");
  await login(page);
  await page.getByRole("button", { name: "Volver al inicio de sesión" }).click();
  await expect(page.getByRole("status")).toContainText("Cancelaste la verificación");
  await expect(page.getByText("Cerraste sesión.", { exact: true })).toHaveCount(0);
  expect(calls.filter(call => call.path.endsWith("/logout"))).toHaveLength(0);
  await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
});

test("regresión R2: brandBar permanece dentro de la cabecera en ancho y altura pequeños", async ({ page }) => {
  for (const width of [320, 375, 768, 1024]) {
    await page.setViewportSize({ width, height: 568 });
    await page.goto("/login");
    const region = page.getByRole("region", { name: "Inka Athletics, Productos y Ofertas" });
    const panel = await region.boundingBox();
    const bar = await region.locator("header").boundingBox();
    expect(bar!.y).toBeGreaterThanOrEqual(panel!.y);
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(panel!.y + panel!.height);
  }
});

for (const width of [320, 375, 768, 1024]) {
  test(`regresión R2: encabezado, identidad y menú utilizables a ${width}px`, async ({ page }) => {
    fullName = "Gabriela María de los Ángeles Fernández de la Fuente Gestora Comercial con nombre extenso";
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/combos");
    await login(page);
    const header = page.locator(".mantine-AppShell-header");
    const logout = header.getByRole("button", { name: "Cerrar sesión", exact: true });
    await expect(logout).toBeVisible();
    const headerBox = await header.boundingBox(), button = await logout.boundingBox();
    expect(button!.x).toBeGreaterThanOrEqual(0);
    expect(button!.x + button!.width).toBeLessThanOrEqual(width);
    expect(button!.y + button!.height).toBeLessThanOrEqual(headerBox!.y + headerBox!.height);
    expect(await header.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const nav = page.getByRole("navigation", { name: "Navegación de la aplicación", exact: true });
    if (width < 768) {
      await expect(nav).toBeHidden();
      await page.getByRole("button", { name: "Abrir menú de navegación" }).focus();
      await page.keyboard.press("Space");
      await expect(page.getByRole("button", { name: "Cerrar menú de navegación" })).toHaveAttribute("aria-expanded", "true");
    }
    await expect(nav).toBeVisible();
    const link = nav.getByRole("link", { name: "Control de stock", exact: true });
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await expect(page).toHaveURL(/\/inventario$/);
    if (width < 768) await expect(nav).toBeHidden();
    await expect(logout).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`encabezado-${width}.png`) });
    await logout.click();
    await expect(page).toHaveURL(/\/login$/);
  });
}

test("el panel deniega roles ajenos y reevalúa el rol al renovar", async ({ page }) => {
  roles = ["ADMIN_SISTEMA"];
  await page.goto("/productos");
  await login(page);
  await expect(page.getByRole("heading", { name: "Acceso denegado" })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  roles = ["GESTOR_COMERCIAL"];
  expiry = 2;
  await login(page);
  await expect(page.getByRole("navigation", { name: "Navegación de la aplicación" })).toBeVisible();
  roles = ["CLIENTE"];
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("navigation")).toHaveCount(0);
});

test("login y MFA permiten usar todos los controles en anchos pequeños y zoom equivalente a 200%", async ({ page }) => {
  test.setTimeout(120000);
  mfa = true;
  // 720 × 450 equivale al área CSS de una ventana 1440 × 900 con zoom 200%.
  for (const [width, height] of [[320, 568], [375, 667], [768, 600], [1024, 600], [1366, 600], [1440, 600], [720, 450], [320, 320]]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await login(page);
    await expect(page.getByRole("heading", { name: "Verificar identidad" })).toBeVisible();
    for (const control of await page.locator("input, button").all()) {
      await control.scrollIntoViewIfNeeded();
      const box = await control.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width!);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height!);
    }
    await page.getByRole("button", { name: "Enviar código al correo" }).click();
    await expect(page.getByRole("status")).toContainText("Enviamos el código");
    await page.mouse.move(0, 0);
    expect(await page.getByRole("button", { name: "Enviar código al correo" }).evaluate(element => getComputedStyle(element).color)).toBe("rgb(194, 65, 12)");
    await page.getByRole("button", { name: "Enviar código al correo" }).hover();
    expect(await page.getByRole("button", { name: "Enviar código al correo" }).evaluate(element => getComputedStyle(element).color)).toBe("rgb(27, 24, 18)");
    await page.mouse.move(0, 0);
    await page.screenshot({ path: test.info().outputPath(`mfa-responsive-${width}x${height}.png`), fullPage: true });
  }
});
async function expectLoginInsideViewport(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => ({
    width: document.documentElement.scrollWidth - innerWidth,
    height: document.documentElement.scrollHeight - innerHeight,
  }))).toEqual({ width: 0, height: 0 });
  const viewport = page.viewportSize()!;
  for (const control of [page.getByRole("heading", { level: 1 }), page.locator("footer"), page.getByRole("button", { name: /Ingresar al panel|Verificar código/, exact: true })]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  }
}
test("la entrada de productos conserva el login y consulta el canal elegido sin JWT", async ({ page }) => {
  const reads: string[] = [];
  await page.route("**/api/v1/productos?**", async route => {
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers()).not.toHaveProperty("authorization");
    reads.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      items: [{ product_id: "isolated-product", name: "Producto contractual de lectura" }], pagina: 1, tamanio: 20, total: 1,
    }) });
  });
  await page.goto("/productos");
  await expect(page).toHaveURL(/\/login$/);
  await login(page);
  await expect(page.getByRole("heading", { name: "Consultas de los módulos", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: /^Canal/ }).click();
  await page.getByRole("option", { name: "MARKETPLACE", exact: true }).click();
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(page.getByText("Producto contractual de lectura", { exact: true })).toBeVisible();
  expect(reads).toHaveLength(1);
  const read = reads[0];
  if (!read) throw new Error("No se registró la consulta de productos.");
  expect(new URL(read).searchParams.get("canal")).toBe("MARKETPLACE");
  expect(calls.filter(call => call.path.endsWith("/login"))).toHaveLength(1);
});

test("el shell autenticado permanece montado al cambiar repetidamente de sección", async ({ page }) => {
  await page.goto("/combos");
  await login(page);
  const navigation = page.getByRole("navigation", { name: "Navegación de la aplicación", exact: true });
  await expect(navigation).toBeVisible();
  await page.locator(".mantine-AppShell-header").evaluate(element => element.setAttribute("data-auth-shell-probe", "header"));
  await navigation.evaluate(element => element.setAttribute("data-auth-shell-probe", "navigation"));
  for (const [label, path] of [
    ["Control de stock", "/inventario"], ["Consultar precios", "/precios"],
    ["Gestión de combos", "/combos"], ["Control de stock", "/inventario"],
    ["Consultar precios", "/precios"], ["Gestión de combos", "/combos"],
  ]) {
    await navigation.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.locator('[data-auth-shell-probe="header"]')).toBeVisible();
    await expect(page.locator('[data-auth-shell-probe="navigation"]')).toBeVisible();
  }
  expect(calls.filter(call => call.path.endsWith("/login"))).toHaveLength(1);
});
test("login y error de credenciales caben en ventanas desktop de menor altura", async ({ page }) => {
  test.setTimeout(60000);
  for (const [width, height] of [[1440, 900], [1366, 768], [1440, 720], [1366, 640], [1440, 600]]) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
    await expectLoginInsideViewport(page);
    await page.screenshot({ path: test.info().outputPath(`login-inicial-${width}x${height}.png`) });
    failure = "CREDENCIALES_INVALIDAS";
    await login(page);
    await expect(page.getByRole("alert")).toContainText("El correo o la contraseña no son correctos");
    await expectLoginInsideViewport(page);
    await page.screenshot({ path: test.info().outputPath(`login-${width}x${height}.png`) });
  }
});
test("MFA y código vencido caben completos en ventanas desktop de menor altura", async ({ page }) => {
  test.setTimeout(60000);
  mfa = true;
  for (const height of [900, 720, 640, 600]) {
    failure = "";
    await page.setViewportSize({ width: 1440, height });
    await page.goto("/login");
    await login(page);
    await expect(page.getByLabel("Código de verificación")).toBeEnabled();
    await expectLoginInsideViewport(page);
    failure = "OTP_EXPIRADO";
    await page.getByLabel("Código de verificación").fill("123456");
    await page.getByRole("button", { name: "Verificar código", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("El código venció");
    await expectLoginInsideViewport(page);
    await page.screenshot({ path: test.info().outputPath(`mfa-1440x${height}.png`) });
  }
});
test("la demo pública aprobada mantiene lectura aislada y no abre administración", async ({ page }) => {
  demo = true;
  await page.route("**/src/app/routes/AppRoutes.tsx*", async route => {
    const response = await route.fetch();
    const body = (await response.text()).replaceAll("import.meta.env.VITE_G6_READ_DEMO", '"true"');
    await route.fulfill({ response, body });
  });
  await page.route("**/api/v1/**", route => route.abort());
  await page.goto("/demo/g6/productos");
  await expect(page.getByRole("heading", { name: "G6 · Productos y Ofertas", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navegación de la aplicación" })).toHaveCount(0);
  expect(calls).toEqual([]);
  await page.goto("/productos");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("navigation")).toHaveCount(0);
});
for (const path of ["/", "/productos", "/productos/nuevo", "/precios", "/inventario", "/combos", "/carga-masiva", "/categorias", "/promociones", "/cupones", "/recomendaciones", "/precios/auditoria"]) {
  test(`sin sesión bloquea ${path} antes de montar el shell`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation")).toHaveCount(0);
    expect(calls).toEqual([]);
  });
}
for (const mode of ["lost", "500"] as const) test(`R4-05 logout ${mode}: limpieza local incondicional, atrás y recarga`, async ({ page }) => {
  let logoutRequests = 0;
  await page.route(base + "/auth/logout", async route => {
    logoutRequests++;
    if (mode === "500") await route.fulfill({ status: 500, json: {} });
    else await route.abort("failed");
  });
  await page.goto("/precios");
  await login(page);
  await expect(page.getByRole("navigation", { name: "Navegación de la aplicación", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Consultar precios", exact: true }).click();
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect.poll(() => logoutRequests).toBe(1);
  await page.waitForFunction(() => performance.getEntriesByType("navigation")[0] && (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).type === "reload");
  await page.goBack();
  if (page.url() !== "about:blank") {
    await expect(page.getByRole("button", { name: "Ingresar al panel", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation")).toHaveCount(0);
  }
  await page.goto("/precios");
  await expect(page).toHaveURL(/\/login$/);
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ingresar al panel", exact: true })).toBeVisible();
});

test("login conserva destino interno; logout sin red, atrás y recarga no recuperan sesión", async ({ page }) => {
  await page.goto("/combos?vista=lista");
  await login(page);
  await expect(page).toHaveURL(/\/combos\?vista=lista$/);
  await expect(page.getByText("Sesión de Gestora de prueba", { exact: true })).toBeVisible();
  await page.evaluate(() => { history.pushState({}, "", "/login"); dispatchEvent(new PopStateEvent("popstate")); });
  await expect(page).toHaveURL(/\/precios$/);
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await login(page);
  await expect(page.getByRole("navigation", { name: "Navegación de la aplicación" })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }))).not.toMatch(/isolated|eyJ|refreshToken|challengeToken/);
});
test("validaciones requeridas, ojo, teclado y captura 1440", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Ingresar al panel", exact: true }).click();
  expect(calls).toEqual([]);
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill("secret");
  await page.getByRole("button", { name: "Mostrar contraseña" }).click();
  await expect(page.getByRole("textbox", { name: "Contraseña", exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ocultar contraseña" }).click();
  await expect(page.getByRole("textbox", { name: "Contraseña", exact: true })).toHaveAttribute("type", "password");
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill("");
  await page.getByRole("textbox", { name: "Correo electrónico", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox", { name: "Contraseña", exact: true })).toBeFocused();
  expect(await page.getByRole("textbox", { name: "Contraseña", exact: true }).evaluate(el => getComputedStyle(el).outlineColor)).toBe("rgb(67, 97, 238)");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Mostrar contraseña" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByRole("textbox", { name: "Contraseña", exact: true })).toHaveAttribute("type", "text");
  await page.keyboard.press("Space");
  await expect(page.getByRole("textbox", { name: "Contraseña", exact: true })).toHaveAttribute("type", "password");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
  await page.getByRole("heading", { level: 1 }).click();
  await page.screenshot({ path: test.info().outputPath("login-general-1440.png"), fullPage: true });
  const mockup = resolve("MK-LOGIN/index.html");
  if (existsSync(mockup)) {
    await page.goto(pathToFileURL(mockup).href);
    await page.screenshot({ path: test.info().outputPath("login-referencia-1440.png"), fullPage: true });
  }
});
test("renovación y expiración sin actividad retiran el contenido administrativo", async ({ page }) => {
  expiry = 1;
  await page.goto("/combos");
  await login(page);
  await expect(page.getByText("Sesión de Gestora de prueba", { exact: true })).toBeVisible();
  await expect.poll(() => calls.filter(call => call.path.endsWith("/refresh")).length).toBeGreaterThan(0);
  failure = "REFRESCO_INVALIDO";
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("Tu sesión terminó");
});
test("credenciales incorrectas y servicio indisponible conservan acceso bloqueado", async ({ page }) => {
  await page.goto("/login");
  failure = "CREDENCIALES_INVALIDAS";
  await login(page);
  await expect(page.getByRole("alert")).toContainText("El correo o la contraseña no son correctos");
  await expect(page.getByRole("alert").locator("..")).toBeFocused();
  await expect(page.getByText("SENSITIVE_DETAIL")).toHaveCount(0);
  failure = "UNAVAILABLE";
  await login(page);
  await expect(page.getByRole("alert")).toContainText("No pudimos conectar con Seguridad");
  await expect(page.getByRole("navigation")).toHaveCount(0);
});
test("MFA pendiente, código inválido/vencido y confirmación con la misma sesión", async ({ page }) => {
  mfa = true;
  await page.goto("/combos");
  await login(page);
  await expect(page.getByLabel("Código de verificación")).toBeFocused();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await page.getByRole("button", { name: "Enviar código al correo" }).click();
  await expect(page.getByRole("status")).toContainText("Enviamos el código");
  for (const [code, message] of [["CODIGO_INVALIDO", "El código no es correcto"], ["OTP_EXPIRADO", "El código venció"]]) {
    failure = code!;
    await page.getByLabel("Código de verificación").fill("000000");
    await page.getByRole("button", { name: "Verificar código" }).click();
    await expect(page.getByRole("alert")).toContainText(message!);
    await expect(page.getByRole("navigation")).toHaveCount(0);
  }
  failure = "TOKEN_INVALIDO";
  await page.getByLabel("Código de verificación").fill("000000");
  await page.getByRole("button", { name: "Verificar código" }).click();
  await expect(page.getByRole("alert")).toContainText("El desafío terminó");
  failure = "";
  await login(page);
  await page.getByLabel("Código de verificación").fill("123456");
  await page.getByRole("button", { name: "Verificar código" }).click();
  await expect(page).toHaveURL(/\/combos$/);
  expect(calls.filter(call => call.path.endsWith("/verificar"))).toHaveLength(4);
});
