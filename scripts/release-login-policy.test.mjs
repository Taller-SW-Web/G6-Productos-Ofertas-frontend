import { test } from "node:test";
import assert from "node:assert/strict";
import { releasePolicy, targetUrl, verifyIntegrations, permittedRequest, verifyNoRedirect, verifyPreviewLocation, verifyPricesContent } from "./release-login-policy.mjs";

const approved = {
  previewUrl: "https://preview.example.test", approvedPreviewOrigin: "https://preview.example.test",
  approvedG7ApiBase: "https://identity.example.test/api/v1", approvedGatewayOrigin: "https://gateway.example.test",
  approvedGatewayOperation: "listarCupones",
};
test("R4-02 permite paginación inicial y solo padres acreditados por Cupones", () => {
  const policy = releasePolicy(approved);
  const allow = path => permittedRequest(policy, { url: policy.gateway + path, method: "GET", resourceType: "fetch" }, { promotionIds: new Set(["parent-id"]) });
  assert.equal(allow("/api/v1/cupones?pagina=1&tamanio=10"), true);
  assert.equal(allow("/api/v1/promociones/parent-id"), true);
  for (const path of ["/api/v1/promociones/other", "/api/v1/promociones/parent-id?extra=1", "/api/v1/cupones?tamanio=10&tamanio=10", "/api/v1/cupones?constructor=x"]) assert.equal(allow(path), false);
});
test("política HTTPS exacta e integraciones efectivas aprobadas", () => {
  const policy = releasePolicy(approved);
  verifyIntegrations(policy, { g7ApiBase: approved.approvedG7ApiBase, gatewayOrigin: approved.approvedGatewayOrigin });
  assert.equal(Object.isFrozen(policy), true);
});
for (const [name, change] of [
  ["preview HTTP", { previewUrl: "http://preview.example.test" }],
  ["loopback HTTP productivo", { previewUrl: "http://127.0.0.1:1234", approvedPreviewOrigin: "http://127.0.0.1:1234" }],
  ["host con sufijo ajeno", { previewUrl: "https://preview.example.test.evil.test" }],
  ["otro puerto", { previewUrl: "https://preview.example.test:8443" }],
  ["origen aprobado ausente", { approvedPreviewOrigin: undefined }],
  ["aprobación con path", { approvedPreviewOrigin: "https://preview.example.test/redirect" }],
  ["userinfo", { previewUrl: "https://user:private@preview.example.test" }],
  ["query", { previewUrl: "https://preview.example.test/?next=evil" }],
  ["fragmento", { previewUrl: "https://preview.example.test/#evil" }],
  ["G7 HTTP", { approvedG7ApiBase: "http://identity.example.test/api/v1" }],
  ["Gateway HTTP", { approvedGatewayOrigin: "http://gateway.example.test" }],
  ["operación Gateway sin aprobación", { approvedGatewayOperation: undefined }],
  ["operación Gateway ajena al recorrido", { approvedGatewayOperation: "otraOperacion" }],
]) test(`rechaza ${name}`, () => assert.throws(() => releasePolicy({ ...approved, ...change })));

test("excepción de fixture requiere activación explícita y TODOS los destinos loopback", () => {
  const values = { previewUrl: "http://127.0.0.1:1234", approvedPreviewOrigin: "http://127.0.0.1:1234", approvedG7ApiBase: "http://127.0.0.1:1235/api/v1", approvedGatewayOrigin: "http://127.0.0.1:1236" };
  assert.throws(() => releasePolicy(values));
  assert.equal(releasePolicy(values, { isolatedFixture: true }).isolatedFixture, true);
  assert.throws(() => releasePolicy({ ...values, approvedG7ApiBase: "http://remote.test/api/v1" }, { isolatedFixture: true }));
});
test("rechaza otra base efectiva G7 y otro Gateway antes de los campos", () => {
  const policy = releasePolicy(approved);
  assert.throws(() => verifyIntegrations(policy, { g7ApiBase: "https://identity.example.test/otra-base", gatewayOrigin: policy.gateway }));
  assert.throws(() => verifyIntegrations(policy, { g7ApiBase: policy.g7Base, gatewayOrigin: "https://other.example.test" }));
  assert.throws(() => verifyIntegrations(policy, null));
});
for (const status of [301, 302, 303, 307, 308]) test(`no sigue redirección ${status}`, () => assert.throws(() => verifyNoRedirect(status)));
test("nunca expone el valor sensible de una URL inválida en el error", () => {
  assert.throws(() => targetUrl("https://private-user:private-password@host.test"), { message: "RELEASE_TARGET_INVALID" });
});
test("limita navegación a origen y rutas aprobadas", () => {
  const policy = releasePolicy(approved);
  verifyPreviewLocation(policy, policy.preview + "/login");
  for (const url of ["https://evil.test/login", policy.preview + "/other", policy.preview + "/login?correo=private"]) assert.throws(() => verifyPreviewLocation(policy, url));
});
test("solo envía auth a los endpoints G7 exactos y lecturas a Gateway", () => {
  const policy = releasePolicy(approved);
  const allow = (url, method, resourceType = "fetch") => permittedRequest(policy, { url, method, resourceType });
  assert.equal(allow(policy.g7Base + "/auth/login", "POST"), true);
  assert.equal(allow(policy.g7Base + "/auth/otp/verificar", "POST"), true);
  assert.equal(allow(policy.g7Base + "/auth/login/extra", "POST"), false);
  assert.equal(allow("https://evil.test/api/v1/auth/login", "POST"), false);
  assert.equal(allow(policy.gateway + "/api/v1/cupones?pagina=1", "GET"), true);
  assert.equal(allow(policy.gateway + "/api/v1/cupones", "POST"), false);
  assert.equal(allow(policy.gateway + "/api/v1/cupones", "GET", "document"), false);
  assert.equal(allow(policy.g7Base + "/auth/login", "POST", "document"), false);
  assert.equal(allow(policy.preview + "/collect", "POST"), false);
  assert.equal(allow(policy.preview + "/collect", "GET"), false);
  assert.equal(allow(policy.preview + "/assets/app.js", "GET", "script"), true);
});

for (const path of ["/api/v1/productos", "/api/v1/usuarios", "/api/v1/cupones?pagina=1&pagina=2", "/api/v1/cupones?tamanio=0", "/api/v1/cupones?pagina=2", "/api/v1/cupones?token=unexpected", "/api/v1/cupones?estado=ACTIVO"]) {
  test(`R4-02 bloquea petición ajena al recorrido ${path}`, () => {
    const policy = releasePolicy(approved);
    assert.equal(permittedRequest(policy, { url: policy.gateway + path, method: "GET", resourceType: "fetch" }), false);
  });
}

test("Precios acredita la vista nativa o la consulta exacta, sin aceptar otros módulos", () => {
  const native = { heading: "Gestión de precios", description: "Consulta los precios vigentes de productos y variantes (SKU)." };
  const readonly = { heading: "Consultas de los módulos", module: "Precios", operation: "Consultar precios vigentes de varios SKU" };
  assert.doesNotThrow(() => verifyPricesContent(native));
  assert.doesNotThrow(() => verifyPricesContent(readonly));
  for (const invalid of [{}, { ...native, description: "Otro contenido" }, { ...readonly, module: "Inventario" }, { ...readonly, operation: "Consultar disponibilidad" }, { heading: readonly.heading }]) {
    assert.throws(() => verifyPricesContent(invalid), { message: "RELEASE_PRICES_VIEW_NOT_CONFIRMED" });
  }
});
