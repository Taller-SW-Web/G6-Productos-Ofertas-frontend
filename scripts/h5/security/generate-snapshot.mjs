import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanBundle, runGitleaks, coverageCounts } from './security-controls.mjs';
import { prerequisite } from './int06-runner.mjs';

const sha=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
const dirty=Boolean(spawnSync('git',['status','--porcelain'],{encoding:'utf8'}).stdout.trim());
const preflight=JSON.parse(readFileSync('scripts/h5/security/preflight.json','utf8').replace(/^\uFEFF/,''));
const inputs=['scripts/h5/security/generate-snapshot.mjs','scripts/h5/security/bundle-check.mjs','scripts/h5/security/security-controls.mjs','scripts/h5/security/security-controls.test.mjs','scripts/h5/security/gitleaks.fixture.test.mjs','scripts/h5/security/gitleaks-scan.mjs','scripts/h5/security/sca-audit.mjs','scripts/h5/security/sarif-check.mjs','scripts/h5/security/int06-runner.mjs','scripts/h5/security/int06-runner.test.mjs','scripts/h5/security/identity-contract.test.mjs','tests/h5/security-boundary.spec.ts','tests/h5/security-playwright.config.ts'];
const hash=createHash('sha256'); for (const name of inputs.sort()) hash.update(name+'\0').update(readFileSync(name));
const runTests=(...paths)=>spawnSync(process.execPath,['--test',...paths],{encoding:'utf8',timeout:30000,windowsHide:true});
const tests=runTests('scripts/h5/security/security-controls.test.mjs','scripts/h5/security/int06-runner.test.mjs');
const fixture=runTests('scripts/h5/security/gitleaks.fixture.test.mjs');
const identity=runTests('scripts/h5/security/identity-contract.test.mjs');
const env={...process.env,PLAYWRIGHT_PORT:process.env.G6_SECURITY_PORT ?? '5191'};
const browser=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test','--config','tests/h5/security-playwright.config.ts','--reporter=line','--workers=1'],{env,encoding:'utf8',timeout:90000,windowsHide:true,maxBuffer:4*1024*1024});
const sca=spawnSync(process.execPath,['scripts/h5/security/sca-audit.mjs'],{env,encoding:'utf8',timeout:125000,windowsHide:true});
let audit={execution_result:'INCONCLUSIVE',reason:'AUDIT_RUN_FAILED'}; try { audit=JSON.parse(sca.stdout.trim().split('\n').at(-1)); } catch { /* preserve explicit inconclusive */ }
const gitleaks=runGitleaks(['git','--no-banner','--redact','--exit-code','42','.'],process.cwd());
const diffScan=spawnSync(process.execPath,['scripts/h5/security/gitleaks-scan.mjs','diff',preflight.base_sha],{encoding:'utf8',timeout:120000,windowsHide:true});
let diffResult={execution_result:'INCONCLUSIVE'}; try { diffResult=JSON.parse(diffScan.stdout.trim()); } catch { /* no PASS when scanner unavailable */ }

const mock=scanBundle('node_modules/.cache/security-mock');
const api=scanBundle('node_modules/.cache/security-api');
let prereq=prerequisite();
if (prereq.execution_result === 'NOT_RUN') {
 const integration=spawnSync(process.execPath,['scripts/h5/security/int06-runner.mjs'],{env,encoding:'utf8',timeout:180000,windowsHide:true,maxBuffer:8*1024*1024});
 try { const last=integration.stdout.trim().split('\n').at(-1); prereq=JSON.parse(last); }
 catch { prereq={implementation_state:'READY_FOR_INTEGRATION',execution_result:'INCONCLUSIVE',reason:'INT06_RUN_FAILED'}; }
}

let taxonomyHttp='NOT_RUN'; let taxonomyHttpReason='NOT_EXECUTED';
if (prereq.execution_result === 'PASS' && env.G6_INT06_BACKEND_PATH && env.G6_RUN_TAXONOMY_HTTP === '1') {
 const local=spawnSync(process.execPath,['scripts/ci/run-taxonomy-integration.mjs'],{cwd:env.G6_INT06_BACKEND_PATH,env,encoding:'utf8',timeout:180000,windowsHide:true,maxBuffer:8*1024*1024});
 taxonomyHttp=local.status===0?'PASS':local.error?'INCONCLUSIVE':'FAIL';
 const phase=((local.stdout ?? '')+'\n'+(local.stderr ?? '')).match(/\[taxonomy-integration\] FAIL fase=([a-z0-9-]+)/i)?.[1];
 taxonomyHttpReason=local.status===0?'COMPLETED':local.error?.code ?? (phase ? `PHASE_${phase}` : `PROCESS_EXIT_${local.status}`);
}
const cases=[
 {case_id:'LOP-A01-SARIF-NEGATIVES',implementation_state:'DONE_LOCAL',execution_result:tests.status===0?'PASS':'FAIL'},
 {case_id:'LOP-A01-CODEQL-ACTIVE',implementation_state:'READY_FOR_INTEGRATION',execution_result:'BLOCKED_GH_ADMIN',owner:'GitHub Admin'},
 {case_id:'LOP-A02-SCA',implementation_state:'DONE_LOCAL',execution_result:audit.execution_result,details:audit.counts},
 {case_id:'LOP-A02-GITLEAKS-HISTORY',implementation_state:'DONE_LOCAL',execution_result:gitleaks.status,owner:'Frontend/security'},
 {case_id:'LOP-A02-GITLEAKS-DIFF',implementation_state:'DONE_LOCAL',execution_result:diffResult.execution_result,owner:'Frontend/security'},
 {case_id:'LOP-A02-NEGATIVE-FIXTURES',implementation_state:'DONE_LOCAL',execution_result:fixture.status===0?(fixture.stdout.includes('BLOCKED_TOOL')?'BLOCKED_TOOL':'PASS'):'FAIL',limits:'Gitleaks integration fixture is skipped when tool unavailable'},
 {case_id:'LOP-A03-ANONYMOUS',implementation_state:'DONE_LOCAL',execution_result:browser.status===0?'PASS':'FAIL',limits:'Synthetic provider; no real JWT or grants'},
 {case_id:'LOP-A03-SCOPE-M2M-FIXTURE',implementation_state:'DONE_LOCAL',execution_result:browser.status===0?'PASS':'FAIL',limits:'Synthetic provider; no real JWT or grants'},
 {case_id:'LOP-A03-CORS-PREFLIGHT',implementation_state:'DONE_LOCAL',execution_result:browser.status===0?'PASS':'FAIL',limits:'Synthetic provider; no real JWT or grants'},
 {case_id:'LOP-A03-CORS-DENIED',implementation_state:'DONE_LOCAL',execution_result:browser.status===0?'PASS':'FAIL',limits:'Synthetic provider; no real JWT or grants'},
 {case_id:'LOP-A03-CSP-ISOLATED',implementation_state:'DONE_LOCAL',execution_result:browser.status===0?'PASS':'FAIL',limits:'Synthetic provider; no real JWT or grants'},
 {case_id:'LOP-A03-XSS-UI',implementation_state:'DONE_LOCAL',execution_result:browser.status===0?'PASS':'FAIL',limits:'Synthetic provider; no real JWT or grants'},
 {case_id:'LOP-A03-REFRESH-MULTITAB-LOGOUT',implementation_state:'DONE_LOCAL',execution_result:browser.status===0?'PASS':'FAIL',owner:'Frontend',limits:'Synthetic provider, new tab and logout; active-tab revocation remains external'},
 {case_id:'LOP-A03-JWT-SYNTHETIC',implementation_state:'DONE_LOCAL',execution_result:identity.status===0?'PASS':'FAIL',limits:'Synthetic provider, no G7 authority'},
 {case_id:'LOP-A03-REAL-JWT-SCOPE',implementation_state:'READY_FOR_INTEGRATION',execution_result:'BLOCKED_G7',owner:'G7'},
 {case_id:'LOP-A03-REAL-CSP-CORS',implementation_state:'READY_FOR_INTEGRATION',execution_result:'NOT_RUN',owner:'Frontend/Infra'},
 {case_id:'LOP-A04-INT06',implementation_state:prereq.implementation_state,execution_result:prereq.execution_result,owner:'Taxonomy'},
 {case_id:'LOP-A05-CI-INTEGRATION',implementation_state:'READY_FOR_INTEGRATION',execution_result:'BLOCKED_GH_ADMIN',owner:'Frontend/GitHub Admin'},
 {case_id:'LOP-A06-BUNDLE-MOCK',implementation_state:'DONE_LOCAL',execution_result:mock.status,artifact_sha256:mock.sha256},
 {case_id:'LOP-A06-BUNDLE-API',implementation_state:'DONE_LOCAL',execution_result:api.status,artifact_sha256:api.sha256},
 {case_id:'LOP-A07-SERVICE-BUS',implementation_state:'READY_FOR_INTEGRATION',execution_result:'BLOCKED_SB',owner:'Axel/Azure'},
 {case_id:'LOP-A07-TAXONOMY-HTTP',implementation_state:'READY_FOR_INTEGRATION',execution_result:taxonomyHttp,reason:taxonomyHttpReason,owner:'Taxonomy',limits:'Backend branch under test, PostgreSQL disposable; not deployed'},
];
const snapshot={repo:preflight.repo,source_sha:sha,source_tree_dirty:dirty,source_fingerprint_sha256:hash.digest('hex'),docs_sha:preflight.docs_sha,timestamp_utc:new Date().toISOString(),node_version:process.version,lock_sha256:createHash('sha256').update(readFileSync('package-lock.json')).digest('hex'),scanner_status:{unit:tests.status===0&&fixture.status===0&&identity.status===0?'PASS':'FAIL',browser:browser.status===0?'PASS':'FAIL',audit:audit.execution_result,gitleaks:gitleaks.status,gitleaks_diff:diffResult.execution_result,codeql:'GITHUB_ADMIN_NOT_VERIFIED',server_headers:'SERVER_HEADERS_NOT_VERIFIED'},cases};
const output=resolve(process.argv[2] ?? 'scripts/h5/security/fe-security-snapshot.json');
const manifest=resolve(process.argv[3] ?? 'scripts/h5/security/coverage-manifest.json');
const serialized=JSON.stringify(snapshot,null,2)+'\n'; writeFileSync(output,serialized);
const result={source_sha:sha,source_fingerprint_sha256:snapshot.source_fingerprint_sha256,snapshot_sha256:createHash('sha256').update(serialized).digest('hex'),...coverageCounts(cases),cases};
writeFileSync(manifest,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({snapshot:output,manifest,counts:{total_cases:result.total_cases,executed_local_cases:result.executed_local_cases,passed_local_cases:result.passed_local_cases,blocked_external_cases:result.blocked_external_cases,failed_cases:result.failed_cases},source_sha:sha,dirty}));
if(tests.status!==0||fixture.status!==0||identity.status!==0||browser.status!==0||audit.execution_result!=='PASS'||mock.status!=='PASS'||api.status!=='PASS'||gitleaks.status==='FAIL'||diffResult.execution_result==='FAIL') process.exitCode=1;
