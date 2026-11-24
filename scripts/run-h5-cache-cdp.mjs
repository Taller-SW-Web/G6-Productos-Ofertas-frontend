import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { assertSafeEvidenceText } from '../tests/h5/evidence-security.mjs';

const reportPath = 'test-results/h5/cache-cdp-summary.json';
await mkdir(dirname(reportPath), { recursive: true });
try { await unlink(reportPath); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
const writeOutcome = async (status, reason, extra = {}) => {
  const report = {
    schemaVersion: 1,
    caseId: 'H5-CACHE-CDP',
    suite: 'CACHE_CDP',
    status,
    reason,
    docsSha: '40524e96c6973f84d74160076781702fe2a3da19',
    timestampUtc: new Date().toISOString(),
    evidenceLevel: 'L0',
    ...extra,
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  assertSafeEvidenceText(serialized);
  await writeFile(reportPath, serialized, 'utf8');
  const index = {
    schemaVersion: 1,
    artifact: 'cache-cdp-summary.json',
    sha256: createHash('sha256').update(Buffer.from(serialized, 'utf8')).digest('hex'),
    caseId: report.caseId,
    docsSha: report.docsSha,
    timestampUtc: report.timestampUtc,
    status: report.status,
    evidenceLevel: report.evidenceLevel,
  };
  const indexText = `${JSON.stringify(index, null, 2)}\n`;
  assertSafeEvidenceText(indexText);
  await writeFile(`${reportPath}.index.json`, indexText, 'utf8');
  return report;
};
const runChild = (args, env, timeoutMs) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false, env });
  let outputBytes = 0;
  let output = '';
  let timedOut = false;
  child.stdout.on('data', chunk => { outputBytes += chunk.length; output += chunk.toString('utf8'); });
  child.stderr.on('data', chunk => { outputBytes += chunk.length; output += chunk.toString('utf8'); });
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
  child.once('error', error => { clearTimeout(timer); reject(error); });
  child.once('close', code => { clearTimeout(timer); resolve({ code, outputBytes, output, timedOut }); });
});
const discovery = await runChild(['node_modules/playwright/cli.js', 'test', '--config', 'playwright.h5-cache.config.ts', '--list', '--reporter=list'], process.env, 15_000);
if (discovery.code !== 0 || discovery.timedOut || !/Total: 1 test in 1 file/.test(discovery.output) || !/cache-cdp\.h5\.ts:/.test(discovery.output)) {
  const report = await writeOutcome('BLOCKED_DEPENDENCY', 'EXPECTED_CACHE_CDP_TEST_NOT_DISCOVERED', { discovered: /Total: 1 test in 1 file/.test(discovery.output) ? 1 : 0, serviceCalls: 0 });
  process.stdout.write(`H5 cache-CDP ${report.status}: expected probe discovery incomplete; captured_bytes=${discovery.outputBytes}.\n`);
  process.exit(2);
}
const run = await runChild(['node_modules/playwright/cli.js', 'test', '--config', 'playwright.h5-cache.config.ts'], { ...process.env, G6_H5_EVIDENCE_SUMMARY_PATH: reportPath }, 45_000);
let summary;
try {
  const text = await readFile(reportPath, 'utf8');
  assertSafeEvidenceText(text);
  summary = JSON.parse(text);
} catch { summary = null; }
if (!summary || summary.total !== 1 || summary.passed !== 1 || summary.skipped !== 0 || summary.failed !== 0 || run.code !== 0 || run.timedOut) {
  const status = summary?.failed ? 'FAIL' : 'INCONCLUSIVE';
  const report = await writeOutcome(status, run.timedOut ? 'CACHE_PROBE_RUNNER_TIMEOUT' : 'CACHE_PROBE_NOT_COMPLETED', { discovered: 1, executed: summary?.total ?? 0, passed: summary?.passed ?? 0, failed: summary?.failed ?? 0, skipped: summary?.skipped ?? 0, capturedSubprocessBytes: discovery.outputBytes + run.outputBytes });
  process.stdout.write(`H5 cache-CDP ${report.status}: probe incomplete; captured_bytes=${discovery.outputBytes + run.outputBytes}.\n`);
  process.exit(report.status === 'FAIL' ? 1 : 2);
}
const report = await writeOutcome('PASS', 'CDP_BROWSER_CACHE_HIT_VERIFIED', { discovered: 1, executed: 1, passed: 1, failed: 0, skipped: 0, serviceCalls: 0, capturedSubprocessBytes: discovery.outputBytes + run.outputBytes });
process.stdout.write(`H5 cache-CDP ${report.status}: cold/warm browser-cache events verified via CDP; service_calls=0; artifact_sha256=${createHash('sha256').update(JSON.stringify(report)).digest('hex')}.\n`);
