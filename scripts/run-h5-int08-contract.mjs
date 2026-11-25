import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { assertSafeEvidenceText } from '../tests/h5/evidence-security.mjs';

const reportPath = 'test-results/h5/int08-contract-summary.json';
const discoveryPath = 'test-results/h5/int08-contract-discovery.json';
const docsSha = 'c9e1e5c217616d28229fccf5315fb97a1ae061a9';
const sourceSha = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).stdout.trim();
const manifestBytes = await readFile('tests/fixtures/h5/catalog/manifest.json');
const datasetSha = createHash('sha256').update(manifestBytes).digest('hex');
const playwrightVersion = JSON.parse(await readFile('node_modules/@playwright/test/package.json', 'utf8')).version;
const budgets = Object.freeze({ discoveryMs: 20_000, readinessMs: 15_000, executionMs: 110_000, overallMs: 150_000 });
const startedAt = Date.now();
let testPort;

const writeOutcome = async (status, reason, counts = {}) => {
  const report = {
    schema_version: 1, case_id: 'INT-08', task_id: 'POM-A02', h5_criterion: 'H5-02', suite: 'INT08_CONTRACT', status, reason,
    repository: 'Taller-SW-Web/G6-Productos-Ofertas-frontend', owner: 'Poma', source_sha: sourceSha, docs_sha: docsSha,
    timestamp_utc: new Date().toISOString(), evidence_level: 'L0',
    config_version: 'playwright-h5-int08-contract-v3',
    dataset_seed: 20261123, dataset_checksum: datasetSha,
    tool_versions: { node: process.version, playwright: playwrightVersion },
    environment: { platform: process.platform, architecture: process.arch, network_scope: 'synthetic route fixtures; local loopback only', service_calls: 0, browser: 'Chromium headless with downloads, traces, screenshots, video, HAR and service workers disabled' },
    configuration: { config: 'playwright.h5-int08-contract.config.ts', workers: 1, retries: 0, discovery_budget_ms: budgets.discoveryMs, readiness_budget_ms: budgets.readinessMs, execution_budget_ms: budgets.executionMs, overall_budget_ms: budgets.overallMs },
    test_command: 'node scripts/run-h5-int08-contract.mjs',
    expected: { discovered_equals_executed: true, skipped: 0, failed: 0, interrupted: 0, timed_out: 0, service_calls: 0 },
    observed: { discovered: counts.discovered ?? 0, executed: counts.executed ?? 0, passed: counts.passed ?? 0, failed: counts.failed ?? 0, skipped: counts.skipped ?? 0, interrupted: counts.interrupted ?? 0, timed_out: counts.timedOut ?? 0, service_calls: 0 },
    discovered: counts.discovered ?? 0, executed: counts.executed ?? 0, passed: counts.passed ?? 0,
    failed: counts.failed ?? 0, skipped: counts.skipped ?? 0, interrupted: counts.interrupted ?? 0,
    timedOut: counts.timedOut ?? 0, serviceCalls: 0,
    stage: counts.stage ?? 'not-started', captured_subprocess_bytes: counts.capturedSubprocessBytes ?? 0,
    artifact_uri: 'test-results/h5/int08-contract-summary.json; checksum is in the external .index.json',
    individual_results: counts.cases ?? [],
    negative_tests: (counts.cases ?? []).filter(item => /401|403|404|503|TIMEOUT|DENIED|MALFORMED|PRICE|STOCK|SKU/.test(item.scenario_id ?? '')).map(item => ({ scenario_id: item.scenario_id, status: item.status })),
    known_limits: ['L0 contractual mocks do not prove real provider participation.', 'No Azure, APIM, G7, shared Supabase or operational service was contacted.', 'L1 and L2 remain separate opt-in capabilities.'],
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  assertSafeEvidenceText(serialized);
  await writeFile(reportPath, serialized, 'utf8');
  const index = {
    schema_version: 1, artifact: 'int08-contract-summary.json',
    sha256: createHash('sha256').update(Buffer.from(serialized, 'utf8')).digest('hex'),
    source_sha: sourceSha, docs_sha: docsSha, dataset_checksum: datasetSha, case_id: report.case_id, task_id: report.task_id,
    h5_criterion: report.h5_criterion, timestamp_utc: report.timestamp_utc, status, evidence_level: 'L0',
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
    stage: 'execution', capturedSubprocessBytes, cases: summary.cases,
  });
  process.stdout.write(`INT08 contractual ${report.status}: discovered=${report.discovered}; executed=${report.executed}; passed=${report.passed}; failed=${report.failed}; skipped=${report.skipped}.\n`);
  if (!passed) process.exitCode = 1;
};

main().catch(async () => {
  try { await mkdir(dirname(reportPath), { recursive: true }); await writeOutcome('FAIL', 'RUNNER_INTERNAL_ERROR', { stage: 'runner' }); } catch { /* Never emit an exception with environment data. */ }
  process.stdout.write('INT08 contractual FAIL: RUNNER_INTERNAL_ERROR.\n');
  process.exitCode = 1;
});
