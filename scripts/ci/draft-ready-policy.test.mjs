import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const wf=await readFile('.github/workflows/frontend.yml','utf8');
const events='opened, reopened, synchronize, ready_for_review, converted_to_draft, edited';
test('Frontend declara eventos Draft/Ready, push master y despacho manual',()=>{assert.ok(wf.includes(events));assert.match(wf,/push:[\s\S]*?branches: \[master\]/);assert.match(wf,/workflow_dispatch:/);});
test('los jobs ordinarios distinguen Draft',()=>{const blocks=wf.split('\njobs:\n')[1].split(/\n  [a-z][a-z0-9_-]*:\n/);for(const block of blocks.slice(1)){if(block.includes('Benchmark administrativo base y optimizado'))continue;assert.match(block,/github.event.pull_request.draft == false/);}});
test('Taxonomy, release policy, Pricing E2E y seguridad participan de validate',()=>{for(const id of ['unitarias_taxonomy','politica_release','e2e_pricing','seguridad_dependencias'])assert.match(wf,new RegExp('needs:[\\s\\S]*?'+id));assert.match(wf,/name: validate/);assert.match(wf,/scripts\/ci\/verificar-resultados\.mjs/);});
test('el harness permanece manual y no se cancela mientras protegido',()=>{assert.match(wf,/if: github\.event_name == 'workflow_dispatch' && inputs\.performance_harness/);assert.match(wf,/cancel-in-progress: \$\{\{ github\.event_name != 'workflow_dispatch' \|\| !inputs\.performance_harness \}\}/);});
