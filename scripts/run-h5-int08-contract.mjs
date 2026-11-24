import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { assertSafeEvidenceText } from '../tests/h5/evidence-security.mjs';

const reportPath = 'test-results/h5/int08-contract-summary.json';
const discoveryPath = 'test-results/h5/int08-contract-discovery.json';
const docsSha = '40524e96c6973f84d74160076781702fe2a3da19';
const budgets = Object.freeze({ discoveryMs: 20_000, readinessMs: 15_000, executionMs: 110_000, overallMs: 150_000 });
const startedAt = Date.now();
let testPort;

const writeOutcome = async (status, reason, counts = {}) => {
  const report = {
    schemaVersion: 1, caseId: 'INT-08', suite: 'INT08_CONTRACT', status, reason, docsSha,
    timestampUtc: new Date().toISOString(), evidenceLevel: 'L0',
    nodeVersion: process.version,
    discovered: counts.discovered ?? 0, executed: counts.executed ?? 0, passed: counts.passed ?? 0,
    failed: counts.failed ?? 0, skipped: counts.skipped ?? 0, interrupted: counts.interrupted ?? 0,
    timedOut: counts.timedOut ?? 0, serviceCalls: 0,
    stage: counts.stage ?? 'not-started', capturedSubprocessBytes: counts.capturedSubprocessBytes ?? 0,
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  assertSafeEvidenceText(serialized);
  await writeFile(reportPath, serialized, 'utf8');
  const index = {
    schemaVersion: 1, artifact: 'int08-contract-summary.json',
    sha256: createHash('sha256').update(Buffer.from(serialized, 'utf8')).digest('hex'),
    caseId: report.caseId, docsSha, timestampUtc: report.timestampUtc, status, evidenceLevel: 'L0',
  };
  const indexText = `${JSON.stringify(index, null, 2)}\n`;
  assertSafeEvidenceText(indexText);
  await writeFile(`${reportPath}.index.json`, indexText, 'utf8');
  return report;
};

const allocateLoopbackPort = async () => {
  const server = createServer();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { server.close(() => {}); reject(new Error('LOCAL_LOOPBACK_TIMEOUT')); }, 3_000);
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.listen(0, '127.0.0.1', () => { clearTimeout(timer); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('LOCAL_LOOPBACK_ADDRESS_INVALID');
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
};

const terminateProcessTree = child => {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  }
  try { child.kill('SIGTERM'); } catch { /* Process already exited. */ }
};

const runPlaywright = async (summaryPath, args, timeoutMs, stage) => {
  try { await unlink(summaryPath); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const child = spawn(process.execPath, [
    'node_modules/playwright/cli.js', 'test', '--config', 'playwright.h5-int08-contract.config.ts', ...args,
  ], { stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true, env: {
    ...process.env, G6_H5_INT08_PORT: String(testPort), G6_H5_EVIDENCE_SUMMARY_PATH: summaryPath,
  } });
  let outputBytes = 0;
  let capturedTail = '';
  let timedOut = false;
  const capture = chunk => {
    outputBytes += chunk.length;
    // Keep subprocess output only in memory for safe category detection; never print or persist it.
    capturedTail = `${capturedTail}${chunk.toString('utf8')}`.slice(-4096);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  let timer;
  let exitCode;
  try {
    exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
      timer = setTimeout(() => { timedOut = true; terminateProcessTree(child); }, timeoutMs);
    });
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) terminateProcessTree(child);
  }
  let summary = null;
  try {
    const bytes = await readFile(summaryPath);
    const text = bytes.toString('utf8');
    assertSafeEvidenceText(text);
    summary = JSON.parse(text);
  } catch { /* Missing or rejected evidence is not a successful run. */ }
  return { exitCode, outputBytes, timedOut, capturedTail, summary, stage };
};

const main = async () => {
  await mkdir(dirname(reportPath), { recursive: true });
  for (const path of [reportPath, `${reportPath}.index.json`, discoveryPath]) {
    try { await unlink(path); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  if (!/^v22\./.test(process.version)) {
    const report = await writeOutcome('BLOCKED_DEPENDENCY', 'NODE_22_REQUIRED', { stage: 'preflight' });
    process.stdout.write(`INT08 contractual ${report.status}: Node 22 required; discovered=0; executed=0.\n`);
    process.exitCode = 2;
    return;
  }
  try {
    testPort = process.env.G6_H5_INT08_PORT ?? String(await allocateLoopbackPort());
  } catch {
    const report = await writeOutcome('BLOCKED_DEPENDENCY', 'LOCAL_LOOPBACK_UNAVAILABLE', { stage: 'preflight' });
    process.stdout.write(`INT08 contractual ${report.status}: local loopback unavailable; discovered=0; executed=0.\n`);
    process.exitCode = 2;
    return;
  }
  if (!/^\d{4,5}$/.test(testPort) || Number(testPort) < 1024 || Number(testPort) > 65535) {
    await writeOutcome('FAIL', 'INT08_TEST_PORT_INVALID', { stage: 'preflight' });
    process.stdout.write('INT08 contractual FAIL: test port invalid; discovered=0; executed=0.\n');
    process.exitCode = 1;
    return;
  }

  const discovery = await runPlaywright(discoveryPath, ['--list'], budgets.discoveryMs, 'discovery');
  const discovered = discovery.summary?.total ?? 0;
  if (discovery.timedOut || discovery.exitCode !== 0 || discovered < 1 || Date.now() - startedAt > budgets.overallMs) {
    const status = discovery.timedOut ? 'FAIL' : 'FAIL';
    const report = await writeOutcome(status, 'INT08_DISCOVERY_FAILED_OR_EMPTY', {
      discovered, stage: 'discovery', timedOut: discovery.timedOut ? 1 : 0, capturedSubprocessBytes: discovery.outputBytes,
    });
    process.stdout.write(`INT08 contractual ${report.status}: discovery failed or empty; discovered=${report.discovered}; executed=0.\n`);
    process.exitCode = 1;
    return;
  }

  // Playwright owns the Vite child and readiness probe; this is a bounded separate readiness limit.
  process.env.G6_H5_INT08_READINESS_TIMEOUT_MS = String(budgets.readinessMs);
  const remaining = Math.max(1, budgets.overallMs - (Date.now() - startedAt));
  const run = await runPlaywright(reportPath, [], Math.min(budgets.executionMs, remaining), 'execution');
  const summary = run.summary;
  const capturedSubprocessBytes = discovery.outputBytes + run.outputBytes;
  if (!summary) {
    const portPermission = /EACCES|EPERM|EADDRNOTAVAIL/i.test(run.capturedTail);
    const status = portPermission ? 'BLOCKED_DEPENDENCY' : 'FAIL';
    const reason = portPermission ? 'LOCAL_WEBSERVER_PORT_PERMISSION_DENIED' : run.timedOut ? 'INT08_EXECUTION_TIMEOUT' : 'PLAYWRIGHT_DID_NOT_WRITE_SAFE_SUMMARY';
    const report = await writeOutcome(status, reason, { discovered, stage: 'execution', timedOut: run.timedOut ? 1 : 0, capturedSubprocessBytes });
    process.stdout.write(`INT08 contractual ${report.status}: ${reason}; discovered=${report.discovered}; executed=0.\n`);
    process.exitCode = status === 'FAIL' ? 1 : 2;
    return;
  }
  const completed = summary.total === discovered && summary.passed === discovered && summary.skipped === 0 && summary.failed === 0 && summary.interrupted === 0 && summary.timedOut === 0;
  const passed = completed && run.exitCode === 0 && !run.timedOut;
  const report = await writeOutcome(passed ? 'PASS' : 'FAIL', passed ? 'ALL_DISCOVERED_CASES_EXECUTED' : 'DISCOVERED_CASES_NOT_ALL_PASSED', {
    discovered, executed: summary.total, passed: summary.passed, failed: summary.failed,
    skipped: summary.skipped, interrupted: summary.interrupted, timedOut: summary.timedOut + (run.timedOut ? 1 : 0),
    stage: 'execution', capturedSubprocessBytes,
  });
  process.stdout.write(`INT08 contractual ${report.status}: discovered=${report.discovered}; executed=${report.executed}; passed=${report.passed}; failed=${report.failed}; skipped=${report.skipped}.\n`);
  if (!passed) process.exitCode = 1;
};

main().catch(async () => {
  try { await mkdir(dirname(reportPath), { recursive: true }); await writeOutcome('FAIL', 'RUNNER_INTERNAL_ERROR', { stage: 'runner' }); } catch { /* Never emit an exception with environment data. */ }
  process.stdout.write('INT08 contractual FAIL: RUNNER_INTERNAL_ERROR.\n');
  process.exitCode = 1;
});
