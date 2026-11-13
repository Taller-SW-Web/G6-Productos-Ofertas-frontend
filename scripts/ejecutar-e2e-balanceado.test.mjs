import test from "node:test";
import assert from "node:assert/strict";
import { extraerArchivosDeLista, validarManifiestos } from "./ejecutar-e2e-balanceado.mjs";

test("extrae rutas de pruebas y normaliza separadores", () => {
  const archivos = extraerArchivosDeLista(
    "  catalog.spec.ts:12:3 › una prueba\n  combos\\smoke.spec.ts:4:1 › otra prueba\nTotal: 2 tests in 2 files",
  );
  assert.deepEqual([...archivos], ["catalog.spec.ts", "combos/smoke.spec.ts"]);
});

test("acepta una cobertura completa con archivos nuevos dentro de una prueba existente", () => {
  assert.equal(validarManifiestos(["catalog.spec.ts", "combos/smoke.spec.ts"], [["catalog.spec.ts"], ["combos/smoke.spec.ts"]]).valido, true);
});

test("rechaza manifiestos con archivos ausentes, adicionales o duplicados", () => {
  const resultado = validarManifiestos(["catalog.spec.ts", "combos/smoke.spec.ts"], [
    ["catalog.spec.ts", "catalog.spec.ts"],
    ["catalog-removed.spec.ts"],
  ]);
  assert.equal(resultado.valido, false);
  assert.deepEqual(resultado.faltantes, ["combos/smoke.spec.ts"]);
  assert.deepEqual(resultado.adicionales, ["catalog-removed.spec.ts"]);
  assert.deepEqual(resultado.duplicados, ["catalog.spec.ts"]);
});
