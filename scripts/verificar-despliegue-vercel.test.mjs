import test from "node:test";
import assert from "node:assert/strict";
import { verificarIdentidadDespliegue } from "./verificar-despliegue-vercel.mjs";

const sha = "a".repeat(40);
const ids = {
  deploymentId: "dpl_AbCd1234",
  token: "token-de-prueba-no-real",
  teamId: "team_AbCd1234",
  projectId: "prj_AbCd1234",
};

function crearEvent(overrides = {}) {
  return {
    client_payload: {
      id: ids.deploymentId,
      environment: "production",
      project: { id: ids.projectId, name: "g6-productos-ofertas" },
      git: { ref: "master", sha },
      ...overrides,
    },
  };
}

function crearDeployment(overrides = {}) {
  return {
    id: ids.deploymentId,
    projectId: ids.projectId,
    ownerId: ids.teamId,
    name: "g6-productos-ofertas",
    target: "production",
    readyState: "READY",
    url: "g6-productos-ofertas-a1b2c3d4-marecahu02-9205s-projects.vercel.app",
    meta: {
      githubOrg: "Taller-SW-Web",
      githubRepo: "G6-Productos-Ofertas-frontend",
      githubCommitRef: "master",
      githubCommitSha: sha,
    },
    ...overrides,
  };
}

function crearFetch(body, { status = 200, error } = {}) {
  return async (url, options) => {
    assert.match(url, /^https:\/\/api\.vercel\.com\/v13\/deployments\/dpl_AbCd1234\?/);
    assert.equal(options.headers.Authorization, `Bearer ${ids.token}`);
    assert.ok(options.signal);
    if (error) throw error;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (body instanceof Error) throw body;
        return body;
      },
    };
  };
}

function verificar(overrides = {}) {
  return verificarIdentidadDespliegue({
    event: crearEvent(),
    ...ids,
    fetchImpl: crearFetch(crearDeployment()),
    ...overrides,
  });
}

test("acepta identidad completa de API y solo entrega el origen inmutable", async () => {
  assert.deepEqual(await verificar(), {
    deploymentUrl: "https://g6-productos-ofertas-a1b2c3d4-marecahu02-9205s-projects.vercel.app",
    commitSha: sha,
  });
});

test("rechaza respuestas HTTP erróneas, incluidas credenciales inválidas y falta de permisos", async (t) => {
  for (const status of [400, 401, 403, 404, 429, 500, 503]) {
    await t.test(`HTTP ${status}`, async () => {
      await assert.rejects(
        verificar({ fetchImpl: crearFetch({}, { status }) }),
        new RegExp(`HTTP ${status}`),
      );
    });
  }
});

test("rechaza JSON inválido y fallas de autenticación de la respuesta", async () => {
  await assert.rejects(verificar({ fetchImpl: crearFetch(new SyntaxError("JSON inválido")) }), /JSON válido/);
  await assert.rejects(verificar({ fetchImpl: crearFetch(null, { status: 401 }) }), /HTTP 401/);
});

test("rechaza timeout y pérdida de conexión sin filtrar credenciales", async () => {
  const timeout = new DOMException("timeout local", "TimeoutError");
  let timeoutMsObserved;
  for (const error of [timeout, new TypeError("socket disconnected")]) {
    await assert.rejects(
      verificar({
        timeoutMs: 321,
        signalFactory: (ms) => {
          timeoutMsObserved = ms;
          return AbortSignal.timeout(ms);
        },
        fetchImpl: crearFetch(null, { error }),
      }),
      (caught) => /red o timeout/.test(caught.message) && !caught.message.includes(ids.token),
    );
  }
  assert.equal(timeoutMsObserved, 321);
});

test("rechaza IDs de proyecto y equipo equivocados devueltos por Vercel", async () => {
  for (const deployment of [
    crearDeployment({ projectId: "prj_ajeno" }),
    crearDeployment({ ownerId: "team_ajeno" }),
  ]) {
    await assert.rejects(verificar({ fetchImpl: crearFetch(deployment) }), /pertenece a otro/);
  }
});

test("rechaza ID, nombre, entorno y estado incorrectos en la respuesta de Vercel", async () => {
  for (const deployment of [
    crearDeployment({ id: "dpl_otro" }),
    crearDeployment({ name: "otro-proyecto" }),
    crearDeployment({ target: "preview" }),
    crearDeployment({ readyState: "BUILDING" }),
    crearDeployment({ readyState: "ERROR" }),
  ]) {
    await assert.rejects(verificar({ fetchImpl: crearFetch(deployment) }));
  }
});

test("rechaza metadata ausente o no perteneciente al repositorio autorizado", async () => {
  for (const deployment of [
    crearDeployment({ meta: undefined }),
    crearDeployment({ meta: { githubOrg: "Taller-SW-Web" } }),
    crearDeployment({ meta: { ...crearDeployment().meta, githubOrg: "otra-org" } }),
    crearDeployment({ meta: { ...crearDeployment().meta, githubRepo: "otro-repo" } }),
  ]) {
    await assert.rejects(verificar({ fetchImpl: crearFetch(deployment) }));
  }
});

test("rechaza rama y SHA que no coinciden entre evento y API", async () => {
  await assert.rejects(
    verificar({ event: crearEvent({ git: { ref: "feature/test", sha } }) }),
    /rama master/,
  );
  await assert.rejects(
    verificar({ fetchImpl: crearFetch(crearDeployment({ meta: { ...crearDeployment().meta, githubCommitRef: "develop" } })) }),
    /rama del despliegue/,
  );
  await assert.rejects(
    verificar({ fetchImpl: crearFetch(crearDeployment({ meta: { ...crearDeployment().meta, githubCommitSha: "b".repeat(40) } })) }),
    /SHA autenticado/,
  );
  await assert.rejects(
    verificar({ fetchImpl: crearFetch(crearDeployment({ meta: { ...crearDeployment().meta, githubCommitSha: "short" } })) }),
    /SHA completo/,
  );
});

test("rechaza IDs y credenciales ausentes o malformados antes de llamar a la API", async () => {
  for (const overrides of [
    { deploymentId: "" },
    { deploymentId: "not-an-id" },
    { token: "" },
    { teamId: "team-without-prefix" },
    { projectId: "prj-without-valid-id" },
  ]) {
    await assert.rejects(verificar(overrides));
  }
});

test("rechaza payloads ausentes o inconsistentes antes de consultar Vercel", async () => {
  await assert.rejects(verificar({ event: {} }), /client_payload/);
  await assert.rejects(verificar({ event: crearEvent({ id: "dpl_other" }) }), /identificador del evento/);
  await assert.rejects(verificar({ event: crearEvent({ environment: "preview" }) }), /entorno production/);
  await assert.rejects(verificar({ event: crearEvent({ project: { id: "prj_other", name: "g6-productos-ofertas" } }) }), /ID de proyecto/);
  await assert.rejects(verificar({ event: crearEvent({ project: { id: ids.projectId, name: "other" } }) }), /nombre de proyecto/);
});

test("no consulta Vercel cuando el evento no pertenece al proyecto o entorno aprobado", async () => {
  for (const event of [
    crearEvent({ project: { id: "prj_ajeno", name: "g6-productos-ofertas" } }),
    crearEvent({ environment: "preview" }),
  ]) {
    let apiConsultada = false;
    await assert.rejects(verificar({
      event,
      fetchImpl: async () => {
        apiConsultada = true;
        return { ok: true, status: 200, json: async () => crearDeployment() };
      },
    }));
    assert.equal(apiConsultada, false);
  }
});

test("solo permite hosts HTTPS inmutables del proyecto, sin alias, URL completa, puerto ni ruta", async (t) => {
  for (const url of [
    "g6-productos-ofertas.vercel.app",
    "g6-productos-ofertas-foo.vercel.app.evil.example",
    "https://g6-productos-ofertas-foo.vercel.app",
    "g6-productos-ofertas-foo.vercel.app:443",
    "g6-productos-ofertas-foo.vercel.app/path",
    "localhost:5174",
    "evil.example",
  ]) {
    await t.test(url, async () => {
      await assert.rejects(verificar({ fetchImpl: crearFetch(crearDeployment({ url })) }), /dominio inmutable/);
    });
  }
});
