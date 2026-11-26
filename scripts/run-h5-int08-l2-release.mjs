import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { assertSafeEvidenceText } from '../tests/h5/evidence-security.mjs';
import { preflightInt08L2 } from '../tests/h5/int08-l2-policy.mjs';

const docsSha = 'c9e1e5c217616d28229fccf5315fb97a1ae061a9';
const sourceSha = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).stdout.trim();
const reportPath = resolve('test-results/h5/int08-l2-release-summary.json');
const indexPath = `${reportPath}.index.json`;
const explicitExecute = process.argv.length === 3 && process.argv[2] === '--execute';
const validSha = value => /^[a-f0-9]{40}$/i.test(value ?? '');
const safeEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE'].includes(key) || key.startsWith('G6_H5_INT08_L2_')));
const writeReport = async report => {
  const completeReport = {
    ...report,
    execution_result: report.status,
    observed: report.observed ?? { discovered: report.discovered ?? 0, executed: report.executed ?? 0, passed: report.passed ?? 0, failed: report.failed ?? 0, skipped: report.skipped ?? 0, service_calls: report.service_calls ?? 0, writes: report.writes ?? 0 },
  };
  const bytes = Buffer.from(`${JSON.stringify(completeReport, null, 2)}\n`, 'utf8');
  assertSafeEvidenceText(bytes.toString('utf8'));
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, bytes);
  const index = { schema_version: 1, artifact: completeReport.artifact_uri, sha256_artifact: createHash('sha256').update(bytes).digest('hex'), case_id: completeReport.case_id, task_id: completeReport.task_id, h5_criterion: completeReport.h5_criterion, repository: completeReport.repository, owner: completeReport.owner, source_sha: sourceSha, docs_sha: docsSha, timestamp_utc: completeReport.timestamp_utc, config_version: completeReport.config_version, dataset_seed: completeReport.dataset_seed, dataset_checksum: completeReport.dataset_checksum, tool_versions: completeReport.tool_versions, environment: completeReport.environment, test_command: completeReport.test_command, artifact_uri: completeReport.artifact_uri, status: completeReport.status, execution_result: completeReport.execution_result, evidence_level: completeReport.evidence_level };
  const indexBytes = Buffer.from(`${JSON.stringify(index, null, 2)}\n`, 'utf8');
  assertSafeEvidenceText(indexBytes.toString('utf8'));
  await writeFile(indexPath, indexBytes);
};
const runChild = (args, timeoutMs, extraEnv = {}) => new Promise(resolveRun => {
  const child = spawn(process.execPath, ['node_modules/playwright/cli.js', ...args], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...safeEnv, ...extraEnv } });
  let bytes = 0;
  let tail = '';
  let timedOut = false;
  const capture = chunk => { bytes += chunk.length; tail = `${tail}${chunk.toString('utf8')}`.slice(-8192); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  const timer = setTimeout(() => {
    timedOut = true;
    if (process.platform === 'win32' && child.pid) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    try { child.kill('SIGTERM'); } catch { /* already closed */ }
  }, timeoutMs);
  child.once('error', () => { clearTimeout(timer); resolveRun({ code: -1, bytes, tail, timedOut: false }); });
  child.once('close', code => { clearTimeout(timer); resolveRun({ code, bytes, tail, timedOut }); });
});

let datasetSha = null;
try { datasetSha = createHash('sha256').update(await readFile('tests/fixtures/h5/catalog/manifest.json')).digest('hex'); } catch { /* Report missing dataset as null. */ }
const preflight = await preflightInt08L2(process.env);
const base = {
  schema_version: 1, case_id: 'INT-08-L2', task_id: 'POM-A02', h5_criterion: 'H5-02',
  repository: 'Taller-SW-Web/G6-Productos-Ofertas-frontend', repo: 'Taller-SW-Web/G6-Productos-Ofertas-frontend', owner: 'Poma', source_sha: validSha(sourceSha) ? sourceSha : null,
  docs_sha: docsSha, timestamp_utc: new Date().toISOString(), config_version: 'h5-int08-l2-opt-in-v1',
  dataset_seed: 20261123, dataset_checksum: datasetSha,
  tool_versions: { node: process.version, playwright: JSON.parse(await readFile('node_modules/@playwright/test/package.json', 'utf8')).version },
  environment: { platform: process.platform, architecture: process.arch, network_scope: 'approved preview, G7 and APIM hosts only', service_calls: 0 },
  configuration: { config: 'playwright.h5-int08-l2-release.config.ts', workers: 1, retries: 0, screenshots: false, traces: false, video: false, service_workers: 'blocked', explicit_execute_required: true },
  test_command: 'node scripts/run-h5-int08-l2-release.mjs', artifact_uri: 'test-results/h5/int08-l2-release-summary.json; digest index: test-results/h5/int08-l2-release-summary.json.index.json',
  approved_hosts_sha256: preflight.metadata.approvedHostsSha256,
  release_sha: preflight.metadata.releaseSha, gateway_sha: preflight.metadata.gatewaySha, service_sha: preflight.metadata.serviceSha,
  implementation_state: 'DONE_A', execution_result: 'WAIT_C_G7_APIM', evidence_level: 'L2', service_calls: 0, writes: 0,
  expected: { explicit_execute_required: true, approved_release_required: true, service_calls_without_authorized_execution: 0, authorized_and_denied_scenarios: 2 },
  negative_tests: ['Default mode performs no Playwright execution or service request.', 'Unapproved environment, hosts, or hashes block the release journey before external calls.', 'The HTTP 202 preparation response is admission only and requires bounded terminal polling.'],
  known_limits: ['No real G7/APIM release was executed in this validation.', 'The scenario does not certify a release, deployment, provider availability, or authorization grant.'],
  blocker_owner: 'G7/APIM release and identity owners',
};

if (!explicitExecute) {
  await writeReport({ ...base, status: 'WAIT_C_G7_APIM', execution_result: 'WAIT_C_G7_APIM', reason: 'L2_REQUIRES_EXPLICIT_EXECUTE_AND_RELEASE_APPROVAL', missing: preflight.missing, discovered: 0, executed: 0, passed: 0, failed: 0, skipped: 0, observed: { discovered: 0, executed: 0, passed: 0, failed: 0, skipped: 0, service_calls: 0, writes: 0 }, artifact_status: 'NO_REAL_CALLS' });
  process.stdout.write('INT-08 L2 WAIT_C_G7_APIM: rerun only with --execute and an approved release harness; service_calls=0.\n');
  process.exitCode = 2;
} else if (preflight.status !== 'READY_C') {
  await writeReport({ ...base, status: 'BLOCKED_DEPENDENCY', reason: 'L2_RELEASE_PREFLIGHT_INCOMPLETE', missing: preflight.missing, discovered: 0, executed: 0, passed: 0, failed: 0, skipped: 0, artifact_status: 'NO_REAL_CALLS' });
  process.stdout.write(`INT-08 L2 BLOCKED_DEPENDENCY: preflight=${preflight.missing.length}; service_calls=0.\n`);
  process.exitCode = 2;
} else if (!validSha(sourceSha)) {
  await writeReport({ ...base, status: 'FAIL', reason: 'SOURCE_SHA_INVALID', discovered: 0, executed: 0, passed: 0, failed: 0, skipped: 0, artifact_status: 'NO_REAL_CALLS' });
  process.stdout.write('INT-08 L2 FAIL: source SHA invalid; service_calls=0.\n');
  process.exitCode = 1;
} else {
  const config = 'playwright.h5-int08-l2-release.config.ts';
  const summaryPath = resolve('test-results/h5/int08-l2-release-playwright-summary.json');
  try { await unlink(summaryPath); } catch { /* no prior run required */ }
  const discovery = await runChild(['test', '--config', config, '--list', '--reporter=list'], 45_000);
  const discovered = Number(/Total:\s*(\d+)\s+tests? in/.exec(discovery.tail)?.[1] ?? 0);
  const expectedDiscovery = /int08\.l2-release\.pw\.ts:.*INT08-L2-AUTHORIZED/.test(discovery.tail) && /int08\.l2-release\.pw\.ts:.*INT08-L2-DENIED/.test(discovery.tail);
  if (discovery.code !== 0 || discovery.timedOut || discovered !== 2 || !expectedDiscovery) {
    await writeReport({ ...base, status: 'FAIL', reason: 'L2_DISCOVERY_FAILED', discovered, executed: 0, passed: 0, failed: 0, skipped: 0, captured_subprocess_bytes: discovery.bytes, artifact_status: 'SAFE_FAILURE' });
    process.stdout.write('INT-08 L2 FAIL: discovery command failed; service_calls=0.\n');
    process.exitCode = 1;
  } else {
    const execution = await runChild(['test', '--config', config, '--reporter=./tests/h5/safe-reporter.mjs'], 300_000, { G6_H5_EVIDENCE_SUMMARY_PATH: summaryPath });
    let summary = null;
    try { const bytes = await readFile(summaryPath); assertSafeEvidenceText(bytes.toString('utf8')); summary = JSON.parse(bytes); } catch { /* absent safe summary fails closed */ }
    const executed = Number(summary?.total ?? 0);
    const passed = execution.code === 0 && !execution.timedOut && executed === 2 && summary?.passed === 2 && summary?.failed === 0 && summary?.skipped === 0 && summary?.interrupted === 0 && summary?.timedOut === 0;
    await writeReport({ ...base, status: passed ? 'PASS' : 'FAIL', reason: passed ? 'AUTHORIZED_AND_DENIED_RELEASE_SCENARIOS_COMPLETED' : 'L2_RELEASE_SCENARIOS_NOT_ALL_PASSED', discovered: 2, executed, passed: summary?.passed ?? 0, failed: summary?.failed ?? 0, skipped: summary?.skipped ?? 0, interrupted: summary?.interrupted ?? 0, timed_out: summary?.timedOut ?? 0, service_calls: 'approved APIM only', writes: 'one registered disposable product preparation', captured_subprocess_bytes: discovery.bytes + execution.bytes, artifact_status: 'SAFE_REPORTER_ONLY' });
    process.stdout.write(`INT-08 L2 ${passed ? 'PASS' : 'FAIL'}: discovered=2; executed=${executed}; skipped=${summary?.skipped ?? 0}; sensitive_capture=disabled.\n`);
    if (!passed) process.exitCode = 1;
  }
}
