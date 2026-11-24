import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { assertSafeEvidenceText } from '../tests/h5/evidence-security.mjs';

const reportPath = 'test-results/h5/cache-cdp-summary.json';
const discoveryPath = 'test-results/h5/cache-cdp-discovery.json';
const observationPath = 'test-results/h5/cache-cdp-observation.json';
const docsSha = '40524e96c6973f84d74160076781702fe2a3da19';
const budgets = Object.freeze({ discoveryMs: 15_000, readinessMs: 15_000, executionMs: 25_000, overallMs: 45_000 });
const startedAt = Date.now();

const writeOutcome = async (status, reason, extra = {}) => {
  const report = { schemaVersion: 1, caseId: 'H5-CACHE-CDP', suite: 'CACHE_CDP', status, reason, docsSha,
    timestampUtc: new Date().toISOString(), evidenceLevel: 'L0', nodeVersion: process.version, ...extra };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  assertSafeEvidenceText(serialized);
  await writeFile(reportPath, serialized, 'utf8');
  const index = { schemaVersion: 1, artifact: 'cache-cdp-summary.json', sha256: createHash('sha256').update(Buffer.from(serialized, 'utf8')).digest('hex'), caseId: report.caseId, docsSha, timestampUtc: report.timestampUtc, status, evidenceLevel: 'L0' };
  const indexText = `${JSON.stringify(index, null, 2)}\n`;
  assertSafeEvidenceText(indexText);
  await writeFile(`${reportPath}.index.json`, indexText, 'utf8');
  return report;
};

const terminateProcessTree = child => {
  if (!child?.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  try { child.kill('SIGTERM'); } catch { /* Already exited. */ }
};

const runChild = async (args, env, timeoutMs, stage) => {
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true, env });
  let outputBytes = 0;
  let outputTail = '';
  let timedOut = false;
  const capture = chunk => { outputBytes += chunk.length; outputTail = `${outputTail}${chunk.toString('utf8')}`.slice(-4096); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  let timer;
  let code;
  try {
    code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
      timer = setTimeout(() => { timedOut = true; terminateProcessTree(child); }, timeoutMs);
    });
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) terminateProcessTree(child);
  }
  return { code, outputBytes, outputTail, timedOut, stage };
};

const main = async () => {
  await mkdir(dirname(reportPath), { recursive: true });
  for (const path of [reportPath, `${reportPath}.index.json`, discoveryPath, observationPath, `${observationPath}.index.json`]) {
    try { await unlink(path); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  if (!/^v22\./.test(process.version)) {
    const report = await writeOutcome('BLOCKED_DEPENDENCY', 'NODE_22_REQUIRED', { discovered: 0, executed: 0, serviceCalls: 0 });
    process.stdout.write(`H5 cache-CDP ${report.status}: Node 22 required; discovered=0; executed=0.\n`);
    process.exitCode = 2;
    return;
  }
  const discovery = await runChild(['node_modules/playwright/cli.js', 'test', '--config', 'playwright.h5-cache.config.ts', '--list', '--reporter=list'], process.env, budgets.discoveryMs, 'discovery');
  const match = /Total:\s*(\d+)\s+tests? in\s+\d+\s+files?/.exec(discovery.outputTail);
  const discovered = match ? Number(match[1]) : 0;
  if (discovery.code !== 0 || discovery.timedOut || discovered !== 1 || !/cache-cdp\.h5\.ts:/.test(discovery.outputTail)) {
    const report = await writeOutcome('FAIL', 'CACHE_CDP_DISCOVERY_FAILED_OR_EMPTY', { discovered, executed: 0, serviceCalls: 0, capturedSubprocessBytes: discovery.outputBytes });
    process.stdout.write(`H5 cache-CDP ${report.status}: expected the single CDP probe; discovered=${discovered}; executed=0.\n`);
    process.exitCode = 1;
    return;
  }
  const remaining = Math.max(1, budgets.overallMs - (Date.now() - startedAt));
  const run = await runChild(['node_modules/playwright/cli.js', 'test', '--config', 'playwright.h5-cache.config.ts'], {
    ...process.env, G6_H5_CACHE_READINESS_TIMEOUT_MS: String(budgets.readinessMs), G6_H5_EVIDENCE_SUMMARY_PATH: reportPath,
    G6_H5_CACHE_CDP_OBSERVATION_PATH: observationPath,
  }, Math.min(budgets.executionMs + budgets.readinessMs, remaining), 'execution');
  let summary = null;
  try { const content = await readFile(reportPath, 'utf8'); assertSafeEvidenceText(content); summary = JSON.parse(content); } catch { /* Missing/unsafe report is a failure. */ }
  let observation = null;
  let observationIndex = null;
  try {
    const bytes = await readFile(observationPath);
    const text = bytes.toString('utf8');
    assertSafeEvidenceText(text);
    observation = JSON.parse(text);
    const indexText = await readFile(`${observationPath}.index.json`, 'utf8');
    assertSafeEvidenceText(indexText);
    observationIndex = JSON.parse(indexText);
    if (observationIndex.sha256 !== createHash('sha256').update(bytes).digest('hex')) observation = null;
  } catch { /* Missing or rejected observation never counts as proof. */ }
  const observationValid = observation?.case_id === 'H5-CACHE-CDP' && observation?.status === 'PASS' && observation?.cold_network_reads > 0 && observation?.warm_cache_reads > 0 && observation?.disposable_server_requests_after_cold === 1 && observation?.disposable_server_requests_after_warm === 1;
  const passed = !run.timedOut && run.code === 0 && summary?.total === discovered && summary?.passed === discovered && summary?.skipped === 0 && summary?.failed === 0 && summary?.interrupted === 0 && summary?.timedOut === 0 && summary?.cases?.length === discovered && observationValid;
  const portDenied = /EACCES|EPERM|EADDRNOTAVAIL/i.test(run.outputTail);
  const status = passed ? 'PASS' : portDenied ? 'BLOCKED_DEPENDENCY' : 'FAIL';
  const reason = passed ? 'COLD_NETWORK_AND_WARM_CACHE_VERIFIED' : portDenied ? 'LOCAL_WEBSERVER_PORT_PERMISSION_DENIED' : run.timedOut ? 'CACHE_CDP_EXECUTION_TIMEOUT' : 'CACHE_CDP_PROBE_DID_NOT_PASS';
  const report = await writeOutcome(status, reason, { discovered, executed: summary?.total ?? 0, passed: summary?.passed ?? 0, failed: summary?.failed ?? 0, skipped: summary?.skipped ?? 0, interrupted: summary?.interrupted ?? 0, timedOut: (summary?.timedOut ?? 0) + (run.timedOut ? 1 : 0), serviceCalls: 0, coldNetworkReads: observation?.cold_network_reads ?? 0, warmCacheReads: observation?.warm_cache_reads ?? 0, disposableServerRequests: observation?.disposable_server_requests_after_warm ?? 0, observationSha256: observationIndex?.sha256 ?? 'NOT_AVAILABLE', capturedSubprocessBytes: discovery.outputBytes + run.outputBytes });
  process.stdout.write(`H5 cache-CDP ${report.status}: discovered=${report.discovered}; executed=${report.executed}; passed=${report.passed}; service_calls=0.\n`);
  if (!passed) process.exitCode = status === 'FAIL' ? 1 : 2;
};

main().catch(async () => {
  try { await mkdir(dirname(reportPath), { recursive: true }); await writeOutcome('FAIL', 'RUNNER_INTERNAL_ERROR', { discovered: 0, executed: 0 }); } catch { /* Avoid unsafe error output. */ }
  process.stdout.write('H5 cache-CDP FAIL: RUNNER_INTERNAL_ERROR.\n');
  process.exitCode = 1;
});
