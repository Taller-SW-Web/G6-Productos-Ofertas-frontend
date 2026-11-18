import assert from "node:assert/strict";
import { chromium } from "playwright";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const HOST_INMUTABLE = /^g6-productos-ofertas-[a-z0-9-]+\.vercel\.app$/;
const RUTAS = ["/", "/precios", "/productos", "/categorias", "/carga-masiva"];

export function esDestinoAutenticacion(value, baseOrigin) {
  let url;
  try {
    url = new URL(value, baseOrigin);
  } catch {
    return false;
  }
  const pathLooksLikeAuth = /(?:^|\/)(?:login|log-in|signin|sign-in|sso(?:-[^/]*)?|auth|oauth)(?:\/|$)/i.test(url.pathname);
  const hostLooksLikeAuth = /^(?:auth|login|sso)\./i.test(url.hostname) ||
    (url.hostname === "vercel.com" && /(?:^|\/)(?:login|sso-api|auth)(?:\/|$)/i.test(url.pathname));
  return pathLooksLikeAuth || hostLooksLikeAuth;
}

export function respuestaRecursoCorrecta(status) {
  return (status >= 200 && status < 300) || status === 304;
}

export function clasificarRespuesta({ url, location, status, isNavigation, baseOrigin }) {
  if (isNavigation) {
    const responseUrl = new URL(url, baseOrigin);
    const isApplicationLogin = responseUrl.origin === baseOrigin && /^\/login(?:\/|$)/i.test(responseUrl.pathname);
    if (location) {
      const destination = new URL(location, responseUrl);
      if (destination.origin === baseOrigin && /^\/login(?:\/|$)/i.test(destination.pathname)) return "application-login";
      if (esDestinoAutenticacion(destination.href, baseOrigin)) return "authentication";
    }
    if (isApplicationLogin) return "application-login";
    if (esDestinoAutenticacion(url, baseOrigin)) return "authentication";
    return status >= 400 ? "application" : null;
  }
  return new URL(url).origin === baseOrigin && !respuestaRecursoCorrecta(status) ? "resource" : null;
}

export function validarOrigenSmoke(input, bypassSecret = "") {
  const base = new URL(input);
  assert(["https:", "http:"].includes(base.protocol) && !base.username && !base.password, "URL http(s) sin credenciales requerida");
  assert.equal(base.search, "", "La URL base no puede contener parámetros.");
  assert.equal(base.hash, "", "La URL base no puede contener fragmentos.");
  assert.equal(base.pathname, "/", "La URL base debe identificar el origen, sin ruta adicional.");
  if (bypassSecret) {
    assert.equal(base.protocol, "https:", "El bypass solo puede usarse con HTTPS.");
    assert.equal(base.port, "", "El bypass no puede usarse con un puerto personalizado.");
    assert.match(base.hostname, HOST_INMUTABLE, "El bypass solo puede usarse con la URL inmutable validada del proyecto.");
  }
  return base;
}

export async function ejecutarSmoke({
  originInput = process.argv[2] ?? "http://127.0.0.1:5174",
  bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
  chromiumLauncher = chromium,
} = {}) {
const base = validarOrigenSmoke(originInput, bypassSecret);
const browser = await chromiumLauncher.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(20_000);
const applicationFailures = [];
const resourceFailures = [];
const authenticationRedirects = [];
const assets = new Set();

page.on("pageerror", (error) => applicationFailures.push(`Error de JavaScript: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") applicationFailures.push(`Error de consola: ${message.text()}`);
});
page.on("requestfailed", (request) => {
  applicationFailures.push(`Solicitud fallida: ${new URL(request.url()).pathname}`);
});
page.on("response", (response) => {
  const request = response.request();
  const responseUrl = new URL(response.url());
  const location = response.headers().location;
  const category = clasificarRespuesta({
    url: response.url(),
    location,
    status: response.status(),
    isNavigation: request.isNavigationRequest(),
    baseOrigin: base.origin,
  });
  if (category === "authentication") {
    authenticationRedirects.push(`${response.status()} ${response.url()}`);
  } else if (category === "application") {
    applicationFailures.push(`HTTP ${response.status()} en documento: ${responseUrl.pathname}`);
  } else if (category === "resource") {
    resourceFailures.push(`HTTP ${response.status()} (${request.resourceType()}): ${responseUrl.pathname}`);
  }

  if (["script", "stylesheet"].includes(request.resourceType())) assets.add(response.url());
});

try {
  if (bypassSecret) {
    const authResponse = await context.request.get(base.origin, {
      headers: {
        "x-vercel-protection-bypass": bypassSecret,
        "x-vercel-set-bypass-cookie": "true",
      },
      maxRedirects: 0,
    });
    const location = authResponse.headers().location;
    if (location && (new URL(location, base.origin).origin !== base.origin || esDestinoAutenticacion(location, base.origin))) {
      authenticationRedirects.push(`Intercambio de bypass redirigió a ${new URL(location, base.origin).origin}${new URL(location, base.origin).pathname}`);
    }
    const cookies = await context.cookies(base.origin);
    const authenticated = cookies.some((cookie) =>
      cookie.name === "_vercel_jwt" && cookie.secure && cookie.domain.replace(/^\./, "") === base.hostname,
    );
    assert(authResponse.status() < 400 && authenticated, "El bypass no estableció la cookie segura de Vercel.");
  }

  await page.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== base.origin) {
      if (route.request().isNavigationRequest() || route.request().redirectedFrom()) {
        const entry = `${requestUrl.origin}${requestUrl.pathname}`;
        if (esDestinoAutenticacion(requestUrl.href, base.origin)) authenticationRedirects.push(entry);
        else applicationFailures.push(`Navegación o redirección a un origen externo bloqueada: ${entry}`);
        await route.abort();
        return;
      }
      // Recursos decorativos externos no reciben el secreto de bypass.
      await route.continue();
      return;
    }
    // El bypass solo se usó en el intercambio de cookie; el secreto no se
    // vuelve a añadir a las solicitudes de la aplicación o de sus recursos.
    await route.continue();
  });

  for (const path of RUTAS) {
    let response;
    try {
      response = await page.goto(new URL(path, base).href, { waitUntil: "networkidle" });
    } catch (error) {
      if (authenticationRedirects.length) {
        throw new Error(`Redirección a autenticación detectada: ${authenticationRedirects.at(-1)}`, { cause: error });
      }
      throw error;
    }
    assert.equal(response?.status(), 200, `${path}: se esperaba HTTP 200 y se recibió ${response?.status()}`);
    assert.doesNotMatch(response.url(), /(?:login|log-in|signin|sign-in|sso|auth|oauth)/i, `${path}: respuesta de una página de autenticación`);
    assert.match(response.headers()["content-type"] ?? "", /text\/html/, `${path}: tipo MIME HTML esperado`);
    await page.locator("main").waitFor();
    const heading = page.getByRole("heading", { level: 1 });
    await heading.waitFor();
    const text = await heading.innerText();
    assert.match(text, /iniciar sesi[oó]n/i, `${path}: se esperaba el acceso protegido por login`);
    assert.equal(new URL(page.url()).origin, base.origin, `${path}: se esperaba mantener el origen de la aplicación`);
    assert.equal(new URL(page.url()).pathname, "/login", `${path}: la ruta protegida debe terminar en /login`);
    assert.equal(await page.getByRole("navigation").count(), 0, `${path}: no debe exponer navegación del panel sin sesión`);
    assert.equal(await page.getByRole("table").count(), 0, `${path}: no debe exponer datos del panel sin sesión`);
    if (path === "/productos") {
      const reload = await page.reload({ waitUntil: "networkidle" });
      assert.equal(reload?.status(), 200, "La recarga de /productos debe responder HTTP 200");
      await heading.waitFor();
      assert.match(await heading.innerText(), /iniciar sesi[oó]n/i, "La recarga debe conservar el guard de login");
    }
    console.log(`Correcto: ${path}${path === "/productos" ? " y recarga" : ""}`);
  }

  assert([...assets].some((url) => /\.js(?:\?|$)/.test(url)), "No se cargó ningún recurso JavaScript.");
  assert([...assets].some((url) => /\.css(?:\?|$)/.test(url)), "No se cargó ningún recurso CSS.");
  for (const url of assets) {
    const assetUrl = new URL(url);
    assert.equal(assetUrl.origin, base.origin, "Se detectó un recurso fuera del origen del despliegue.");
    const response = await context.request.get(url);
    assert(respuestaRecursoCorrecta(response.status()), `El recurso respondió HTTP ${response.status()}.`);
    const mime = response.headers()["content-type"] ?? "";
    assert.match(mime, /\.css(?:\?|$)/.test(url) ? /text\/css/ : /javascript/, `Tipo MIME inesperado en ${assetUrl.pathname}`);
  }

  assert.deepEqual(authenticationRedirects, [], "Se detectó una redirección a una página de autenticación.");
  assert.deepEqual(resourceFailures, [], "Se detectaron respuestas HTTP fallidas en recursos de la aplicación.");
  assert.deepEqual(applicationFailures, [], "Se detectaron errores de aplicación, consola, navegación o red.");
  console.log(`Verificación correcta: cinco rutas protegidas, login y recarga, ${assets.size} recursos JS/CSS sin errores; ${base.origin}`);
} finally {
  await browser.close();
}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  ejecutarSmoke().catch((error) => {
    console.error(`La comprobación rápida falló: ${error.message}`);
    process.exitCode = 1;
  });
}
