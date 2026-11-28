import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) throw new Error('Falta el reporte Playwright real');
const report = JSON.parse(readFileSync(path, 'utf8'));
const required = [
  'eight-modules.real.spec.ts',
  'http-contracts.real.spec.ts',
  'transversal-flows.real.spec.ts',
];
const files = new Set();
let executed = 0;
let skipped = 0;
let failed = 0;
function visit(suite, parentFile) {
  const file = suite.file?.replaceAll('\\', '/').split('/').pop() ?? parentFile;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      if (test.status === 'skipped' || test.results?.some((result) => result.status === 'skipped')) skipped++;
      else if (test.status === 'expected' && test.results?.length === 1 && test.results[0].status === 'passed') {
        executed++;
        if (file) files.add(file);
      }
      else failed++;
    }
  }
  for (const child of suite.suites ?? []) visit(child, file);
}
for (const suite of report.suites ?? []) visit(suite);
const missing = required.filter((file) => !files.has(file));
if (missing.length || skipped || failed || executed < 16 || report.stats?.unexpected !== 0 || report.stats?.expected !== executed || (report.stats?.skipped ?? 0) !== 0 || (report.stats?.flaky ?? 0) !== 0) {
  throw new Error(`Suite API real incompleta: ejecutados=${executed}, omitidos=${skipped}, fallidos=${failed}, faltantes=${missing.join(',')}`);
}
console.log(`API real: ${executed} escenarios ejecutados, cero omitidos`);
