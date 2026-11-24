export function buildAdminPerformanceCommand(scenario = 'legacy') {
  if (scenario === 'h5-perf06') return {
    args: ['test', '--config', 'playwright.h5-perf06.config.ts', '--workers=1'],
    env: { G6_H5_PERF06_ENTRYPOINT: 'run-admin-performance' },
  };
  if (scenario !== 'legacy') throw new Error('ADMIN_PERFORMANCE_SCENARIO_INVALID');
  return {
    args: ['test', 'tests/admin-performance.spec.ts', '--grep', 'benchmark opt-in', '--workers=1', '--reporter=line'],
    env: {},
  };
}
