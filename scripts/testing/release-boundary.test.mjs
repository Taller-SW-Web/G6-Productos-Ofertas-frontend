import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { releasePolicy } from "../release-login-policy.mjs";
import { verifyReleaseLogin } from "../release-login-check.mjs";
import { ReleaseSessionEvidence } from "../release-session-evidence.mjs";

// Deliberately small hostile HTML fixtures test the verifier, not the frontend
// or G7 protocol. Real compiled frontend coverage lives in verify-production-auth.
async function fixture(scenario, work) {
  const sessionDto = { accessToken: "eyJhbGciOiJSUzI1NiJ9.c3ludGhldGlj.signature", refreshToken: "fixture-refresh", tokenType: "Bearer", expiresIn: 900,
    usuario: { id: "11111111-1111-4111-8111-111111111111", nombreCompleto: "Prueba", correo: "synthetic@example.test", roles: ["GESTOR_COMERCIAL"] } };
  const seen = { entered: 0, login: 0, authenticatedRead: 0, logout: 0, outside: 0, couponRequests: [] };
  const outside = createServer((_req, res) => { seen.outside++; res.end("outside"); });
  outside.listen(0, "127.0.0.1"); await once(outside, "listening");
  const redirect = res => { res.writeHead(307, { Location: `http://127.0.0.1:${outside.address().port}/collect` }); res.end(); };
  let origin;
  const server = createServer(async (req, res) => {
    for await (const chunk of req) void chunk;
    if (req.url === "/input-observed.png") { seen.entered++; res.writeHead(204).end(); return; }
    if (req.url === "/g7/api/v1/auth/login") {
      if (req.method === "OPTIONS") { if (scenario.startsWith("g7-probe-")) { res.writeHead(Number(scenario.split("-").at(-1))).end("{}"); return; } if (scenario === "g7-redirect") redirect(res); else res.writeHead(scenario === "gateway-403" ? 200 : 204).end(); return; }
      seen.login++;
      if (scenario === "auth-redirect") { redirect(res); return; }
      res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(scenario === "mfa-pending" ? { mfaRequerido: true, challengeToken: "fixture-challenge", expiraEn: 300 } : sessionDto)); return;
    }
    if (req.url === "/g7/api/v1/auth/logout") { seen.logout++;
      if (scenario === "logout-lost") { req.socket.destroy(); return; }
      res.writeHead(scenario === "logout-500" ? 500 : 204).end(); return; }
    if (req.url?.split("?")[0] === "/api/v1/cupones") {
      seen.couponRequests.push({ url: req.url, hasBearer: !!req.headers.authorization, hasCookie: !!req.headers.cookie });
      if (!req.headers.authorization) {
        if (req.url.includes("?") && scenario === "public-query") { res.setHeader("Content-Type", "application/json"); res.end("{}"); return; }
        if (scenario.startsWith("gateway-probe-")) { res.writeHead(Number(scenario.split("-").at(-1))).end("{}"); return; }
        if (scenario === "gateway-redirect") redirect(res); else res.writeHead(scenario === "gateway-403" ? 403 : 401).end("{}"); return;
      }
      seen.authenticatedRead++;
      if (scenario === "read-redirect") { redirect(res); return; }
      res.setHeader("Content-Type", "application/json"); res.end("{}"); return;
    }
    if (scenario === "preview-redirect") { redirect(res); return; }
    if (scenario === "gateway-403") res.setHeader("Set-Cookie", "fixture_cookie=present; Path=/");
    const effective = { g7ApiBase: scenario === "wrong-g7" ? "http://localhost:1/other" : origin + "/g7/api/v1", gatewayOrigin: scenario === "wrong-gateway" ? "http://localhost:2" : origin };
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!doctype html><meta name="g6-auth-integrations" content='${JSON.stringify(effective)}'><main id="root"></main>
      <script>
        const root=document.getElementById('root'); let session=null; window.addEventListener('popstate',()=>{if(!session){history.replaceState(null,'','/login');login();}});
        function login(){root.innerHTML='<h1>Iniciar sesión</h1><form><label>Correo electrónico<input id="email" aria-label="Correo electrónico" role="textbox" type="email"></label><label>Contraseña<input id="password" aria-label="Contraseña" role="textbox" type="password"></label><button>Ingresar al panel</button></form>';
          ${(["wrong-g7", "wrong-gateway", "g7-redirect", "gateway-redirect", "public-query"].includes(scenario) || scenario.includes("-probe-")) ? "root.addEventListener('input',()=>{new Image().src='/input-observed.png';});" : ""}
          root.querySelector('form').onsubmit=async(event)=>{event.preventDefault();
            const response=${scenario === 'no-auth' ? 'null' : "await fetch('/g7/api/v1/auth/login',{method:'POST',body:JSON.stringify({correo:document.getElementById('email').value,contrasena:document.getElementById('password').value})})"};
            const dto=response ? await response.json() : ${JSON.stringify(sessionDto)}; session=dto; if(dto.mfaRequerido){root.innerHTML='<h1>Verificar identidad</h1><input aria-label="Código de verificación">';return;}
            await fetch('/api/v1/cupones?pagina=1&tamanio=10',${['no-auth','no-bearer'].includes(scenario) ? '{}' : "{headers:{Authorization:'Bearer '+("+(scenario === 'wrong-bearer' ? "'not-issued'" : 'dto.accessToken')+")}}"});
            root.innerHTML='<nav aria-label="Navegación de la aplicación"><a id="prices" href="/precios">Consultar precios</a></nav><h1>Cupones de descuento</h1><p>Todavía no hay cupones</p><button id="logout">Cerrar sesión</button>';
            document.getElementById('prices').onclick=e=>{e.preventDefault();${scenario === 'prices-stuck' ? '' : "history.pushState(null,'','/precios');"}root.querySelector('h1').textContent=${scenario === 'prices-wrong-content' ? "'Cupones de descuento'" : "'Gestión de precios'"};root.insertAdjacentHTML('beforeend','<p>Consulta los precios vigentes de productos y variantes (SKU).</p>');};
            document.getElementById('logout').onclick=async()=>{const refreshToken=session.refreshToken;session=null;history.replaceState(null,'','/login');login();await fetch('/g7/api/v1/auth/logout',{method:'POST',body:JSON.stringify({refreshToken}),keepalive:true}).catch(()=>{});};
          };}
        history.replaceState(null,'','/login');login();
      </script>`);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); origin = `http://127.0.0.1:${server.address().port}`;
  const policy = releasePolicy({ previewUrl: origin, approvedPreviewOrigin: origin, approvedG7ApiBase: origin + "/g7/api/v1", approvedGatewayOrigin: origin }, { isolatedFixture: true });
  try { await work(policy, seen); }
  finally { server.closeAllConnections(); outside.closeAllConnections(); await Promise.all([new Promise(r => server.close(r)), new Promise(r => outside.close(r))]); }
}
const credentials = { email: "synthetic@example.test", password: "synthetic-test-only" };

test("R4-01 evidencia enlaza MFA, rotación y lectura; no expone tokens", async () => {
  const policy = { g7Base: "https://g7.example.test/api/v1", gateway: "https://gateway.example.test" };
  const evidence = new ReleaseSessionEvidence(credentials);
  const session = { accessToken: "fixture.access.signature", refreshToken: "fixture-refresh", tokenType: "Bearer", expiresIn: 900,
    usuario: { id: "11111111-1111-4111-8111-111111111111", nombreCompleto: "Prueba", correo: credentials.email, roles: ["GESTOR_COMERCIAL"] } };
  const exchange = async (path, body, status, dto) => {
    const stamp = evidence.before(policy, { url: () => policy.g7Base + "/auth/" + path, method: () => "POST", postData: () => JSON.stringify(body) });
    await evidence.after(stamp, { status: () => status, body: async () => Buffer.from(JSON.stringify(dto)) });
  };
  try {
    await exchange("login", { correo: credentials.email, contrasena: credentials.password }, 200, { mfaRequerido: true, challengeToken: "challenge", expiraEn: 300 });
    await assert.rejects(exchange("otp/verificar", { challengeToken: "challenge", codigo: "123456" }, 200, session));
    assert.throws(() => evidence.confirmRead());
    await exchange("otp/solicitar", { challengeToken: "challenge", canal: "EMAIL" }, 202, {});
    await exchange("otp/verificar", { challengeToken: "challenge", codigo: "123456" }, 401, {});
    assert.throws(() => evidence.confirmMfa());
    await exchange("otp/verificar", { challengeToken: "challenge", codigo: "123456" }, 200, session);
    evidence.confirmMfa();
    await assert.rejects(exchange("refresh", { refreshToken: "unissued" }, 200, session));
    await assert.rejects(exchange("refresh", { refreshToken: session.refreshToken }, 200, session));
    const rotated = { ...session, accessToken: "rotated.access.signature", refreshToken: "rotated-refresh" };
    await exchange("refresh", { refreshToken: session.refreshToken }, 200, rotated);
    const read = token => evidence.before(policy, { url: () => policy.gateway + "/api/v1/cupones?pagina=1&tamanio=10", method: () => "GET", headers: () => ({ authorization: `Bearer ${token}` }) });
    assert.throws(() => read(session.accessToken));
    const bareRead = evidence.before(policy, {
      url: () => policy.gateway + "/api/v1/cupones",
      method: () => "GET",
      headers: () => ({ authorization: `Bearer ${rotated.accessToken}` }),
    });
    await evidence.after(bareRead, { status: () => 200, body: async () => Buffer.from('{"items":[]}') });
    assert.throws(() => evidence.confirmRead(), { message: "RELEASE_SESSION_NOT_CONFIRMED" });
    await evidence.after(read(rotated.accessToken), { status: () => 200, body: async () => Buffer.from('{"items":[{"promocionId":"parent-id"}]}') });
    evidence.confirmRead(); assert.equal(evidence.promotionIds.has("parent-id"), true);
    await assert.rejects(exchange("logout", { refreshToken: "unissued" }, 204));
    const logout = () => evidence.before(policy, {
      url: () => policy.g7Base + "/auth/logout",
      method: () => "POST",
      postData: () => JSON.stringify({ refreshToken: rotated.refreshToken }),
    });
    const logoutStamp = logout();
    // The server may already have revoked the refresh while its 204 is in flight.
    await assert.rejects(exchange("refresh", { refreshToken: rotated.refreshToken }, 200, rotated));
    assert.throws(logout, { message: "RELEASE_SESSION_NOT_CONFIRMED" });
    await evidence.after(logoutStamp, { status: () => 204 });
    await evidence.confirmLogout();
    assert.throws(() => read(rotated.accessToken));
    assert.equal(JSON.stringify(evidence), '{"promotionIds":{}}');
  } finally { evidence.dispose(); }
});

for (const scenario of ["no-auth", "no-bearer", "wrong-bearer"]) {
  test(`R4-01 ${scenario}: navegación y 200 no acreditan autenticación`, async () => {
    await fixture(scenario, async (policy, seen) => {
      await assert.rejects(verifyReleaseLogin(policy, credentials), { message: "RELEASE_NETWORK_NOT_APPROVED" });
      assert.equal(seen.authenticatedRead, 0); assert.equal(seen.outside, 0);
    });
  });
}
test("A01 rechaza la consulta paginada pública aunque la ruta sin query devuelva 401", async () => {
  await fixture("public-query", async (policy, seen) => {
    await assert.rejects(verifyReleaseLogin(policy, credentials), { message: "RELEASE_PROBE_NOT_ACCEPTABLE" });
    assert.equal(seen.entered, 0);
    assert.equal(seen.login, 0);
  });
});
for (const probe of ["g7", "gateway"]) for (const status of [404, 429, 500, 503]) {
  test(`R4-04 ${probe} ${status}: no introduce credenciales`, async () => {
    await fixture(`${probe}-probe-${status}`, async (policy, seen) => {
      await assert.rejects(verifyReleaseLogin(policy, credentials), { message: "RELEASE_PROBE_NOT_ACCEPTABLE" });
      assert.equal(seen.entered, 0); assert.equal(seen.login, 0);
    });
  });
}
for (const scenario of ["logout-500", "logout-lost"]) {
  test(`R4-05 ${scenario}: cierre local no acredita respuesta G7`, async () => {
    await fixture(scenario, async (policy, seen) => {
      await assert.rejects(verifyReleaseLogin(policy, credentials), { message: "RELEASE_LOGOUT_NOT_CONFIRMED" });
      assert.equal(seen.logout, 1);
    });
  });
}
for (const scenario of ["prices-stuck", "prices-wrong-content"]) {
  test(`R4-06 ${scenario}: un h1 cualquiera no acredita Precios`, async () => {
    await fixture(scenario, async policy => { await assert.rejects(verifyReleaseLogin(policy, credentials)); });
  });
}

test("recorrido positivo solo con fixture explícito, sin afirmar MFA", async () => {
  await fixture("normal", async (policy, seen) => {
    const result = await verifyReleaseLogin(policy, credentials);
    assert.deepEqual(result, { isolatedFixture: true, mfaCompleted: false, gatewayProtectedReadVerified: true, logout204Observed: true, localLogoutVerified: true });
    assert.equal(seen.login, 1); assert.equal(seen.authenticatedRead, 1); assert.equal(seen.logout, 1); assert.equal(seen.outside, 0);
  });
});

test("A02 acepta OPTIONS 200 y Gateway 403 anónimo cuando la misma lectura autenticada devuelve 200", async () => {
  await fixture("gateway-403", async (policy, seen) => {
    await verifyReleaseLogin(policy, credentials);
    assert.deepEqual(seen.couponRequests, [
      { url: "/api/v1/cupones?pagina=1&tamanio=10", hasBearer: false, hasCookie: false },
      { url: "/api/v1/cupones?pagina=1&tamanio=10", hasBearer: true, hasCookie: false },
    ]);
  });
});
for (const scenario of ["wrong-g7", "wrong-gateway", "preview-redirect", "g7-redirect", "gateway-redirect"]) {
  test(`${scenario}: rechaza antes de introducir credenciales`, async () => {
    await fixture(scenario, async (policy, seen) => {
      await assert.rejects(verifyReleaseLogin(policy, credentials));
      assert.equal(seen.entered, 0); assert.equal(seen.login, 0); assert.equal(seen.outside, 0);
    });
  });
}
for (const scenario of ["auth-redirect", "read-redirect"]) {
  test(`${scenario}: nunca reenvía el cuerpo ni sigue Location`, async () => {
    await fixture(scenario, async (policy, seen) => {
      await assert.rejects(verifyReleaseLogin(policy, credentials));
      assert.equal(seen.login, 1); assert.equal(seen.outside, 0);
    });
  });
}
test("un desafío MFA pendiente nunca es PASS", async () => {
  await fixture("mfa-pending", async (policy, seen) => {
    await assert.rejects(verifyReleaseLogin(policy, credentials), { message: "RELEASE_MFA_PENDING" });
    assert.equal(seen.authenticatedRead, 0); assert.equal(seen.logout, 0); assert.equal(seen.outside, 0);
  });
});
