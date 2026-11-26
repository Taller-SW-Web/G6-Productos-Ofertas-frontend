import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { runGitleaks } from './security-controls.mjs';
const executable = spawnSync('gitleaks',['version'],{encoding:'utf8',windowsHide:true});
test('Gitleaks detects synthetic secret without echoing its value',{skip: executable.error?.code === 'ENOENT' ? 'BLOCKED_TOOL: gitleaks unavailable' : false},()=>{
 const path=mkdtempSync(join(tmpdir(),'g6-secrets-fixture-'));
 try {
  const fake='ghp_'+createHash('sha256').update('g6-fixture-v1').digest('hex').slice(0,36);
  writeFileSync(join(path,'.env.example'),'PASSWORD=replace-me');
  const scan=()=>runGitleaks(['dir',path,'--no-banner','--redact','--exit-code','42'],path);
  assert.equal(scan().status,'PASS');
  assert.equal(runGitleaks(['invalid-subcommand'],path).status,'INCONCLUSIVE');
  writeFileSync(join(path,'.env'),'PASSWORD='+fake);
  assert.equal(scan().status,'FAIL');
  unlinkSync(join(path,'.env'));
  writeFileSync(join(path,'source.js'),`const demo = "${fake}";`);
  const verdict=scan(); assert.equal(verdict.status,'FAIL'); assert.equal(JSON.stringify(verdict).includes(fake),false);
 } finally {rmSync(path,{recursive:true,force:true});}
});
