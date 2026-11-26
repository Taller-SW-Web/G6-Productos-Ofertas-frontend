#!/usr/bin/env node
const raw = process.argv[2];
if (!raw) { console.error('FALLO: faltan los resultados del workflow.'); process.exit(2); }
let results;
try { results = JSON.parse(raw); } catch { console.error('FALLO: resultados JSON inválidos.'); process.exit(2); }
const required = ['revision_estilo','clasificar_cambios','comprobacion_tipos','unitarias_combos','unitarias_carga_masiva','unitarias_inventario','unitarias_precios','compilacion_demostracion','compilacion_api','verificacion_compilacion','pruebas_rapidas_interfaz','unitarias_taxonomy','politica_release','e2e_pricing','seguridad_dependencias'];
const failures = required.flatMap((job) => results[job]?.result === 'success' ? [] : [`${job}: ${results[job]?.result ?? 'ausente'}`]);
const docsOnly = results.clasificar_cambios?.result === 'success' && results.clasificar_cambios?.outputs?.clasificacion === 'solo_documentacion';
const e2e = results.pruebas_extremo_a_extremo?.result;
if (e2e !== 'success' && !(docsOnly && e2e === 'skipped')) failures.push(`pruebas_extremo_a_extremo: ${e2e ?? 'ausente'}`);
if (failures.length) { console.error(`FALLO: validación obligatoria (${failures.join('; ')}).`); process.exit(1); }
console.log('Correcto: todas las suites obligatorias y la clasificación documental finalizaron según su política.');
