import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const runner = 'scripts/h5/security/sca-audit.mjs';
test('reuses existing audit evidence and fails closed for missing or inconsistent reports', () => {
  const dir = mkdtempSync(join(tmpdir(), 'h5-sca-'));
  try {
    const report = join(dir, 'audit.json');
    const decision = join(dir, 'decision.json');
    const data = { auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }, dependencies: { prod: 0, dev: 0, optional: 0, peer: 0, peerOptional: 0, total: 0 } } };
    writeFileSync(report, JSON.stringify(data));
    writeFileSync(decision, JSON.stringify({ fullAudit: { exitCode: 0 } }));
    const run = () => spawnSync(process.execPath, [runner, report, decision], { encoding: 'utf8' });
    assert.equal(run().status, 0);
    data.metadata.vulnerabilities.total = 1;
    writeFileSync(report, JSON.stringify(data));
    assert.equal(run().status, 2);
    writeFileSync(decision, '{}');
    assert.equal(run().status, 2);
    writeFileSync(report, JSON.stringify({ auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }, dependencies: { prod: 0, dev: 0, optional: 0, peer: 0, peerOptional: 0, total: 0 } } }));
    writeFileSync(decision, JSON.stringify({ fullAudit: { exitCode: 0, processError: { code: 'EAI_AGAIN' } } }));
    assert.equal(run().status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
