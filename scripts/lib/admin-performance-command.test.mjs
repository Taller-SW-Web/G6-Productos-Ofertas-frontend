import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdminPerformanceCommand } from './admin-performance-command.mjs';

test('preserves the historical administrative benchmark command', () => {
  assert.deepEqual(buildAdminPerformanceCommand(), {
    args: ['test', 'tests/admin-performance.spec.ts', '--grep', 'benchmark opt-in', '--workers=1', '--reporter=line'],
    env: {},
  });
});

test('selects the H5 PERF06 scenario only when explicitly requested', () => {
  assert.deepEqual(buildAdminPerformanceCommand('h5-perf06'), {
    args: ['test', '--config', 'playwright.h5-perf06.config.ts', '--workers=1'],
    env: { G6_H5_PERF06_ENTRYPOINT: 'run-admin-performance' },
  });
  assert.throws(() => buildAdminPerformanceCommand('other'), /SCENARIO_INVALID/);
});
