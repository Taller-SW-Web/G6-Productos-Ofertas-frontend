import { mkdir, writeFile } from 'node:fs/promises';
import { assertSafeEvidenceText } from '../tests/h5/evidence-security.mjs';
import { PERF06_MUTATION_PLAN, preflightPerf06Mutation } from '../tests/h5/perf06-mutation-plan.mjs';

const result = preflightPerf06Mutation(process.env);
const report = {
  schemaVersion: 1,
  caseId: 'PERF06_MUTATION',
  suite: 'PERF06_MUTATION',
  status: result.status,
  reason: result.reason,
  missing: result.missing,
  plannedOperations: PERF06_MUTATION_PLAN.measuredJourney.map(({ operationId, method, path }) => ({ operationId, method, path })),
  serviceCalls: 0,
  writes: 0,
  cleanup: 'not-started',
  evidenceLevel: 'L1',
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
assertSafeEvidenceText(serialized);
await mkdir('test-results/h5', { recursive: true });
await writeFile('test-results/h5/perf06-mutation-preflight.json', serialized, 'utf8');
process.stdout.write(`PERF06_MUTATION ${report.status}: ${report.reason}; writes=0; service_calls=0.\n`);
if (report.status !== 'DONE_B') process.exitCode = 2;
