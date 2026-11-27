import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const checker=fileURLToPath(new URL('./verificar-resultados.mjs',import.meta.url));
const jobs=['revision_estilo','clasificar_cambios','comprobacion_tipos','unitarias_combos','unitarias_carga_masiva','unitarias_inventario','unitarias_precios','compilacion_demostracion','compilacion_api','verificacion_compilacion','pruebas_rapidas_interfaz','unitarias_taxonomy','politica_release','e2e_pricing','seguridad_dependencias','seguridad_h5'];
const good=()=>Object.fromEntries([...jobs.map(j=>[j,{result:'success'}]),['pruebas_extremo_a_extremo',{result:'success'}]]);
const run=(x)=>spawnSync(process.execPath,[checker,JSON.stringify(x)],{encoding:'utf8'});
test('aprueba todos los resultados obligatorios observados',()=>assert.equal(run(good()).status,0));
for(const job of jobs){
 test(`falla ante ${job} omitido`,()=>{const x=good();delete x[job];const r=run(x);assert.equal(r.status,1);assert.match(r.stderr,new RegExp(`${job}: ausente`));});
 for(const status of ['failure','skipped','cancelled']) test(`falla ante ${job}=${status}`,()=>{const x=good();x[job]={result:status};const r=run(x);assert.equal(r.status,1);});
}
test('solo permite omitir E2E general con clasificación documental exitosa',()=>{const x=good();x.clasificar_cambios={result:'success',outputs:{clasificacion:'solo_documentacion'}};x.pruebas_extremo_a_extremo={result:'skipped'};assert.equal(run(x).status,0);});
test('rechaza E2E omitido ante clasificación funcional o dudosa',()=>{for(const classification of ['funcional','unknown']){const x=good();x.clasificar_cambios={result:'success',outputs:{clasificacion:classification}};x.pruebas_extremo_a_extremo={result:'skipped'};assert.equal(run(x).status,1);}});
test('rechaza fallos y omisiones de la nueva auditoría de seguridad',()=>{for(const status of ['failure','skipped']){const x=good();x.seguridad_dependencias={result:status};assert.equal(run(x).status,1);}});
