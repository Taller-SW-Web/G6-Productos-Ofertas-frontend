import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertSafeEvidenceText } from '../tests/h5/evidence-security.mjs';
import { cleanupRegisteredMutationResources, preflightPerf06Mutation } from '../tests/h5/perf06-mutation-plan.mjs';

const outputPath = resolve('test-results/h5/perf06-mutation-summary.json');
const docsSha = 'c9e1e5c217616d28229fccf5315fb97a1ae061a9';
const isContract = process.argv.includes('--contract');
const commandArgs = process.argv.slice(2).filter(argument => argument !== '--contract');
const sourceSha = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).stdout.trim();
const datasetBytes = await readFile('tests/fixtures/h5/catalog/manifest.json');
const datasetSha = createHash('sha256').update(datasetBytes).digest('hex');
const toolVersions = { node: process.version, playwright: JSON.parse(await readFile('node_modules/@playwright/test/package.json', 'utf8')).version };

const writeIndexedReport = async report => {
  const completeReport = {
    ...report,
    implementation_state: 'DONE_A',
    execution_result: report.status,
    environment: { platform: process.platform, architecture: process.arch, network_scope: isContract ? 'synthetic browser route fixture only' : 'authorized disposable loopback only', external_service_calls: report.service_calls ?? 0 },
    configuration: { config: isContract ? 'playwright.h5-perf06-mutation-contract.config.ts' : 'playwright.h5-perf06-mutation-real.config.ts', workers: 1, retries: 0, screenshots: false, traces: false, video: false, service_workers: 'blocked' },
    expected: report.expected ?? (isContract
      ? { discovered: 1, executed: 1, passed: 1, failed: 0, skipped: 0, external_service_calls: 0, http_202_is_nonterminal: true, cleanup_idempotent: true }
      : { only_registered_disposable_resources_mutated: true, external_service_calls: 0, polling_terminal_required: true, cleanup_idempotent: true }),
    observed: report.observed ?? { status: report.status, discovered: report.discovered ?? 0, executed: report.executed ?? 0, passed: report.passed ?? 0, failed: report.failed ?? 0, skipped: report.skipped ?? 0, service_calls: report.service_calls ?? 0, writes: report.writes ?? 0, cleanup: report.cleanup ?? 'NOT_STARTED' },
    negative_tests: report.negative_tests ?? ['HTTP 202 is never terminal.', 'Polling timeout and nonterminal/malformed states are rejected.', 'Cleanup refuses unregistered resources and is idempotent.', 'Absent authorized harness blocks before external calls or writes.'],
    known_limits: report.known_limits ?? (isContract
      ? ['Synthetic route fixture proves the UI sequence and harness cleanup only; it is not service integration or a performance measurement.']
      : ['Real execution requires an owner-authorized isolated loopback harness, independent identities, and disposable products.']),
    artifact_uri: report.artifact_uri ?? 'test-results/h5/perf06-mutation-summary.json; digest index: test-results/h5/perf06-mutation-summary.json.index.json',
  };
  const bytes = Buffer.from(`${JSON.stringify(completeReport, null, 2)}\n`, 'utf8');
  assertSafeEvidenceText(bytes.toString('utf8'));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);
  const index = { schema_version: 1, artifact: completeReport.artifact_uri, sha256_artifact: createHash('sha256').update(bytes).digest('hex'), case_id: completeReport.case_id, task_id: completeReport.task_id, h5_criterion: completeReport.h5_criterion, repository: completeReport.repository, owner: completeReport.owner, source_sha: sourceSha, docs_sha: docsSha, timestamp_utc: completeReport.timestamp_utc, config_version: completeReport.config_version, dataset_seed: completeReport.dataset_seed, dataset_checksum: completeReport.dataset_checksum, tool_versions: toolVersions, environment: completeReport.environment, test_command: completeReport.test_command, artifact_uri: completeReport.artifact_uri, status: completeReport.status, execution_result: completeReport.execution_result, evidence_level: completeReport.evidence_level };
  const indexBytes = Buffer.from(`${JSON.stringify(index, null, 2)}\n`, 'utf8');
  assertSafeEvidenceText(indexBytes.toString('utf8'));
  await writeFile(`${outputPath}.index.json`, indexBytes);
};

const runChild = (args, env, timeoutMs = 150_000) => new Promise((resolvePromise, reject) => {
  const child = spawn(process.execPath, ['node_modules/playwright/cli.js', ...args], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env });
  let bytes = 0;
  let tail = '';
  const capture = chunk => { bytes += chunk.length; tail = `${tail}${chunk.toString('utf8')}`.slice(-4096); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    if (process.platform === 'win32' && child.pid) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    try { child.kill('SIGTERM'); } catch { /* Already exited. */ }
  }, timeoutMs);
  child.once('error', error => { clearTimeout(timer); reject(error); });
  child.once('close', code => { clearTimeout(timer); resolvePromise({ code, bytes, tail, timedOut }); });
});

const baseReport = {
  schema_version: 1,
  case_id: 'PERF06_MUTATION',
  task_id: isContract ? 'POM-A05' : 'POM-A04',
  h5_criterion: 'H5-03',
  repository: 'Taller-SW-Web/G6-Productos-Ofertas-frontend',
  owner: 'Poma',
  source_sha: sourceSha,
  docs_sha: docsSha,
  timestamp_utc: new Date().toISOString(),
  config_version: 'h5-perf06-mutation-v2',
  dataset_seed: 20261123,
  dataset_checksum: datasetSha,
  tool_versions: toolVersions,
  test_command: isContract ? 'node scripts/run-h5-perf06-mutation.mjs --contract' : 'node scripts/run-h5-perf06-mutation.mjs',
};

if (commandArgs.length) {
  process.stdout.write('PERF06_MUTATION FAIL: INVALID_RUNNER_ARGUMENT.\n');
  process.exitCode = 1;
} else if (!/^v22\./.test(process.version)) {
  await writeIndexedReport({ ...baseReport, status: 'BLOCKED_DEPENDENCY', reason: 'NODE_22_REQUIRED', evidence_level: isContract ? 'L0_CONTRACT' : 'L1', service_calls: 0, writes: 0 });
  process.stdout.write('PERF06_MUTATION BLOCKED_DEPENDENCY: NODE_22_REQUIRED; no browser run.\n');
  process.exitCode = 2;
} else if (isContract) {
  const config = 'playwright.h5-perf06-mutation-contract.config.ts';
  const discovery = await runChild(['test', '--config', config, '--list', '--reporter=list'], process.env, 30_000);
  const discovered = Number(/Total:\s*(\d+)\s+tests? in/.exec(discovery.tail)?.[1] ?? 0);
  const fileDiscovered = /perf06-mutation\.pw\.ts:/.test(discovery.tail);
  if (discovery.code !== 0 || discovery.timedOut || discovered !== 1 || !fileDiscovered) {
    await writeIndexedReport({ ...baseReport, status: 'FAIL', reason: 'CONTRACT_DISCOVERY_FAILED_OR_EMPTY', evidence_level: 'L0_CONTRACT', discovered, executed: 0, passed: 0, failed: 0, skipped: 0, service_calls: 0, writes: 0 });
    process.stdout.write(`PERF06_MUTATION contract FAIL: expected 1 discovered case, observed ${discovered}; executed=0.\n`);
    process.exitCode = 1;
  } else {
    const innerPath = resolve('test-results/h5/perf06-mutation-inner-summary.json');
    const execution = await runChild(['test', '--config', config], { ...process.env, G6_H5_EVIDENCE_SUMMARY_PATH: innerPath }, 90_000);
    let summary = null;
    try { const bytes = await readFile(innerPath); assertSafeEvidenceText(bytes.toString('utf8')); summary = JSON.parse(bytes); } catch { /* Missing/rejected evidence fails closed. */ }
    const passed = execution.code === 0 && !execution.timedOut && summary?.total === discovered && summary?.passed === discovered && summary?.failed === 0 && summary?.skipped === 0 && summary?.interrupted === 0 && summary?.timedOut === 0;
    const report = { ...baseReport, status: passed ? 'PASS' : 'FAIL', reason: passed ? 'UI_JOURNEY_AND_FINALLY_CLEANUP_VERIFIED_WITH_SYNTHETIC_ROUTE_FIXTURE' : 'CONTRACT_JOURNEY_OR_CLEANUP_FAILED', evidence_level: 'L0_CONTRACT', discovered, executed: summary?.total ?? 0, passed: summary?.passed ?? 0, failed: summary?.failed ?? 0, skipped: summary?.skipped ?? 0, timed_out: summary?.timedOut ?? 0, service_calls: 0, simulated_route_calls: 'captured only by UI test; no external service', writes: 1, cleanup: 'synthetic registered resource removed idempotently in finally', captured_subprocess_bytes: discovery.bytes + execution.bytes };
    await writeIndexedReport(report);
    process.stdout.write(`PERF06_MUTATION contract ${report.status}: discovered=${discovered}; executed=${report.executed}; passed=${report.passed}; skipped=${report.skipped}; external_service_calls=0.\n`);
    if (!passed) process.exitCode = 1;
  }
} else {
  const preflight = preflightPerf06Mutation(process.env);
  const missing = [...preflight.missing];
  const apiOrigin = process.env.G6_H5_PERF06_API_ORIGIN ?? '';
  const appRoot = resolve(process.env.G6_H5_PERF06_MUTATION_APP_ROOT ?? process.cwd());
  const expectedAppRoot = resolve(process.cwd());
  if (appRoot !== expectedAppRoot) missing.push('MUTATION_APP_ROOT_MUST_BE_CURRENT_CHECKOUT');
  for (const key of ['G6_H5_PERF06_MUTATION_APP_ROOT', 'G6_H5_PERF06_MUTATION_STORAGE_STATE_DIR', 'G6_H5_PERF06_PROFILE', 'G6_H5_PERF06_MUTATION_HARNESS_SHA', 'G6_H5_PERF06_MUTATION_SUBJECT_SHA', 'G6_H5_PERF06_MUTATION_DATASET_SHA']) if (!process.env[key]) missing.push(key);
  if (!['1', '5', '20'].includes(process.env.G6_H5_PERF06_PROFILE ?? '')) missing.push('PROFILE_NOT_SUPPORTED');
  if (process.env.G6_H5_PERF06_MUTATION_DATASET_SHA !== datasetSha) missing.push('DATASET_SHA_MISMATCH');
  if (process.env.VITE_DATA_MODE !== 'api' || process.env.VITE_G6_ADMIN_API_ENABLED !== 'true' || process.env.VITE_GATEWAY_ORIGIN !== apiOrigin) missing.push('ISOLATED_API_BUILD_CONFIGURATION_INVALID');
  let harness;
  if (!missing.length) {
    try {
      const moduleUrl = pathToFileURL(resolve(process.env.G6_H5_PERF06_MUTATION_HARNESS));
      harness = await import(moduleUrl.href);
      for (const method of ['preflight', 'prepare', 'cleanup', 'exists']) if (typeof harness[method] !== 'function') missing.push(`HARNESS_METHOD_${method.toUpperCase()}_MISSING`);
    } catch { missing.push('AUTHORIZED_HARNESS_IMPORT_FAILED'); }
  }
  let resourceIndex = null;
  let run = null;
  let cleanupStatus = 'NOT_STARTED';
  const resourceIndexPath = resolve(process.env.G6_H5_PERF06_MUTATION_RESOURCE_INDEX ?? '');
  const resourceRoot = resolve('test-results/h5/perf06-mutation-resources');
  const resourceIndexIsSafe = resourceIndexPath.startsWith(`${resourceRoot}${sep}`);
  const registeredResources = [];
  if (!resourceIndexIsSafe) missing.push('RESOURCE_INDEX_MUST_BE_IN_RUNNER_OWNED_TEMPORARY_DIRECTORY');
  if (process.env.G6_H5_PERF06_MUTATION_SUBJECT_SHA !== sourceSha) missing.push('MUTATION_SUBJECT_SHA_NOT_CURRENT_HEAD');
  for (const key of ['G6_H5_PERF06_MUTATION_HARNESS_SHA', 'G6_H5_PERF06_MUTATION_SUBJECT_SHA']) if (!/^[a-f0-9]{40}$/i.test(process.env[key] ?? '')) missing.push(`${key}_INVALID`);
  try {
    if (missing.length) {
      const report = { ...baseReport, status: 'BLOCKED_DEPENDENCY', reason: preflight.reason, missing: [...new Set(missing)], evidence_level: 'L1', service_calls: 0, writes: 0, cleanup: cleanupStatus };
      await writeIndexedReport(report);
      process.stdout.write(`PERF06_MUTATION ${report.status}: authorized isolated harness or prerequisites missing; service_calls=0; writes=0.\n`);
      process.exitCode = 2;
    } else {
      const gate = await harness.preflight({ apiOrigin, profile: Number(process.env.G6_H5_PERF06_PROFILE), datasetSeed: 20261123 });
      if (gate?.authorized !== true || gate?.scope !== 'LOOPBACK_DISPOSABLE' || gate?.apiOrigin !== apiOrigin) throw new Error('HARNESS_AUTHORIZATION_REJECTED');
      await mkdir(dirname(resourceIndexPath), { recursive: true });
      const persistRegisteredResources = async () => {
        const bytes = Buffer.from(`${JSON.stringify({ schemaVersion: 1, resources: registeredResources }, null, 2)}\n`, 'utf8');
        assertSafeEvidenceText(bytes.toString('utf8'));
        const temporary = `${resourceIndexPath}.${randomUUID()}.tmp`;
        await writeFile(temporary, bytes, { flag: 'wx' });
        await rename(temporary, resourceIndexPath);
      };
      const registerResourceBeforeCreate = async item => {
        if (item?.disposable !== true || item?.registered_by_harness !== true || item?.mutation_authorized !== true || !/^[0-9a-f-]{36}$/i.test(item?.product_id ?? '') || !Number.isSafeInteger(item?.initial_catalog_version) || item.initial_catalog_version < 1 || item?.initial_pricing_status !== 'REJECTED' || typeof item?.display_name !== 'string' || !item.display_name || !item?.storage_state_path || !/^[0-9a-f]{64}$/i.test(item?.storage_state_sha256 ?? '') || registeredResources.some(resource => resource.product_id === item.product_id)) throw new Error('MUTATION_RESOURCE_REGISTRATION_INVALID');
        const storage = await readFile(item.storage_state_path);
        if (createHash('sha256').update(storage).digest('hex') !== item.storage_state_sha256) throw new Error('MUTATION_IDENTITY_STATE_SHA_MISMATCH');
        // Persist the disposable ID before the owner harness performs its first API write.
        registeredResources.push(item);
        await persistRegisteredResources();
      };
      resourceIndex = await harness.prepare({ profile: Number(process.env.G6_H5_PERF06_PROFILE), sessions: Number(process.env.G6_H5_PERF06_PROFILE), datasetSeed: 20261123, sourceSha, appRoot, storageStateDirectory: resolve(process.env.G6_H5_PERF06_MUTATION_STORAGE_STATE_DIR), resourceIndexPath, registerResourceBeforeCreate });
      if (resourceIndex?.schemaVersion !== 1 || !Array.isArray(resourceIndex.resources) || resourceIndex.resources.length !== Number(process.env.G6_H5_PERF06_PROFILE)) throw new Error('HARNESS_RESOURCE_INDEX_INVALID');
      const ids = new Set();
      for (const item of resourceIndex.resources) {
        if (item?.disposable !== true || item?.registered_by_harness !== true || item?.mutation_authorized !== true || !/^[0-9a-f-]{36}$/i.test(item?.product_id ?? '') || ids.has(item.product_id) || !item.storage_state_path || !/^[0-9a-f]{64}$/i.test(item.storage_state_sha256 ?? '') || !Number.isSafeInteger(item.initial_catalog_version) || item.initial_pricing_status !== 'REJECTED' || !item.display_name) throw new Error('HARNESS_RESOURCE_NOT_ISOLATED');
        const storage = await readFile(item.storage_state_path);
        if (createHash('sha256').update(storage).digest('hex') !== item.storage_state_sha256) throw new Error('MUTATION_IDENTITY_STATE_SHA_MISMATCH');
        ids.add(item.product_id);
      }
      if (ids.size !== registeredResources.length || resourceIndex.resources.some(item => !registeredResources.some(registered => registered.product_id === item.product_id))) throw new Error('HARNESS_RESOURCES_NOT_PRE_REGISTERED');
      const runId = `${Date.now()}-${randomUUID()}`;
      const runDirectory = resolve('test-results/h5/perf06-mutation-runs', runId);
      await mkdir(runDirectory, { recursive: true });
      const innerPath = resolve(runDirectory, 'playwright-summary.json');
      const metricsPath = resolve(runDirectory, 'metrics.json');
      run = await runChild(['test', '--config', 'playwright.h5-perf06-mutation-real.config.ts'], { ...process.env, G6_H5_PERF06_MUTATION_MODE: 'real', G6_H5_EVIDENCE_SUMMARY_PATH: innerPath, G6_H5_PERF06_MUTATION_METRICS_PATH: metricsPath }, 420_000);
      let summary = null;
      try { const bytes = await readFile(innerPath); assertSafeEvidenceText(bytes.toString('utf8')); summary = JSON.parse(bytes); } catch { /* Missing evidence fails closed. */ }
      let metrics = null;
      try { const bytes = await readFile(metricsPath); assertSafeEvidenceText(bytes.toString('utf8')); metrics = JSON.parse(bytes); } catch { /* Missing or unsafe metrics fail closed. */ }
      await cleanupRegisteredMutationResources(resourceIndex, async productId => {
        await harness.cleanup({ productId, resourceIndex });
        if (await harness.exists({ productId, resourceIndex }) !== false) throw new Error('MUTATION_CLEANUP_RESOURCE_REMAINS');
      });
      cleanupStatus = 'PASS_IDEMPOTENT_HARNESS_CLEANUP';
      const testPassed = run.code === 0 && !run.timedOut && summary?.total === 1 && summary?.passed === 1 && summary?.failed === 0 && summary?.skipped === 0 && summary?.interrupted === 0 && metrics?.case_id === 'PERF06_MUTATION' && metrics?.status === 'PASS' && metrics?.configuration?.sessions_started === resourceIndex.resources.length && metrics?.cleanup?.state === 'DEFERRED_TO_OWNER_HARNESS_FINALLY';
      const report = { ...baseReport, status: testPassed && cleanupStatus.startsWith('PASS') ? 'PASS' : 'FAIL', reason: testPassed ? 'UI_MUTATION_AND_TERMINAL_PREPARATION_VERIFIED_ON_DISPOSABLE_LOOPBACK_RESOURCES' : 'REAL_MUTATION_JOURNEY_OR_CLEANUP_FAILED', evidence_level: 'L1', profile_sessions: Number(process.env.G6_H5_PERF06_PROFILE), discovered: summary?.total ?? 0, executed: summary?.total ?? 0, passed: summary?.passed ?? 0, failed: summary?.failed ?? 0, skipped: summary?.skipped ?? 0, service_calls: 'owner harness isolated API; loopback only', disposable_resources: resourceIndex.resources.length, cleanup: cleanupStatus, metrics: metrics ? { sessions_started: metrics.configuration?.sessions_started, start_skew_ms: metrics.configuration?.start_skew_ms, journey_completed: metrics.journeys?.completed, journey_failed: metrics.journeys?.failed, p50_ms: metrics.journeys?.p50_ms, p95_ms: metrics.journeys?.p95_ms, p99_ms: metrics.journeys?.p99_ms, http: metrics.http } : null, captured_subprocess_bytes: run.bytes, dataset_checksum: datasetSha };
      await writeIndexedReport(report);
      process.stdout.write(`PERF06_MUTATION L1 ${report.status}: sessions=${report.profile_sessions}; executed=${report.executed}; cleanup=${cleanupStatus}.\n`);
      if (report.status !== 'PASS') process.exitCode = 1;
    }
  } catch {
    if (!resourceIndex && resourceIndexIsSafe) {
      try { resourceIndex = JSON.parse(await readFile(resourceIndexPath, 'utf8')); } catch { /* no resource was registered */ }
    }
    if (resourceIndex && harness) {
      try {
        await cleanupRegisteredMutationResources(resourceIndex, async productId => {
          await harness.cleanup({ productId, resourceIndex });
          if (await harness.exists({ productId, resourceIndex }) !== false) throw new Error('MUTATION_CLEANUP_RESOURCE_REMAINS');
        });
        cleanupStatus = 'PASS_IDEMPOTENT_HARNESS_CLEANUP';
      } catch { cleanupStatus = 'FAIL_OR_UNCONFIRMED'; }
    }
    const report = { ...baseReport, status: 'FAIL', reason: 'REAL_MUTATION_RUNNER_OR_HARNESS_FAILURE', evidence_level: 'L1', service_calls: 'loopback only when preflight passed', writes: resourceIndex?.resources?.length ?? registeredResources.length, cleanup: cleanupStatus, captured_subprocess_bytes: run?.bytes ?? 0 };
    try { await writeIndexedReport(report); } catch { /* Do not emit unfiltered failure details. */ }
    process.stdout.write(`PERF06_MUTATION L1 FAIL: isolated harness execution or cleanup failed; cleanup=${cleanupStatus}.\n`);
    process.exitCode = 1;
  }
}
