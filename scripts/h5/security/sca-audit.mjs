import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { auditVerdict } from './security-controls.mjs';
const command=process.platform==='win32'?'npm.cmd':'npm';
const run=spawnSync(command,['audit','--json'],{encoding:'utf8',shell:process.platform==='win32',windowsHide:true,timeout:120000,maxBuffer:16*1024*1024});
let lock; try { lock=JSON.parse(readFileSync('package-lock.json','utf8')); } catch { console.log(JSON.stringify({implementation_state:'NEEDS_FIX',execution_result:'INCONCLUSIVE',reason:'LOCKFILE_UNREADABLE'})); process.exitCode=2; }
if (lock) {
 const result=auditVerdict(run.stdout ?? '',run.status,lock);
 console.log(JSON.stringify({implementation_state:'DONE_LOCAL',execution_result:result.status,...result}));
 process.exitCode=result.status==='PASS'?0:result.status==='FAIL'?1:2;
}
