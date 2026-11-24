import test from 'node:test';
import assert from 'node:assert/strict';
import { sarifVerdict,auditVerdict,validateAllowlist,checkHeaders,scanBundleText,runGitleaks } from './security-controls.mjs';
const sha='a'.repeat(40);
const sarif=JSON.stringify({version:'2.1.0',runs:[{results:[],versionControlProvenance:[{revisionId:sha}]}]});
test('SARIF missing, malformed, different SHA and cancelled never pass',()=>{for(const [s,h,x] of [['',sha,'success'],['{}',sha,'success'],[sarif,'b'.repeat(40),'success'],[sarif,sha,'cancelled']]) assert.notEqual(sarifVerdict(s,h,x).status,'PASS'); assert.equal(sarifVerdict(sarif,sha,'success').status,'PASS');});
test('audit error, empty, malformed and high are not pass',()=>{for(const x of ['', '{}', 'not json', JSON.stringify({error:{code:'ENET'}})]) assert.equal(auditVerdict(x,1).status,'INCONCLUSIVE'); const report={vulnerabilities:{test:{severity:'high',isDirect:true}},metadata:{vulnerabilities:{high:1}}}; assert.equal(auditVerdict(JSON.stringify(report),1).status,'FAIL'); assert.equal(auditVerdict(JSON.stringify(report),2).status,'INCONCLUSIVE');});
test('expired and missing secret exceptions fail',()=>{assert.equal(validateAllowlist([{}]),false);assert.equal(validateAllowlist([{expires:'2001-01-01'}]),false);assert.equal(validateAllowlist([{expires:'2099-01-01'}]),true);});
test('missing CSP and wildcard CORS are explicit failures',()=>{assert.deepEqual(checkHeaders({'Access-Control-Allow-Origin':'*'}),{csp:'FAIL',cors:'FAIL_WILDCARD'});});
test('bundle detects synthetic privileged variables without printing them',()=>{for(const value of ['SECRET_'+'SYNTHETIC','service_'+'role','postgres'+'ql://example.test/db','Endpoint='+'sb://example.test','AZURE_'+'CLIENT_SECRET']) assert.equal(scanBundleText('prefix '+value).status,'FAIL'); assert.equal(scanBundleText('public configuration only').status,'PASS');});
test('gitleaks availability yields explicit status',()=>{assert.ok(['PASS','FAIL','BLOCKED_TOOL','INCONCLUSIVE'].includes(runGitleaks(['version'],process.cwd()).status));});
test('audit separates development-only, production and unknown packages',()=>{
 const report=JSON.stringify({vulnerabilities:{demo:{severity:'high',isDirect:true}},metadata:{vulnerabilities:{high:1}}});
 assert.equal(auditVerdict(report,1,{packages:{'node_modules/demo':{dev:true}}}).counts.dev.high,1);
 assert.equal(auditVerdict(report,1,{packages:{'node_modules/demo':{}}}).status,'FAIL');
 assert.equal(auditVerdict(report,1).status,'FAIL');
});
import { coverageCounts } from './security-controls.mjs';
test('manifest never counts blocked and skipped cases as local pass',()=>{
 const result=coverageCounts([{implementation_state:'DONE_LOCAL',execution_result:'PASS'},{implementation_state:'READY_FOR_INTEGRATION',execution_result:'BLOCKED_SB'},{implementation_state:'NEEDS_FIX',execution_result:'NOT_RUN'}]);
 assert.equal(result.total_cases,3);assert.equal(result.passed_local_cases,1);assert.equal(result.executed_local_cases,1);assert.equal(result.blocked_external_cases,1);assert.equal(result.unimplemented_cases,1);
});
test('moderate findings require a dated review plan',()=>{
 const report=JSON.stringify({vulnerabilities:{demo:{severity:'moderate',isDirect:true}},metadata:{vulnerabilities:{moderate:1}}});
 assert.equal(auditVerdict(report,1,{packages:{'node_modules/demo':{}}}).status,'INCONCLUSIVE');
});
