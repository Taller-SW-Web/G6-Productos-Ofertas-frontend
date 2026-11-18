import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { execFile } from "node:child_process";

test("no introduce credenciales en un origen no aprobado", async () => {
  let entered = 0;
  const visited = [];
  const server = createServer((req, res) => {
    visited.push(req.url);
    if (req.url === "/entered") { entered++; res.end("ok"); return; }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<form onsubmit="event.preventDefault()">
      <label>Correo electrónico<input aria-label="Correo electrónico" role="textbox" type="email"></label>
      <label>Contraseña<input aria-label="Contraseña" role="textbox" type="password"></label>
      <button>Ingresar al panel</button></form>
      <script>document.addEventListener('input',()=>fetch('/entered',{method:'POST',body:'input event'}));</script>`);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const result = await new Promise(resolve => execFile(process.execPath, ["scripts/verify-release-login.mjs"], {
      timeout: 30000,
      env: { ...process.env, G6_RELEASE_PREVIEW_URL: `http://127.0.0.1:${server.address().port}`,
        G6_RELEASE_APPROVED_PREVIEW_ORIGIN: "https://approved.example.test",
        G6_RELEASE_APPROVED_G7_API_BASE: "https://g7.example.test/api/v1",
        G6_RELEASE_APPROVED_GATEWAY_ORIGIN: "https://gateway.example.test",
        G6_RELEASE_APPROVED_GATEWAY_OPERATION: "listarCupones",
        G6_RELEASE_TEST_EMAIL: "synthetic@example.test", G6_RELEASE_TEST_PASSWORD: "synthetic-test-only" },
    }, error => resolve({ code: error?.code ?? 0 })));
    assert.equal(result.code, 1);
    assert.deepEqual(visited, []);
    assert.equal(entered, 0, "Un preview no aprobado no debe recibir eventos de entrada de credenciales");
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
