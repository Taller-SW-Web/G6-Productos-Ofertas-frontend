import assert from "node:assert/strict";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PROYECTO_VERCEL = "g6-productos-ofertas";
export const ORGANIZACION_GITHUB = "Taller-SW-Web";
export const REPOSITORIO_GITHUB = "G6-Productos-Ofertas-frontend";
const URL_INMUTABLE = /^g6-productos-ofertas-[a-z0-9-]+\.vercel\.app$/;

function exigirCadena(value, message) {
  assert.ok(typeof value === "string" && value.length > 0, message);
  return value;
}

function validarEvento({ event, deploymentId, projectId }) {
  const payload = event?.client_payload;
  assert.ok(payload && typeof payload === "object", "El evento no contiene client_payload válido.");
  assert.equal(payload.id, deploymentId, "El identificador del evento no coincide.");
  assert.equal(payload.environment, "production", "El evento no corresponde al entorno production.");
  assert.equal(payload.project?.name, PROYECTO_VERCEL, "El nombre de proyecto del evento no coincide.");
  assert.equal(payload.project?.id, projectId, "El ID de proyecto del evento no coincide.");
  assert.equal(payload.git?.ref, "master", "El evento no identifica la rama master.");
  assert.match(payload.git?.sha ?? "", /^[a-f0-9]{40}$/, "El evento no contiene un SHA completo válido.");
  return payload;
}

async function consultarJson({ url, headers, descripcion, fetchImpl, timeoutMs, signalFactory }) {
  let response;
  try {
    response = await fetchImpl(url, { headers, signal: signalFactory(timeoutMs) });
  } catch {
    throw new Error(`No fue posible consultar ${descripcion} (red o timeout).`);
  }
  if (!response?.ok) {
    throw new Error(`La consulta autenticada de ${descripcion} respondió HTTP ${response?.status ?? "desconocido"}.`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`La respuesta de ${descripcion} no contiene JSON válido.`);
  }
}

function validarHostInmutable(value) {
  assert.ok(typeof value === "string", "Vercel no devolvió la URL del despliegue.");
  assert.match(value, URL_INMUTABLE, "La URL autenticada no pertenece al dominio inmutable del proyecto.");
  const url = new URL(`https://${value}`);
  assert.equal(url.protocol, "https:", "La URL del despliegue no usa HTTPS.");
  assert.equal(url.hostname, value, "La URL del despliegue contiene una autoridad inválida.");
  assert.equal(url.port, "", "La URL del despliegue contiene un puerto inesperado.");
  assert.equal(url.pathname, "/", "La URL del despliegue contiene una ruta inesperada.");
  return url.origin;
}

/**
 * Comprueba el payload de Vercel contra la API autenticada sin leer credenciales
 * globales ni producir efectos. `fetchImpl` y `signalFactory` permiten probar
 * todas las respuestas y errores de red sin secretos reales.
 */
export async function verificarIdentidadDespliegue({
  event,
  deploymentId: deploymentIdInput,
  token: tokenInput,
  teamId: teamIdInput,
  projectId: projectIdInput,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
  signalFactory = (ms) => AbortSignal.timeout(ms),
}) {
  const deploymentId = exigirCadena(deploymentIdInput, "El evento no contiene un identificador de despliegue.");
  const token = exigirCadena(tokenInput, "Falta el secreto VERCEL_TOKEN del entorno protegido.");
  const teamId = exigirCadena(teamIdInput, "Falta la variable VERCEL_TEAM_ID.");
  const projectId = exigirCadena(projectIdInput, "Falta la variable VERCEL_PROJECT_ID.");
  assert.match(deploymentId, /^dpl_[A-Za-z0-9]+$/, "El identificador de despliegue no tiene el formato esperado.");
  assert.match(teamId, /^team_[A-Za-z0-9]+$/, "VERCEL_TEAM_ID no tiene el formato esperado.");
  assert.match(projectId, /^prj_[A-Za-z0-9]+$/, "VERCEL_PROJECT_ID no tiene el formato esperado.");
  assert.equal(typeof fetchImpl, "function", "No está disponible fetch para consultar Vercel.");

  const payload = validarEvento({ event, deploymentId, projectId });
  const apiUrl = `https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}?teamId=${encodeURIComponent(teamId)}&withGitRepoInfo=1`;
  const deployment = await consultarJson({
    url: apiUrl,
    headers: { Authorization: `Bearer ${token}` },
    descripcion: "el despliegue en Vercel",
    fetchImpl,
    timeoutMs,
    signalFactory,
  });

  assert.equal(deployment?.id, deploymentId, "Vercel devolvió un despliegue diferente al solicitado.");
  assert.equal(deployment?.projectId, projectId, "El despliegue pertenece a otro proyecto.");
  assert.equal(deployment?.ownerId, teamId, "El despliegue pertenece a otro equipo.");
  assert.equal(deployment?.name, PROYECTO_VERCEL, "El nombre del proyecto autenticado no coincide.");
  assert.equal(deployment?.target, "production", "El despliegue no es de producción.");
  assert.equal(deployment?.readyState, "READY", "El despliegue autenticado aún no está listo.");

  const metadata = deployment.meta;
  assert.ok(metadata && typeof metadata === "object", "Vercel no devolvió metadata del repositorio.");
  assert.equal(metadata.githubOrg, ORGANIZACION_GITHUB, "La organización GitHub del despliegue no coincide.");
  assert.equal(metadata.githubRepo, REPOSITORIO_GITHUB, "El repositorio GitHub del despliegue no coincide.");
  assert.equal(metadata.githubCommitRef, "master", "La rama del despliegue no coincide con master.");
  assert.match(metadata.githubCommitSha ?? "", /^[a-f0-9]{40}$/, "Vercel no devolvió un SHA completo válido.");
  assert.equal(metadata.githubCommitSha, payload.git.sha, "El SHA autenticado por Vercel no coincide con el evento.");
  assert.equal(metadata.githubCommitRef, payload.git.ref, "La rama autenticada por Vercel no coincide con el evento.");

  return {
    deploymentUrl: validarHostInmutable(deployment.url),
    commitSha: metadata.githubCommitSha,
  };
}

export async function escribirResultadosIdentidad({ result, outputPath, summaryPath }) {
  exigirCadena(outputPath, "No está disponible GITHUB_OUTPUT.");
  await appendFile(outputPath, `deployment_url=${result.deploymentUrl}\ncommit_sha=${result.commitSha}\n`);
  if (summaryPath) {
    await appendFile(
      summaryPath,
      `### Versión autenticada lista para verificación\n\n- SHA: \`${result.commitSha}\`\n- Proyecto: \`${PROYECTO_VERCEL}\`\n- Rama: \`master\`\n- URL inmutable: ${result.deploymentUrl}\n- Dominio público: pendiente de asignación por Vercel hasta superar el control.\n`,
    );
  }
}

async function main(env = process.env) {
  const eventPath = exigirCadena(env.GITHUB_EVENT_PATH, "No está disponible el contenido del evento de GitHub.");
  let event;
  try {
    event = JSON.parse(await readFile(eventPath, "utf8"));
  } catch {
    throw new Error("El contenido del evento de GitHub no contiene JSON válido.");
  }

  const result = await verificarIdentidadDespliegue({
    event,
    deploymentId: env.VERCEL_DEPLOYMENT_ID,
    token: env.VERCEL_TOKEN,
    teamId: env.VERCEL_TEAM_ID,
    projectId: env.VERCEL_PROJECT_ID,
  });
  await escribirResultadosIdentidad({
    result,
    outputPath: env.GITHUB_OUTPUT,
    summaryPath: env.GITHUB_STEP_SUMMARY,
  });
  console.log(`Identidad verificada para el SHA ${result.commitSha} en ${result.deploymentUrl}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`No se pudo validar la identidad del despliegue: ${error.message}`);
    process.exitCode = 1;
  });
}
