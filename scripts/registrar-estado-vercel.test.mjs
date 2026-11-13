import test from "node:test";
import assert from "node:assert/strict";
import { determinarEstadoFinal, CONTEXTO_ESTADO, registrarEstado } from "./registrar-estado-vercel.mjs";

const shaVigente = "a".repeat(40);
const shaObsoleto = "b".repeat(40);

test("publica éxito cuando el smoke pasa y el SHA sigue vigente", () => {
  assert.deepEqual(
    determinarEstadoFinal({ resultadoComprobacion: "success", shaDespliegue: shaVigente, shaMaster: shaVigente }),
    { estado: "success", descripcion: "Despliegue verificado y vigente en master." },
  );
});

test("publica fallo cuando falla la comprobación remota", () => {
  for (const resultadoComprobacion of ["failure", "cancelled", "skipped", "timed_out"]) {
    assert.equal(
      determinarEstadoFinal({ resultadoComprobacion, shaDespliegue: shaVigente, shaMaster: shaVigente }).estado,
      "failure",
      resultadoComprobacion,
    );
  }
});

test("publica fallo cuando el SHA quedó obsoleto", () => {
  const resultado = determinarEstadoFinal({
    resultadoComprobacion: "success",
    shaDespliegue: shaObsoleto,
    shaMaster: shaVigente,
  });
  assert.equal(resultado.estado, "failure");
  assert.match(resultado.descripcion, /obsoleto/);
});

test("publica fallo si no se pudo consultar master", () => {
  assert.equal(
    determinarEstadoFinal({
      resultadoComprobacion: "success",
      shaDespliegue: shaVigente,
      errorConsultaMaster: true,
    }).estado,
    "failure",
  );
});

test("conserva el contexto de control configurado en Vercel", () => {
  assert.equal(CONTEXTO_ESTADO, "verificacion-despliegue-produccion");
});

test("publica pending antes de ejecutar el smoke", async () => {
  let request;
  const result = await registrarEstado({
    fase: "pendiente",
    token: "token-falso",
    repositorio: "Taller-SW-Web/G6-Productos-Ofertas-frontend",
    sha: shaVigente,
    runUrl: "https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/123",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 201 };
    },
  });
  assert.equal(result.estado, "pending");
  assert.match(request.url, new RegExp(`/statuses/${shaVigente}$`));
  assert.deepEqual(JSON.parse(request.options.body), {
    state: "pending",
    context: CONTEXTO_ESTADO,
    description: "Identidad validada; comprobación de producción en curso.",
    target_url: "https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/123",
  });
});

test("cancelación, omisión o fallo del job nunca publica success", async (t) => {
  for (const resultadoComprobacion of ["cancelled", "skipped", "failure", "timed_out"]) {
    await t.test(resultadoComprobacion, async () => {
      const published = [];
      await registrarEstado({
        fase: "final",
        token: "token-falso",
        repositorio: "Taller-SW-Web/G6-Productos-Ofertas-frontend",
        sha: shaVigente,
        resultadoComprobacion,
        runUrl: "https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/123",
        fetchImpl: async (url, options) => {
          if (url.includes("/commits/master")) return { ok: true, status: 200, json: async () => ({ sha: shaVigente }) };
          published.push(JSON.parse(options.body));
          return { ok: true, status: 201 };
        },
      });
      assert.equal(published.at(-1).state, "failure");
      assert.notEqual(published.at(-1).state, "success");
    });
  }
});

test("consulta caída u obsoleta publica failure cuando GitHub todavía acepta el estado", async () => {
  for (const masterReply of [
    { ok: false, status: 503 },
    new TypeError("connection lost"),
    { ok: true, status: 200, json: async () => ({ sha: shaObsoleto }) },
  ]) {
    const published = [];
    await registrarEstado({
      fase: "final",
      token: "token-falso",
      repositorio: "Taller-SW-Web/G6-Productos-Ofertas-frontend",
      sha: shaVigente,
      resultadoComprobacion: "success",
      runUrl: "https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/123",
      fetchImpl: async (url, options) => {
        if (url.includes("/commits/master")) {
          if (masterReply instanceof Error) throw masterReply;
          return masterReply;
        }
        published.push(JSON.parse(options.body));
        return { ok: true, status: 201 };
      },
    });
    assert.equal(published[0].state, "failure");
  }
});

test("rechazo de GitHub o pérdida de conexión publicando no se presenta como éxito", async () => {
  for (const reply of [
    { ok: false, status: 403 },
    new TypeError("connection lost"),
  ]) {
    await assert.rejects(
      registrarEstado({
        fase: "pendiente",
        token: "token-falso",
        repositorio: "Taller-SW-Web/G6-Productos-Ofertas-frontend",
        sha: shaVigente,
        runUrl: "https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/123",
        fetchImpl: async () => {
          if (reply instanceof Error) throw reply;
          return reply;
        },
      }),
    );
  }
});
