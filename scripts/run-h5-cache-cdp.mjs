import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { assertSafeEvidenceText } from '../tests/h5/evidence-security.mjs';

const reportPath = 'test-results/h5/cache-cdp-summary.json';
const discoveryPath = 'test-results/h5/cache-cdp-discovery.json';
const observationPath = 'test-results/h5/cache-cdp-observation.json';
const docsSha = 'c9e1e5c217616d28229fccf5315fb97a1ae061a9';
const budgets = Object.freeze({ discoveryMs: 15_000, readinessMs: 15_000, executionMs: 25_000, overallMs: 45_000 });
const startedAt = Date.now();
const sourceShaResult = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const sourceSha = sourceShaResult.status === 0 ? sourceShaResult.stdout.trim() : null;
const datasetBytes = await readFile('tests/fixtures/h5/catalog/manifest.json');
const dataset = JSON.parse(datasetBytes.toString('utf8'));
const datasetSha256 = createHash('sha256').update(datasetBytes).digest('hex');
const playwrightVersion = JSON.parse(await readFile('node_modules/@playwright/test/package.json', 'utf8')).version;
const command = 'node scripts/run-h5-cache-cdp.mjs';
const knownLimits = [
  'The probe establishes a cold network read and a warm browser-cache read only for a disposable localhost resource.',
  'It does not establish APIM, Gateway, G7, service-cache, production release, or real Catalog behavior.',
];

const writeOutcome = async (status, reason, extra = {}) => {
  const timestamp = new Date().toISOString();
  const report = {
    schema_version: 1, case_id: 'H5-CACHE-CDP', task_id: 'POM-A02', h5_criterion: 'H5-02',
    repository: 'Taller-SW-Web/G6-Productos-Ofertas-frontend', repo: 'Taller-SW-Web/G6-Productos-Ofertas-frontend', owner: 'Poma',
    source_sha: sourceSha, docs_sha: docsSha, timestamp_utc: timestamp, config_version: 'h5-cache-cdp-v2',
    dataset_seed: dataset.seed, dataset_checksum: datasetSha256,
    tool_versions: { node: process.version, playwright: playwrightVersion, chromium: extra.chromiumVersion ?? null },
    environment: { platform: process.platform, architecture: process.arch, network_scope: 'disposable localhost HTTP fixture only', external_service_calls: 0 },
    configuration: { config: 'playwright.h5-cache.config.ts', workers: 1, retries: 0, budgets_ms: budgets, screenshots: false, har: false, traces: false, video: false, service_workers: 'blocked' },
    test_command: command, artifact_uri: `${observationPath}; digest index: ${observationPath}.index.json`,
    implementation_state: 'DONE_A', execution_result: status, evidence_level: 'L0', status, reason,
    expected: { discovered: 1, executed: 1, passed: 1, failed: 0, skipped: 0, cold_network_reads: 1, warm_cache_reads: 1, external_service_calls: 0 },
    observed: { discovered: extra.discovered ?? 0, executed: extra.executed ?? 0, passed: extra.passed ?? 0, failed: extra.failed ?? 0, skipped: extra.skipped ?? 0, cold_network_reads: extra.coldNetworkReads ?? 0, warm_cache_reads: extra.warmCacheReads ?? 0, external_service_calls: extra.serviceCalls ?? 0 },
    negative_tests: ['A missing or duplicated Playwright case fails discovery.', 'A cold miss without the following cache hit fails the observation oracle.', 'No external service call is permitted or counted.'],
    known_limits: knownLimits,
    ...extra,
  };
  delete report.chromiumVersion;
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  assertSafeEvidenceText(serialized);
  await writeFile(reportPath, serialized, 'utf8');
  const index = { schema_version: 1, artifact: reportPath, sha256_artifact: createHash('sha256').update(Buffer.from(serialized, 'utf8')).digest('hex'), case_id: report.case_id, task_id: report.task_id, h5_criterion: report.h5_criterion, repository: report.repository, owner: report.owner, source_sha: sourceSha, docs_sha: docsSha, dataset_seed: dataset.seed, dataset_checksum: datasetSha256, timestamp_utc: timestamp, config_version: report.config_version, tool_versions: report.tool_versions, environment: report.environment, test_command: command, artifact_uri: report.artifact_uri, status, execution_result: status, evidence_level: report.evidence_level };
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
    G6_H5_CACHE_CDP_OBSERVATION_PATH: observationPath, G6_H5_SOURCE_SHA: sourceSha ?? '', G6_H5_DATASET_SHA: datasetSha256,
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
  const observationValid = observation?.case_id === 'H5-CACHE-CDP' && observation?.task_id === 'POM-A02' && observation?.h5_criterion === 'H5-02' && observation?.source_sha === sourceSha && observation?.docs_sha === docsSha && observation?.dataset_checksum === datasetSha256 && observation?.status === 'PASS' && observation?.cold_network_reads > 0 && observation?.warm_cache_reads > 0 && observation?.disposable_server_requests_after_cold === 1 && observation?.disposable_server_requests_after_warm === 1;
  const passed = !run.timedOut && run.code === 0 && summary?.total === discovered && summary?.passed === discovered && summary?.skipped === 0 && summary?.failed === 0 && summary?.interrupted === 0 && summary?.timedOut === 0 && summary?.cases?.length === discovered && observationValid;
  const portDenied = /EACCES|EPERM|EADDRNOTAVAIL/i.test(run.outputTail);
  const status = passed ? 'PASS' : portDenied ? 'BLOCKED_DEPENDENCY' : 'FAIL';
  const reason = passed ? 'COLD_NETWORK_AND_WARM_CACHE_VERIFIED' : portDenied ? 'LOCAL_WEBSERVER_PORT_PERMISSION_DENIED' : run.timedOut ? 'CACHE_CDP_EXECUTION_TIMEOUT' : 'CACHE_CDP_PROBE_DID_NOT_PASS';
  const report = await writeOutcome(status, reason, { discovered, executed: summary?.total ?? 0, passed: summary?.passed ?? 0, failed: summary?.failed ?? 0, skipped: summary?.skipped ?? 0, interrupted: summary?.interrupted ?? 0, timedOut: (summary?.timedOut ?? 0) + (run.timedOut ? 1 : 0), serviceCalls: 0, coldNetworkReads: observation?.cold_network_reads ?? 0, warmCacheReads: observation?.warm_cache_reads ?? 0, disposableServerRequests: observation?.disposable_server_requests_after_warm ?? 0, observationSha256: observationIndex?.sha256_artifact ?? 'NOT_AVAILABLE', capturedSubprocessBytes: discovery.outputBytes + run.outputBytes, chromiumVersion: observation?.chromium_version ?? null });
  process.stdout.write(`H5 cache-CDP ${report.status}: discovered=${report.discovered}; executed=${report.executed}; passed=${report.passed}; service_calls=0.\n`);
  if (!passed) process.exitCode = status === 'FAIL' ? 1 : 2;
};

main().catch(async () => {
  try { await mkdir(dirname(reportPath), { recursive: true }); await writeOutcome('FAIL', 'RUNNER_INTERNAL_ERROR', { discovered: 0, executed: 0 }); } catch { /* Avoid unsafe error output. */ }
  process.stdout.write('H5 cache-CDP FAIL: RUNNER_INTERNAL_ERROR.\n');
  process.exitCode = 1;
});
