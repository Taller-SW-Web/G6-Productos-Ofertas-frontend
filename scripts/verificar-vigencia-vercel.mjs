import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export function determinarVigencia({ shaDespliegue, shaMaster, errorConsultaMaster }) {
  if (errorConsultaMaster) {
    return {
      vigente: false,
      descripcion: "No se pudo confirmar la versión actual de master.",
    };
  }
  if (!shaDespliegue || !shaMaster || shaDespliegue !== shaMaster) {
    return {
      vigente: false,
      descripcion: "El despliegue quedó obsoleto frente a master.",
    };
  }
  return {
    vigente: true,
    descripcion: "Despliegue verificado y vigente en master.",
  };
}

function exigirVariable(nombre) {
  const valor = process.env[nombre];
  assert.ok(valor, `Falta la variable requerida ${nombre}.`);
  return valor;
}

async function consultarShaMaster({ token, repositorio }) {
  const response = await fetch(`https://api.github.com/repos/${repositorio}/commits/master`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`La consulta de master respondió HTTP ${response.status}.`);
  const body = await response.json();
  assert.match(body.sha ?? "", /^[a-f0-9]{40}$/, "GitHub no devolvió el SHA actual completo de master.");
  return body.sha;
}

async function main() {
  const shaDespliegue = exigirVariable("DEPLOYMENT_SHA");
  assert.match(shaDespliegue, /^[a-f0-9]{40}$/, "DEPLOYMENT_SHA debe contener el SHA completo.");
  const token = exigirVariable("GITHUB_TOKEN");
  const repositorio = exigirVariable("GITHUB_REPOSITORY");
  assert.match(repositorio, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "GITHUB_REPOSITORY no tiene un formato válido.");

  let shaMaster;
  try {
    shaMaster = await consultarShaMaster({ token, repositorio });
  } catch {
    throw new Error("No se pudo confirmar la versión actual de master; la comprobación falla de forma cerrada.");
  }

  const resultado = determinarVigencia({ shaDespliegue, shaMaster });
  assert.ok(resultado.vigente, resultado.descripcion);
  console.log(`Correcto: ${resultado.descripcion} (${shaDespliegue}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`No se pudo verificar la vigencia del despliegue: ${error.message}`);
    process.exitCode = 1;
  });
}
