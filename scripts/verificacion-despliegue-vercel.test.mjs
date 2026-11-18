import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CONTEXTO_ESTADO } from "./registrar-estado-vercel.mjs";

const WORKFLOW = new URL("../.github/workflows/verificacion-despliegue-vercel.yml", import.meta.url);
const CONTEXTO_VERCEL = "Vercel - g6-productos-ofertas: verificacion-automatizada-production";

test("el workflow publica contextos estables y distintos que nombran Production", async () => {
  const yaml = await readFile(WORKFLOW, "utf8");
  assert.ok(yaml.includes(`name: "${CONTEXTO_VERCEL}"`));
  assert.equal(CONTEXTO_ESTADO, "verificacion-despliegue-produccion");
  assert.match(CONTEXTO_VERCEL, /production$/);
  assert.notEqual(CONTEXTO_VERCEL, CONTEXTO_ESTADO);
});

test("el evento Vercel solo inicia desde master y usa el SHA como grupo sin cancelar el trabajo activo", async () => {
  const yaml = await readFile(WORKFLOW, "utf8");
  assert.match(yaml, /repository_dispatch:\s*\r?\n\s+types:\s*\[vercel\.deployment\.ready\]/);
  assert.match(yaml, /group:\s*\r?\n?\s*verificacion-produccion-\$\{\{\s*github\.event\.client_payload\.git\.sha\s*\|\|\s*github\.run_id\s*\}\}/);
  assert.match(yaml, /cancel-in-progress:\s*false/);
  assert.match(yaml, /github\.event\.client_payload\.git\.ref\s*==\s*'master'/);
  assert.match(yaml, /ref:\s*refs\/heads\/master/);
});

test("la verificación falla cerrada ante cancelación y siempre intenta publicar el estado final", async () => {
  const yaml = await readFile(WORKFLOW, "utf8");
  assert.match(yaml, /name: Registrar resultado final de la comprobación\r?\n\s+if:\s*always\(\)/);
  assert.match(yaml, /RESULTADO_COMPROBACION:\s*\$\{\{\s*job\.status\s*\}\}/);
  assert.match(yaml, /statuses:\s*write/);
});

test("mantiene publicación Git nativa y fija la acción oficial de estado a un commit revisado", async () => {
  const yaml = await readFile(WORKFLOW, "utf8");
  assert.match(yaml, /uses:\s*vercel\/repository-dispatch\/actions\/status@30f760c6640485cd92f8c785ef361382555fb712/);
  assert.doesNotMatch(yaml, /vercel\s+(?:deploy|promote|rollback)|vercel deploy --prod/i);
});

test("la concurrencia serializa eventos con el mismo SHA y mantiene aislados commits distintos", () => {
  const shaA = "a".repeat(40);
  const shaB = "b".repeat(40);
  const group = (sha, runId) => `verificacion-produccion-${sha || runId}`;
  assert.equal(group(shaA, 1), group(shaA, 2));
  assert.notEqual(group(shaA, 1), group(shaB, 1));
  assert.notEqual(group("", 1), group("", 2));
});
