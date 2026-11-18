import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const CONTEXTO_ESTADO = "verificacion-despliegue-produccion";

export function determinarEstadoFinal({ resultadoComprobacion, shaDespliegue, shaMaster, errorConsultaMaster }) {
  if (resultadoComprobacion !== "success") {
    return {
      estado: "failure",
      descripcion: "La comprobación remota no terminó correctamente.",
    };
  }
  if (errorConsultaMaster) {
    return {
      estado: "failure",
      descripcion: "No se pudo confirmar la versión actual de master.",
    };
  }
  if (!shaDespliegue || !shaMaster || shaDespliegue !== shaMaster) {
    return {
      estado: "failure",
      descripcion: "El despliegue quedó obsoleto frente a master.",
    };
  }
  return {
    estado: "success",
    descripcion: "Despliegue verificado y vigente en master.",
  };
}

function exigirVariable(nombre, valor = process.env[nombre]) {
  assert.ok(valor, `Falta la variable requerida ${nombre}.`);
  return valor;
}

async function consultarShaMaster({ token, repositorio, fetchImpl, timeoutMs, signalFactory }) {
  const response = await fetchImpl(`https://api.github.com/repos/${repositorio}/commits/master`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: signalFactory(timeoutMs),
  });
  if (!response.ok) throw new Error(`La consulta de master respondió HTTP ${response.status}.`);
  const body = await response.json();
  assert.match(body.sha ?? "", /^[a-f0-9]{40}$/, "GitHub no devolvió el SHA actual completo de master.");
  return body.sha;
}

async function publicarEstado({ token, repositorio, sha, estado, descripcion, runUrl, fetchImpl, timeoutMs, signalFactory }) {
  const response = await fetchImpl(`https://api.github.com/repos/${repositorio}/statuses/${sha}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      state: estado,
      context: CONTEXTO_ESTADO,
      description: descripcion,
      target_url: runUrl,
    }),
    signal: signalFactory(timeoutMs),
  });
  if (!response.ok) throw new Error(`GitHub no aceptó el estado final (HTTP ${response.status}).`);
  console.log(`Estado ${estado} registrado para el SHA ${sha} en ${CONTEXTO_ESTADO}.`);
}

export async function registrarEstado({
  fase,
  token,
  repositorio,
  sha,
  resultadoComprobacion,
  runUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
  signalFactory = (ms) => AbortSignal.timeout(ms),
}) {
  assert.ok(fase === "pendiente" || fase === "final", "FASE_ESTADO debe ser pendiente o final.");
  exigirVariable("GITHUB_TOKEN", token);
  exigirVariable("GITHUB_REPOSITORY", repositorio);
  exigirVariable("DEPLOYMENT_SHA", sha);
  assert.match(repositorio, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "GITHUB_REPOSITORY no tiene un formato válido.");
  assert.match(sha, /^[a-f0-9]{40}$/, "DEPLOYMENT_SHA debe contener el SHA completo.");
  exigirVariable("GITHUB_RUN_URL", runUrl);
  assert.equal(typeof fetchImpl, "function", "No está disponible fetch para publicar estados.");
  let resultado;
  if (fase === "pendiente") {
    resultado = { estado: "pending", descripcion: "Identidad validada; comprobación de producción en curso." };
  } else {
    let shaMaster;
    let errorConsultaMaster = false;
    try {
      shaMaster = await consultarShaMaster({ token, repositorio, fetchImpl, timeoutMs, signalFactory });
    } catch {
      errorConsultaMaster = true;
    }
    resultado = determinarEstadoFinal({
      resultadoComprobacion,
      shaDespliegue: sha,
      shaMaster,
      errorConsultaMaster,
    });
  }

  await publicarEstado({
    token,
    repositorio,
    sha,
    ...resultado,
    runUrl,
    fetchImpl,
    timeoutMs,
    signalFactory,
  });
  return resultado;
}

async function main(env = process.env) {
  const fase = exigirVariable("FASE_ESTADO", env.FASE_ESTADO);
  const token = exigirVariable("GITHUB_TOKEN", env.GITHUB_TOKEN);
  const repositorio = exigirVariable("GITHUB_REPOSITORY", env.GITHUB_REPOSITORY);
  const sha = exigirVariable("DEPLOYMENT_SHA", env.DEPLOYMENT_SHA);
  const serverUrl = exigirVariable("GITHUB_SERVER_URL", env.GITHUB_SERVER_URL);
  const runId = exigirVariable("GITHUB_RUN_ID", env.GITHUB_RUN_ID);
  const runUrl = `${serverUrl}/${repositorio}/actions/runs/${runId}`;

  await registrarEstado({
    fase,
    token,
    repositorio,
    sha,
    resultadoComprobacion: env.RESULTADO_COMPROBACION,
    runUrl,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`No se pudo registrar el estado de verificación: ${error.message}`);
    process.exitCode = 1;
  });
}
