import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildVercel, vercelBuildEnvironment } from "./build-vercel.mjs";

test("H74-01: buildCommand usa el script y respeta el limite de 256 caracteres", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(config.buildCommand, "node scripts/build-vercel.mjs");
  assert.ok(config.buildCommand.length <= 256);
});

test("el build usa los cuatro valores por defecto solo si no estan definidos", () => {
  const original = { PATH: "existing-path", VITE_DATA_MODE: undefined };
  assert.deepEqual(vercelBuildEnvironment(original), {
    PATH: "existing-path",
    VITE_DATA_MODE: "api",
    VITE_GATEWAY_ORIGIN: "https://api-gateway.calmgrass-aec0b33c.chilecentral.azurecontainerapps.io",
    VITE_G7_API_BASE: "https://g7-auth-service.onrender.com/api/v1",
    VITE_G6_READ_DEMO: "false",
  });
  assert.deepEqual(original, { PATH: "existing-path", VITE_DATA_MODE: undefined });
});

test("el entorno configurado tiene prioridad y llega intacto al build existente", () => {
  const configured = {
    VITE_DATA_MODE: "mock",
    VITE_GATEWAY_ORIGIN: "https://gateway.example.test",
    VITE_G7_API_BASE: "https://g7.example.test/api/v1",
    VITE_G6_READ_DEMO: "true",
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
  const configured = { VITE_DATA_MODE: "", VITE_GATEWAY_ORIGIN: "", VITE_G7_API_BASE: "", VITE_G6_READ_DEMO: "" };
  assert.deepEqual(vercelBuildEnvironment(configured), configured);
});

test("el wrapper propaga fallos del build y termina en error si no hay estado", () => {
  assert.equal(buildVercel({}, () => ({ status: 7 })), 7);
  assert.equal(buildVercel({}, () => ({ status: null, signal: "SIGTERM" })), 1);
});
