import test from "node:test";
import assert from "node:assert/strict";
import { clasificarRespuesta, esDestinoAutenticacion, respuestaRecursoCorrecta, validarOrigenSmoke } from "./vercel-smoke.mjs";

const origin = "https://g6-productos-ofertas-a1b2c3d4-marecahu02-9205s-projects.vercel.app";

test("clasifica errores HTTP de documentos y recursos con categorías distintas", () => {
  assert.equal(clasificarRespuesta({ url: `${origin}/productos`, status: 500, isNavigation: true, baseOrigin: origin }), "application");
  assert.equal(clasificarRespuesta({ url: `${origin}/assets/app.js`, status: 503, isNavigation: false, baseOrigin: origin }), "resource");
  assert.equal(clasificarRespuesta({ url: `${origin}/assets/app.js`, status: 200, isNavigation: false, baseOrigin: origin }), null);
});

test("distingue el login local esperado de redirects a autenticación externos", () => {
  assert.equal(clasificarRespuesta({
    url: `${origin}/productos`, location: "https://vercel.com/sso-api?next=%2Fproductos", status: 302, isNavigation: true, baseOrigin: origin,
  }), "authentication");
  assert.equal(clasificarRespuesta({
    url: `${origin}/login`, status: 200, isNavigation: true, baseOrigin: origin,
  }), "application-login");
  assert.equal(clasificarRespuesta({
    url: `${origin}/productos`, location: `${origin}/login`, status: 302, isNavigation: true, baseOrigin: origin,
  }), "application-login");
  assert.equal(clasificarRespuesta({
    url: `${origin}/login`, location: "https://vercel.com/sso-api", status: 302, isNavigation: true, baseOrigin: origin,
  }), "authentication");
  assert.equal(esDestinoAutenticacion("https://auth.example.test/sign-in", origin), true);
  assert.equal(esDestinoAutenticacion("https://vercel.com/sso-api", origin), true);
  assert.equal(esDestinoAutenticacion(`${origin}/productos`, origin), false);
});

test("trata 304 como revalidación válida de recursos y rechaza otros redirects o HTTP fallidos", () => {
  for (const status of [200, 204, 206, 304]) assert.equal(respuestaRecursoCorrecta(status), true, `${status}`);
  for (const status of [300, 301, 302, 307, 308, 400, 401, 403, 404, 500, 503]) {
    assert.equal(respuestaRecursoCorrecta(status), false, `${status}`);
  }
});

test("limita el secreto de bypass a un origen inmutable HTTPS del proyecto", () => {
  assert.equal(validarOrigenSmoke(origin, "solo-prueba").origin, origin);
  for (const url of [
    "http://g6-productos-ofertas-a1b2c3d4.vercel.app",
    "https://g6-productos-ofertas.vercel.app",
    "https://g6-productos-ofertas-a1b2c3d4.vercel.app.evil.example",
    "https://user:pass@g6-productos-ofertas-a1b2c3d4.vercel.app",
    "https://g6-productos-ofertas-a1b2c3d4.vercel.app:8443",
    "https://g6-productos-ofertas-a1b2c3d4.vercel.app/path",
  ]) {
    assert.throws(() => validarOrigenSmoke(url, "solo-prueba"));
  }
});
