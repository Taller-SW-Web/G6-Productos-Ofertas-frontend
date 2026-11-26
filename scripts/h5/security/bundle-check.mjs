import { scanBundle } from './security-controls.mjs';
const path=process.argv[2];
if (!path) { console.log(JSON.stringify({implementation_state:'DONE_LOCAL',execution_result:'INCONCLUSIVE',reason:'BUNDLE_PATH_REQUIRED'})); process.exitCode=2; }
else { const result=scanBundle(path); console.log(JSON.stringify({implementation_state:'DONE_LOCAL',execution_result:result.status,...result})); process.exitCode=result.status==='PASS'?0:result.status==='FAIL'?1:2; }
