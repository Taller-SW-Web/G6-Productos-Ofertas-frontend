import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildVercel, vercelBuildEnvironment } from "./build-vercel.mjs";

test("H74-01: buildCommand usa el script y respeta el limite de 256 caracteres", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(config.buildCommand, "node scripts/build-vercel.mjs");
  assert.ok(config.buildCommand.length <= 256);
});

test("el build aplica los valores por defecto solo si no estan definidos", () => {
  const original = { PATH: "existing-path", VITE_DATA_MODE: undefined, VITE_GATEWAY_ORIGIN: "https://apim-g6-productos-chile.azure-api.net", VITE_G7_API_BASE: "https://g7.example.test/api/v1" };
  assert.deepEqual(vercelBuildEnvironment(original), {
    PATH: "existing-path",
    VITE_DATA_MODE: "api",
    VITE_GATEWAY_ORIGIN: "https://apim-g6-productos-chile.azure-api.net",
    VITE_G7_API_BASE: "https://g7.example.test/api/v1",
    VITE_G6_READ_DEMO: "false",
    VITE_G6_ADMIN_API_ENABLED: "false",
  });
  assert.equal(original.VITE_DATA_MODE, undefined);
});

test("el entorno configurado tiene prioridad y llega intacto al build existente", () => {
  const configured = {
    VITE_DATA_MODE: "mock",
    VITE_GATEWAY_ORIGIN: "https://gateway.example.test",
    VITE_G7_API_BASE: "https://g7.example.test/api/v1",
    VITE_G6_READ_DEMO: "true",
    VITE_G6_ADMIN_API_ENABLED: "true",
    PATH: "existing-path",
  };
  let calls = 0;
  const status = buildVercel(configured, (command, options) => {
    calls++;
    assert.equal(command, "npm run build");
    assert.deepEqual(options.env, configured);
    assert.notEqual(options.env, configured);
    assert.equal(options.stdio, "inherit");
    assert.equal(options.shell, true);
    return { status: 0 };
  });
  assert.equal(status, 0);
  assert.equal(calls, 1);
});

test("un valor vacio definido no se sustituye silenciosamente por un default", () => {
  const configured = { VITE_DATA_MODE: "", VITE_GATEWAY_ORIGIN: "", VITE_G7_API_BASE: "", VITE_G6_READ_DEMO: "", VITE_G6_ADMIN_API_ENABLED: "" };
  assert.deepEqual(vercelBuildEnvironment(configured), configured);
});

test("el wrapper propaga fallos del build y termina en error si no hay estado", () => {
  assert.equal(buildVercel({ VITE_DATA_MODE: "mock" }, () => ({ status: 7 })), 7);
  assert.equal(buildVercel({ VITE_DATA_MODE: "mock" }, () => ({ status: null, signal: "SIGTERM" })), 1);
});

test("API sin configuración explícita o con bypass ACA falla antes del build", () => {
  assert.throws(() => vercelBuildEnvironment({}), /VITE_GATEWAY_ORIGIN/);
  assert.throws(() => vercelBuildEnvironment({ VITE_GATEWAY_ORIGIN: "https://apim.example.test" }), /VITE_G7_API_BASE/);
  assert.throws(() => vercelBuildEnvironment({ VITE_GATEWAY_ORIGIN: "https://gateway.example.azurecontainerapps.io", VITE_G7_API_BASE: "https://g7.example.test/api/v1" }), /APIM/);
  assert.throws(() => vercelBuildEnvironment({ VITE_GATEWAY_ORIGIN: "https://gateway.example.azurecontainerapps.io.", VITE_G7_API_BASE: "https://g7.example.test/api/v1" }), /APIM/);
  assert.doesNotThrow(() => vercelBuildEnvironment({ VITE_GATEWAY_ORIGIN: "https://notazurecontainerapps.io", VITE_G7_API_BASE: "https://g7.example.test/api/v1" }));
});

test("SPA conserva rutas profundas y excluye assets y rutas API ausentes", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const navigation = new RegExp(`^${config.rewrites.at(-1).source}$`);
  for (const path of ["/inventario/umbrales", "/precios", "/productos/abc/editar"]) assert.ok(navigation.test(path), path);
  for (const path of ["/assets/Missing.js", "/assets", "/favicon.ico", "/api/v1/unknown", "/g7/api/v1/unknown"]) assert.ok(!navigation.test(path), path);
});
