import test from 'node:test';
import assert from 'node:assert/strict';
import { sarifVerdict,auditVerdict,validateAllowlist,checkHeaders,scanBundleText,runGitleaks } from './security-controls.mjs';
const auditReport=(severity='high')=>({auditReportVersion:2,vulnerabilities:{demo:{name:'demo',severity,isDirect:true,via:['advisory'],range:'*',nodes:['node_modules/demo'],effects:[],fixAvailable:false}},metadata:{dependencies:{prod:1,dev:0,optional:0,peer:0,peerOptional:0,total:1},vulnerabilities:{info:0,low:0,moderate:Number(severity==='moderate'),high:Number(severity==='high'),critical:Number(severity==='critical'),total:1}}});
const sha='a'.repeat(40);
const sarif=JSON.stringify({version:'2.1.0',runs:[{results:[],versionControlProvenance:[{revisionId:sha}]}]});
test('SARIF missing, malformed, different SHA and cancelled never pass',()=>{for(const [s,h,x] of [['',sha,'success'],['{}',sha,'success'],[sarif,'b'.repeat(40),'success'],[sarif,sha,'cancelled']]) assert.notEqual(sarifVerdict(s,h,x).status,'PASS'); assert.equal(sarifVerdict(sarif,sha,'success').status,'PASS');});
test('audit error, empty, malformed and high are not pass',()=>{for(const x of ['', '{}', 'not json', JSON.stringify({error:{code:'ENET'}})]) assert.equal(auditVerdict(x,1).status,'INCONCLUSIVE'); const report=auditReport(); assert.equal(auditVerdict(JSON.stringify(report),1).status,'FAIL'); assert.equal(auditVerdict(JSON.stringify(report),2).status,'INCONCLUSIVE');});
test('expired and missing secret exceptions fail',()=>{assert.equal(validateAllowlist([{}]),false);assert.equal(validateAllowlist([{expires:'2001-01-01'}]),false);assert.equal(validateAllowlist([{expires:'2099-01-01'}]),true);});
test('missing CSP and wildcard CORS are explicit failures',()=>{assert.deepEqual(checkHeaders({'Access-Control-Allow-Origin':'*'}),{csp:'FAIL',cors:'FAIL_WILDCARD'});});
test('bundle detects synthetic privileged variables without printing them',()=>{for(const value of ['SECRET_'+'SYNTHETIC','service_'+'role','postgres'+'ql://example.test/db','Endpoint='+'sb://example.test','AZURE_'+'CLIENT_SECRET']) assert.equal(scanBundleText('prefix '+value).status,'FAIL'); assert.equal(scanBundleText('public configuration only').status,'PASS');});
test('gitleaks availability yields explicit status',()=>{assert.ok(['PASS','FAIL','BLOCKED_TOOL','INCONCLUSIVE'].includes(runGitleaks(['version'],process.cwd()).status));});
test('audit separates development-only, production and unknown packages',()=>{
 const report=JSON.stringify(auditReport());
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
 const report=JSON.stringify(auditReport('moderate'));
 assert.equal(auditVerdict(report,1,{packages:{'node_modules/demo':{}}}).status,'INCONCLUSIVE');
});

test('inconsistent, incomplete and partial npm audit reports cannot pass',()=>{
 const base=auditReport();
 for (const bad of [ {...base,metadata:{...base.metadata,vulnerabilities:{info:0,low:0,moderate:0,high:0,critical:0,total:0}}}, {...base,error:{code:'PARTIAL'}}, {...base,metadata:{}}, {...base,vulnerabilities:{demo:{severity:'high',isDirect:true}}}, {...base,auditReportVersion:1} ]) assert.notEqual(auditVerdict(JSON.stringify(bad),1).status,'PASS');
 assert.equal(auditVerdict(JSON.stringify({...base,vulnerabilities:{demo:{...base.vulnerabilities.demo,via:[{}]}}}),1).status,'INCONCLUSIVE');
 assert.equal(auditVerdict(JSON.stringify(base),1,{packages:[]}).status,'INCONCLUSIVE');
 const empty={auditReportVersion:2,vulnerabilities:{},metadata:{dependencies:{prod:0,dev:0,optional:0,peer:0,peerOptional:0,total:0},vulnerabilities:{info:0,low:0,moderate:0,high:0,critical:0,total:0}}};
 assert.equal(auditVerdict(JSON.stringify({...base,metadata:{...base.metadata,vulnerabilities:{info:0,low:0,moderate:0,high:0,critical:0,total:0}}}),1).reason,'AUDIT_INCONSISTENT');
 assert.equal(auditVerdict(JSON.stringify(empty),0).status,'PASS');
 assert.equal(auditVerdict(JSON.stringify(empty),1).status,'INCONCLUSIVE');
});
test('SARIF severity levels and numeric security severity cannot yield a false clean pass',()=>{
 const report=(result,rule)=>JSON.stringify({version:'2.1.0',runs:[{versionControlProvenance:[{revisionId:sha}],tool:{driver:{rules:rule?[rule]:[]}},results:[result]}]});
 for(const level of ['error']) assert.equal(sarifVerdict(report({level}),sha,'success').status,'FAIL');
 assert.equal(sarifVerdict(report({level:'warning'}),sha,'success').status,'INCONCLUSIVE');
 assert.equal(sarifVerdict(report({level:'note'}),sha,'success').status,'PASS');
 for(const score of ['7.0','9.8','10.0']) assert.equal(sarifVerdict(report({level:'note',properties:{'security-severity':score}}),sha,'success').status,'FAIL');
 for(const score of ['4.0','6.9']) assert.equal(sarifVerdict(report({level:'note',properties:{'security-severity':score}}),sha,'success').status,'INCONCLUSIVE');
 assert.equal(sarifVerdict(report({level:'note',properties:{'security-severity':'3.9'}}),sha,'success').status,'PASS');
 assert.equal(sarifVerdict(report({ruleId:'r',level:'note'},{id:'r',properties:{'security-severity':'8.1'}}),sha,'success').status,'FAIL');
 for(const value of ['NaN','11','',null]) assert.equal(sarifVerdict(report({level:'note',properties:{'security-severity':value}}),sha,'success').status,'INCONCLUSIVE');
});

import { historyVerdict } from './security-controls.mjs';
test('historical findings remain a blocking failure until formal resolution',()=>{
 assert.equal(historyVerdict('PASS',[{formal_review:'PENDING_VERA'}]).status,'FAIL');
 assert.equal(historyVerdict('BLOCKED_TOOL',[{formal_review:'PENDING_VERA'}]).status,'FAIL');
 assert.equal(historyVerdict('PASS',[{formal_review:'APPROVED_RESOLVED'}]).status,'PASS');
 assert.equal(historyVerdict('PASS',null).status,'INCONCLUSIVE');
});
