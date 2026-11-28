import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('la suite real exige todos los archivos, escenarios ejecutados y cero skips', () => {
  const dir = mkdtempSync(join(tmpdir(), 'g6-real-report-'));
  try {
    const files = ['eight-modules.real.spec.ts', 'http-contracts.real.spec.ts', 'transversal-flows.real.spec.ts'];
    const report = { suites: files.map((file, index) => ({ file, specs: [{ tests: Array.from({ length: index === 0 ? 10 : index === 1 ? 5 : 1 }, () => ({ status: 'expected', results: [{ status: 'passed' }] })) }] })), stats: { expected: 16, unexpected: 0 } };
    const run = (value) => { const path = join(dir, 'report.json'); writeFileSync(path, JSON.stringify(value)); return spawnSync(process.execPath, ['scripts/ci/verify-real-playwright.mjs', path], { encoding: 'utf8' }); };
    assert.equal(run(report).status, 0);
    assert.equal(run({ ...report, suites: report.suites.slice(1) }).status, 1);
    const skipped = structuredClone(report); skipped.suites[0].specs[0].tests[0].results[0].status = 'skipped';
    assert.equal(run(skipped).status, 1);
    const retry = structuredClone(report); retry.suites[0].specs[0].tests[0].results.unshift({status: 'failed'});
    assert.equal(run(retry).status, 1);
    const incomplete = structuredClone(report); incomplete.suites[0].specs[0].tests[0].status = 'unexpected';
    assert.equal(run(incomplete).status, 1);
    const emptySuite = structuredClone(report); emptySuite.suites[2].specs = []; emptySuite.suites[0].specs[0].tests.push({ status: 'expected', results: [{ status: 'passed' }] });
    assert.equal(run(emptySuite).status, 1);
    assert.equal(run({ ...report, stats: { expected: 17, unexpected: 0 } }).status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
