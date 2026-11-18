import test from "node:test";
import assert from "node:assert/strict";
import { determinarVigencia } from "./verificar-vigencia-vercel.mjs";

const shaVigente = "a".repeat(40);
const shaObsoleto = "b".repeat(40);

test("permite el despliegue si el smoke pasó y el SHA coincide con master", () => {
  assert.deepEqual(
    determinarVigencia({ shaDespliegue: shaVigente, shaMaster: shaVigente }),
    { vigente: true, descripcion: "Despliegue verificado y vigente en master." },
  );
});

test("rechaza el despliegue cuando su SHA quedó obsoleto", () => {
  const resultado = determinarVigencia({ shaDespliegue: shaObsoleto, shaMaster: shaVigente });
  assert.equal(resultado.vigente, false);
  assert.match(resultado.descripcion, /obsoleto/);
});

test("falla de forma cerrada si no pudo consultar master", () => {
  assert.deepEqual(
    determinarVigencia({ shaDespliegue: shaVigente, errorConsultaMaster: true }),
    { vigente: false, descripcion: "No se pudo confirmar la versión actual de master." },
  );
});

test("falla de forma cerrada si falta cualquiera de los SHA", () => {
  assert.equal(determinarVigencia({ shaDespliegue: shaVigente }).vigente, false);
  assert.equal(determinarVigencia({ shaMaster: shaVigente }).vigente, false);
});
