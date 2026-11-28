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
function visit(suite) {
  if (suite.file) files.add(suite.file.replaceAll('\\', '/').split('/').pop());
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      if (test.status === 'skipped' || test.results?.some((result) => result.status === 'skipped')) skipped++;
      else if (test.results?.some((result) => result.status === 'passed')) executed++;
      else failed++;
    }
  }
  for (const child of suite.suites ?? []) visit(child);
}
for (const suite of report.suites ?? []) visit(suite);
const missing = required.filter((file) => !files.has(file));
if (missing.length || skipped || failed || executed < 16 || report.stats?.unexpected !== 0 || report.stats?.expected < 16) {
  throw new Error(`Suite API real incompleta: ejecutados=${executed}, omitidos=${skipped}, fallidos=${failed}, faltantes=${missing.join(',')}`);
}
console.log(`API real: ${executed} escenarios ejecutados, cero omitidos`);
