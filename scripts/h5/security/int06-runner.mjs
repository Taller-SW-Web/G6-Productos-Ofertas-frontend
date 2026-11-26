import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export function prerequisite(env = process.env) {
  if (!env.G6_INT06_BACKEND_PATH) return { implementation_state:'READY_FOR_INTEGRATION', execution_result:'BLOCKED_PROVIDER', reason:'G6_INT06_BACKEND_PATH_REQUIRED', owner:'Taxonomy', command:'node scripts/h5/security/int06-runner.mjs' };
  const backend = resolve(env.G6_INT06_BACKEND_PATH);
  if (!existsSync(join(backend,'tests/h5/run-taxonomy-catalog-postgres.mjs'))) return { implementation_state:'READY_FOR_INTEGRATION', execution_result:'BLOCKED_PROVIDER', reason:'H5_RUNNER_MISSING', owner:'Taxonomy', command:'node scripts/h5/security/int06-runner.mjs' };
  if (!env.G6_E2E_DOCS_PATH || !existsSync(join(env.G6_E2E_DOCS_PATH,'contratos/eventos/asyncapi.yaml'))) return { implementation_state:'READY_FOR_INTEGRATION', execution_result:'BLOCKED_CONTRACT', reason:'DOCS_RC3_REQUIRED', owner:'Docs', command:'node scripts/h5/security/int06-runner.mjs' };
  const sha = spawnSync('git',['rev-parse','HEAD'],{cwd:backend,encoding:'utf8',windowsHide:true});
  if (sha.status !== 0 || !/^[a-f0-9]{40}$/.test(sha.stdout.trim())) return { implementation_state:'READY_FOR_INTEGRATION', execution_result:'INCONCLUSIVE', reason:'BACKEND_SHA_UNAVAILABLE', owner:'Taxonomy' };
  const state = spawnSync('git',['status','--porcelain'],{cwd:backend,encoding:'utf8',windowsHide:true});
  if (state.status !== 0 || state.stdout.trim()) return { implementation_state:'READY_FOR_INTEGRATION', execution_result:'INCONCLUSIVE', reason:'BACKEND_WORKTREE_NOT_CLEAN', owner:'Taxonomy', backend_sha:sha.stdout.trim() };
  if (env.G6_INT06_EXPECTED_SHA && sha.stdout.trim() !== env.G6_INT06_EXPECTED_SHA) return { implementation_state:'READY_FOR_INTEGRATION', execution_result:'BLOCKED_PROVIDER', reason:'BACKEND_SHA_MISMATCH', owner:'Taxonomy', backend_sha:sha.stdout.trim() };
  return { implementation_state:'READY_FOR_INTEGRATION', execution_result:'NOT_RUN', backend, backend_sha:sha.stdout.trim() };
}
if (process.argv[1] && import.meta.url === new URL('file:'+process.argv[1].replaceAll('\\','/')).href) {
  const check=prerequisite();
  if (check.execution_result !== 'NOT_RUN') { console.log(JSON.stringify(check)); process.exitCode=2; }
  else {
    const result=spawnSync(process.execPath,['tests/h5/run-taxonomy-catalog-postgres.mjs'],{cwd:check.backend,env:process.env,stdio:'inherit',windowsHide:true});
    console.log(JSON.stringify({implementation_state:'READY_FOR_INTEGRATION',execution_result:result.status===0?'PASS':'FAIL',backend_sha:check.backend_sha,level:'L1_DISPOSABLE_POSTGRES',limits:'No Azure, G7 ni homologacion real'}));
    process.exitCode=result.status ?? 1;
  }
}
