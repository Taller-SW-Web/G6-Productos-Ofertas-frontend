import { createServer } from "node:http";
import { once } from "node:events";

// Isolated fixtures derived from G7 216059d and G6 a7778ec1. This is neither
// JWT verification nor homologation of the real providers. Never logs bodies.
export async function authContractFixture() {
  const state = { mfa: false, failure: "", roles: ["GESTOR_COMERCIAL"], expiresIn: 900, gatewayStatus: 200, gatewayCode: "", calls: [], serial: 0 };
  const ids = { a: "11111111-1111-4111-8111-111111111111", b: "22222222-2222-4222-8222-222222222222" };
  const tokens = new Map();
  let account = "a";
  const dto = () => {
    const serial = ++state.serial;
    const accessToken = `eyJhbGciOiJSUzI1NiJ9.c3ludGhldGlj.signature${serial}`;
    const refreshToken = `fixture-refresh-${serial}`;
    tokens.set(accessToken, account); tokens.set(refreshToken, account);
    return { accessToken, refreshToken, tokenType: "Bearer", expiresIn: state.expiresIn,
      usuario: { id: ids[account], nombreCompleto: `Persona ${account.toUpperCase()}`, correo: `${account}@example.test`, roles: state.roles } };
  };
  const server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Correlation-Id");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
    let raw = ""; for await (const chunk of req) raw += chunk;
    const path = new URL(req.url, "http://fixture.test").pathname;
    state.calls.push({ method: req.method, path });
    const send = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    if (path.startsWith("/g7/api/v1/auth/")) {
      const body = JSON.parse(raw || "{}");
      if (path.endsWith("/logout")) { tokens.delete(body.refreshToken); res.writeHead(204).end(); return; }
      if (state.failure) { send(401, { code: state.failure }); return; }
      if (path.endsWith("/login")) {
        account = body.correo === "b@example.test" ? "b" : "a";
        if (state.mfa) { send(200, { mfaRequerido: true, challengeToken: "fixture-challenge", expiraEn: 300 }); return; }
      }
      if (path.endsWith("/solicitar")) { send(202, {}); return; }
      if (path.endsWith("/verificar") && body.codigo !== "123456") { send(401, { code: "CODIGO_INVALIDO" }); return; }
      if (path.endsWith("/refresh")) {
        const previous = tokens.get(body.refreshToken);
        if (!previous) { send(401, { code: "REFRESCO_INVALIDO" }); return; }
        account = previous; tokens.delete(body.refreshToken);
      }
      send(200, dto()); return;
    }
    const bearer = req.headers.authorization?.replace(/^Bearer /, "");
    if (!tokens.has(bearer)) { send(401, { code: "TOKEN_INVALIDO" }); return; }
    if (state.gatewayStatus !== 200) { send(state.gatewayStatus, { code: state.gatewayCode }); return; }
    if (!state.roles.includes("GESTOR_COMERCIAL")) { send(403, { code: "SCOPE_INSUFICIENTE" }); return; }
    if (path === "/api/v1/productos") {
      if (req.method === "POST") { send(409, { code: "SKU_DUPLICADO" }); return; }
      send(200, { items: [], pagina: 1, tamanio: 25, total: 0, totalPaginas: 0 }); return;
    }
    if (path === "/api/v1/categorias") { send(200, { categories: [{ categoria_id: "cat-api", name: "Categoría HTTP", status: "ACTIVA" }] }); return; }
    if (path === "/api/v1/marcas") { send(200, { brands: [{ marca_id: "brand-api", name: "Marca HTTP", status: "ACTIVA" }] }); return; }
    if (path === "/api/v1/tipos-producto") { send(200, { items: [{ tipoProductoId: "type-api", nombre: "Tipo HTTP", estado: "ACTIVO" }], meta: { pagina: 1, tamanio: 100, total: 1, totalPaginas: 1 } }); return; }
    if (path === "/api/v1/tipos-producto/type-api/caracteristicas") { send(200, { tipoProducto: { tipoProductoId: "type-api" }, schemaVersion: 1, caracteristicas: [] }); return; }
    if (path === "/api/v1/cupones") { send(200, { items: [], meta: { pagina: 1, tamanio: 20, total: 0, totalPaginas: 0 } }); return; }
    if (path.startsWith("/api/v1/carga-masiva/productos/plantilla")) {
      res.writeHead(200, { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="plantilla.csv"' }); res.end("sku,nombre\n"); return;
    }
    send(404, { code: "NO_FIXTURE" });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  return { state, origin: `http://127.0.0.1:${server.address().port}`, close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
