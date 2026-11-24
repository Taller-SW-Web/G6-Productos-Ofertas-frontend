import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export function sarifVerdict(text, expectedSha, execution) {
  if (execution !== 'success') return { status: 'INCONCLUSIVE', reason: 'SCANNER_NOT_SUCCESSFUL' };
  let data; try { data = JSON.parse(text); } catch { return { status: 'INCONCLUSIVE', reason: 'INVALID_SARIF' }; }
  if (data.version !== '2.1.0' || !Array.isArray(data.runs) || !data.runs.length) return { status: 'INCONCLUSIVE', reason: 'INVALID_SARIF' };
  if (!data.runs.every(r => r?.versionControlProvenance?.some(p => p.revisionId === expectedSha) && Array.isArray(r.results))) return { status: 'INCONCLUSIVE', reason: 'HEAD_OR_RESULTS_MISSING' };
  return { status: data.runs.some(r => r.results.some(x => x.level === 'error')) ? 'FAIL' : 'PASS', reason: 'SARIF_CHECKED' };
}
export function auditVerdict(text, exitCode, lockfile) {
  let data; try { data = JSON.parse(text); } catch { return { status: 'INCONCLUSIVE', reason: 'AUDIT_INVALID_JSON' }; }
  if (!data || typeof data !== 'object' || data.error || !data.vulnerabilities || !data.metadata?.vulnerabilities) return { status: 'INCONCLUSIVE', reason: 'AUDIT_UNAVAILABLE' };
  if (![0, 1].includes(exitCode)) return { status: 'INCONCLUSIVE', reason: 'AUDIT_PROCESS_ERROR' };
  const empty = () => ({ high: 0, critical: 0, moderate: 0, low: 0, info: 0 });
  const counts = { production: empty(), dev: empty(), unknown: empty() };
  for (const [name, item] of Object.entries(data.vulnerabilities)) {
    if (!item || typeof item !== 'object' || !(item.severity in counts.unknown) || typeof item.isDirect !== 'boolean') return { status: 'INCONCLUSIVE', reason: 'AUDIT_SCHEMA_INVALID' };
    const matches = Object.entries(lockfile?.packages ?? {}).filter(([key]) => key === `node_modules/${name}` || key.endsWith(`/node_modules/${name}`));
    const scope = !matches.length ? 'unknown' : matches.some(([, value]) => value.dev !== true) ? 'production' : 'dev';
    counts[scope][item.severity]++;
  }
  const blocking = ['production', 'unknown'].some(scope => counts[scope].high || counts[scope].critical);
  const review = Object.values(counts).some(scope => scope.moderate);
  return { status: blocking ? 'FAIL' : review ? 'INCONCLUSIVE' : 'PASS', counts, reason: review ? 'MEDIUM_REQUIRES_PLAN' : 'AUDIT_CHECKED' };
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
