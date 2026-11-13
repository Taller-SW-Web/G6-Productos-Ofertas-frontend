import test from "node:test";
import assert from "node:assert/strict";
import { clasificarCambios } from "./clasificar-cambios-ci.mjs";

const doc = (ruta, estado = "M") => ({ ruta, estado, modoAnterior: "100644", modoNuevo: "100644" });

test("clasifica como documental solo Markdown dentro de docs", () => {
  assert.equal(clasificarCambios([doc("docs/guia.md"), doc("docs/evidencias/resumen.mdx", "A")]), "solo_documentacion");
});

test("un cambio mixto ejecuta todas las verificaciones", () => {
  assert.equal(clasificarCambios([doc("docs/guia.md"), doc("src/main.tsx")]), "verificaciones_completas");
});

test("workflow, scripts, dependencias y pruebas nunca se clasifican como documentales", () => {
  for (const ruta of [".github/workflows/frontend.yml", "scripts/build.mjs", "package.json", "tests/catalog.spec.ts", "playwright.config.ts"]) {
    assert.equal(clasificarCambios([doc(ruta)]), "verificaciones_completas", ruta);
  }
});

test("un Markdown fuera de docs y un diff vacío usan verificaciones completas", () => {
  assert.equal(clasificarCambios([doc("README.md")]), "verificaciones_completas");
  assert.equal(clasificarCambios([doc("src/features/catalog/README.md")]), "verificaciones_completas");
  assert.equal(clasificarCambios([]), "verificaciones_completas");
});

test("enlaces simbólicos, cambios de tipo, modos ejecutables y rutas ambiguas ejecutan todo", () => {
  assert.equal(clasificarCambios([{ ...doc("docs/enlace.md"), modoAnterior: "120000" }]), "verificaciones_completas");
  assert.equal(clasificarCambios([{ ...doc("docs/texto.md"), estado: "T" }]), "verificaciones_completas");
  assert.equal(clasificarCambios([{ ...doc("docs/script.md"), modoNuevo: "100755" }]), "verificaciones_completas");
  assert.equal(clasificarCambios([{ ...doc("docs/reporte.md"), estado: "R100" }]), "verificaciones_completas");
});
