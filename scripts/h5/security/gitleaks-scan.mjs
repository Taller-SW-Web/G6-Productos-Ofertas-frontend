import { spawnSync } from 'node:child_process';
import { runGitleaks } from './security-controls.mjs';
const mode=process.argv[2] ?? 'diff';
const base=process.argv[3];
if (!['diff','repository'].includes(mode) || (mode === 'diff' && !/^[a-f0-9]{40}$/.test(base ?? ''))) {
  console.log(JSON.stringify({implementation_state:'READY_FOR_INTEGRATION',execution_result:'INCONCLUSIVE',reason:'USAGE: diff BASE_SHA | repository'})); process.exitCode=2;
} else {
  const untracked=spawnSync('git',['ls-files','--others','--exclude-standard','-z'],{encoding:'utf8',windowsHide:true});
  if (untracked.status !== 0 || (mode==='diff' && untracked.stdout.length)) {
    console.log(JSON.stringify({implementation_state:'READY_FOR_INTEGRATION',execution_result:'INCONCLUSIVE',reason:'UNTRACKED_FILES_NOT_IN_DIFF'})); process.exitCode=2;
  } else {
    const diff = mode==='diff' ? spawnSync('git',['diff','--no-ext-diff','--binary',base,'--'],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024}) : null;
    if (diff && (diff.status !== 0 || diff.error)) { console.log(JSON.stringify({implementation_state:'READY_FOR_INTEGRATION',execution_result:'INCONCLUSIVE',reason:'GIT_DIFF_FAILED'})); process.exitCode=2; }
    else {
      const args=mode==='diff'?['stdin','--no-banner','--redact','--exit-code','42']:['git','--no-banner','--redact','--exit-code','42','.'];
      const result=runGitleaks(args,process.cwd(),diff?.stdout);
      console.log(JSON.stringify({implementation_state:'DONE_LOCAL',execution_result:result.status,scope:mode,tool:'gitleaks',redacted:true}));
      process.exitCode=result.status==='PASS'?0:result.status==='FAIL'?1:2;
    }
  }
}
