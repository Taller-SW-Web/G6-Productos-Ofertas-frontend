import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export function sarifVerdict(text, expectedSha, execution) {
  if (execution !== 'success') return { status:'INCONCLUSIVE', reason:'SCANNER_NOT_SUCCESSFUL' };
  let data; try { data=JSON.parse(text); } catch { return { status:'INCONCLUSIVE', reason:'INVALID_SARIF' }; }
  if (!data || data.version!=='2.1.0' || !Array.isArray(data.runs) || !data.runs.length || !/^[a-f0-9]{40}$/i.test(expectedSha ?? '')) return { status:'INCONCLUSIVE', reason:'INVALID_SARIF' };
  let high=false, medium=false, invalid=false;
  for (const run of data.runs) {
    if (!run || !Array.isArray(run.results) || !Array.isArray(run.versionControlProvenance) || !run.versionControlProvenance.some(p=>p?.revisionId===expectedSha)) { invalid=true; continue; }
    const rules=run.tool?.driver?.rules;
    if (rules !== undefined && !Array.isArray(rules)) { invalid=true; continue; }
    for (const result of run.results) {
      if (!result || typeof result!=='object' || Array.isArray(result)) { invalid=true; continue; }
      const rule=Array.isArray(rules) ? (typeof result.ruleId==='string' ? rules.find(r=>r?.id===result.ruleId) : Number.isInteger(result.ruleIndex) ? rules[result.ruleIndex] : undefined) : undefined;
      const level=result.level ?? rule?.defaultConfiguration?.level ?? 'warning';
      if (!['error','warning','note','none'].includes(level)) invalid=true;
      else if (level==='error') high=true;
      else if (level==='warning') medium=true;
      for (const value of [result.properties?.['security-severity'],rule?.properties?.['security-severity']]) {
        if (value===undefined) continue;
        if ((typeof value!=='string' && typeof value!=='number') || String(value).trim()==='' || !/^(?:10(?:\.0+)?|[0-9](?:\.[0-9]+)?)$/.test(String(value).trim())) { invalid=true; continue; }
        const score=Number(value);
        if (score>=7) high=true; else if (score>=4) medium=true;
      }
    }
  }
  if (high) return {status:'FAIL',reason:'HIGH_OR_CRITICAL_FINDING'};
  if (invalid) return {status:'INCONCLUSIVE',reason:'INVALID_SARIF_OR_HEAD'};
  if (medium) return {status:'INCONCLUSIVE',reason:'MEDIUM_REQUIRES_PLAN'};
  return {status:'PASS',reason:'SARIF_CHECKED'};
}
export function auditVerdict(text, exitCode, lockfile) {
  let data; try { data=JSON.parse(text); } catch { return {status:'INCONCLUSIVE',reason:'AUDIT_INVALID_JSON'}; }
  const object = x => x && typeof x==='object' && !Array.isArray(x);
  if (!object(data) || data.auditReportVersion!==2 || data.error || !object(data.vulnerabilities) || !object(data.metadata) || !object(data.metadata.vulnerabilities) || ![0,1].includes(exitCode)) return {status:'INCONCLUSIVE',reason:'AUDIT_UNAVAILABLE'};
  if (lockfile !== undefined && (!object(lockfile) || !object(lockfile.packages))) return {status:'INCONCLUSIVE',reason:'LOCKFILE_SCHEMA_INVALID'};
  const severities=['info','low','moderate','high','critical'];
  const dependencies=data.metadata.dependencies;
  if (!object(dependencies) || !['prod','dev','optional','peer','peerOptional','total'].every(k=>Number.isSafeInteger(dependencies[k]) && dependencies[k]>=0)) return {status:'INCONCLUSIVE',reason:'AUDIT_INVALID_DEPENDENCIES'};
  const meta=data.metadata.vulnerabilities;
  if (![...severities,'total'].every(k=>Number.isSafeInteger(meta[k]) && meta[k]>=0)) return {status:'INCONCLUSIVE',reason:'AUDIT_INVALID_METADATA'};
  const counts=Object.fromEntries(['production','dev','unknown'].map(scope=>[scope,Object.fromEntries(severities.map(k=>[k,0]))]));
  const actual=Object.fromEntries(severities.map(k=>[k,0]));
  for (const [name,item] of Object.entries(data.vulnerabilities)) {
    if (!object(item) || item.name!==name || !severities.includes(item.severity) || typeof item.isDirect!=='boolean' || !Array.isArray(item.via) || !item.via.length || typeof item.range!=='string' || !Array.isArray(item.nodes) || !Array.isArray(item.effects) || !('fixAvailable' in item)) return {status:'INCONCLUSIVE',reason:'AUDIT_SCHEMA_INVALID'};
    if (!item.name || !item.range || item.via.some(v=>typeof v==='string' ? !v : !object(v) || typeof v.name!=='string' || !severities.includes(v.severity)) || item.nodes.some(v=>typeof v!=='string') || item.effects.some(v=>typeof v!=='string') || (typeof item.fixAvailable!=='boolean' && !object(item.fixAvailable))) return {status:'INCONCLUSIVE',reason:'AUDIT_SCHEMA_INVALID'};
    actual[item.severity]++;
    const matches=Object.entries(lockfile?.packages ?? {}).filter(([key])=>key===`node_modules/${name}` || key.endsWith(`/node_modules/${name}`));
    const scope=!matches.length?'unknown':matches.some(([,value])=>value.dev!==true)?'production':'dev';
    counts[scope][item.severity]++;
  }
  const total=severities.reduce((n,k)=>n+actual[k],0);
  if ((total>0 && dependencies.total===0) || meta.total!==total || severities.some(k=>meta[k]!==actual[k]) || (exitCode===0 && (actual.high || actual.critical)) || (exitCode===1 && total===0)) return {status:'INCONCLUSIVE',reason:'AUDIT_INCONSISTENT'};
  const blocking=['production','unknown'].some(scope=>counts[scope].high || counts[scope].critical);
  const review=Object.values(counts).some(scope=>scope.moderate);
  return {status:blocking?'FAIL':review?'INCONCLUSIVE':'PASS',counts,reason:review?'MEDIUM_REQUIRES_PLAN':'AUDIT_CHECKED'};
}
export function validateAllowlist(entries, now = new Date()) {
  return entries.every(e => typeof e.expires === 'string' && /^\d{4}-\d\d-\d\d$/.test(e.expires) && Number.isFinite(Date.parse(e.expires)) && Date.parse(e.expires+'T23:59:59Z') >= now.getTime());
}
export function checkHeaders(headers, requiredCsp = true) {
  const h = Object.fromEntries(Object.entries(headers).map(([k,v]) => [k.toLowerCase(), String(v)]));
  return { csp: h['content-security-policy'] ? 'OBSERVED' : requiredCsp ? 'FAIL' : 'NOT_RUN', cors: h['access-control-allow-origin'] === '*' ? 'FAIL_WILDCARD' : h['access-control-allow-origin'] ? 'OBSERVED' : 'NOT_PRESENT' };
}
export function scanBundleText(text, forbiddenValues = []) {
  const patterns = [/postgres(?:ql)?:\/\//i, /[a-z0-9.-]+\.postgres\.database\.azure\.com/i, /[a-z0-9.-]+\.servicebus\.windows\.net/i, /[a-z0-9.-]+\.supabase\.co/i, /(?:Endpoint=sb:\/\/|SharedAccessKey=|AccountKey=)/i, /service_role/i, /\bAZURE_(?:CLIENT_SECRET|STORAGE_KEY|SERVICE_BUS_CONNECTION_STRING)\b/i, /\bSECRET_[A-Z0-9_]+\b/, /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/];
  return { status: patterns.some(p => p.test(text)) || forbiddenValues.some(v => v && text.includes(v)) ? 'FAIL' : 'PASS' };
}
export function scanBundle(path, forbiddenValues = []) {
  const stack = [path]; let count = 0; const hash = createHash('sha256');
  try { while (stack.length) { const p=stack.pop(); const stat=statSync(p); if (stat.isDirectory()) { for (const f of readdirSync(p).sort()) stack.push(join(p,f)); continue; } if (!/\.(js|html|css|json)$/.test(p)) continue; const data=readFileSync(p); count++; hash.update(data); if (scanBundleText(data.toString('utf8'),forbiddenValues).status === 'FAIL') return { status:'FAIL', files:count }; } } catch { return { status:'INCONCLUSIVE', reason:'BUNDLE_UNREADABLE' }; }
  return count ? { status:'PASS', files:count, sha256:hash.digest('hex') } : { status:'INCONCLUSIVE', reason:'BUNDLE_EMPTY' };
}
export function runGitleaks(args, cwd, input) {
  const result = spawnSync('gitleaks', args, { cwd, input, encoding:'utf8', windowsHide:true, maxBuffer:16*1024*1024 });
  if (result.error?.code === 'ENOENT') return { status:'BLOCKED_TOOL', tool:'gitleaks' };
  if (result.error || result.signal || ![0,42].includes(result.status)) return { status:'INCONCLUSIVE', tool:'gitleaks' };
  return { status:result.status === 0 ? 'PASS' : 'FAIL', tool:'gitleaks' };
}

export function coverageCounts(cases) {
  return { total_cases:cases.length, implemented_cases:cases.filter(c=>c.implementation_state==='DONE_LOCAL').length,
    executed_local_cases:cases.filter(c=>['PASS','FAIL','INCONCLUSIVE'].includes(c.execution_result)).length,
    passed_local_cases:cases.filter(c=>c.execution_result==='PASS').length,
    blocked_external_cases:cases.filter(c=>c.execution_result.startsWith('BLOCKED_')).length,
    failed_cases:cases.filter(c=>c.execution_result==='FAIL').length,
    unimplemented_cases:cases.filter(c=>['BLOCKED_DEPENDENCY','NEEDS_FIX'].includes(c.implementation_state)).length };
}

export function historyVerdict(scannerStatus, findings) {
  if (!Array.isArray(findings) || !findings.length) return {status:'INCONCLUSIVE',reason:'HISTORY_REVIEW_INVALID'};
  if (findings.some(f=>f?.formal_review!=='APPROVED_RESOLVED')) return {status:'FAIL',reason:'HISTORY_REVIEW_PENDING'};
  return {status:scannerStatus,reason:'SCANNER_RESULT'};
}
