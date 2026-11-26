import { readFileSync } from 'node:fs';
import { sarifVerdict } from './security-controls.mjs';
const [file,sha,execution]=process.argv.slice(2);
let text=''; try { text=readFileSync(file,'utf8'); } catch { /* missing report stays inconclusive */ }
const result=sarifVerdict(text,sha,execution);
console.log(JSON.stringify({implementation_state:'DONE_LOCAL',execution_result:result.status,reason:result.reason}));
process.exitCode=result.status==='PASS'?0:result.status==='FAIL'?1:2;
