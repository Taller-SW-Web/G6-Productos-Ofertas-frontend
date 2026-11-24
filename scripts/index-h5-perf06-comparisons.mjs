import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { assertSafeEvidenceText } from '../tests/h5/evidence-security.mjs';

const directory = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('PERF06_COMPARISON_DIRECTORY_REQUIRED');
const names = ['1-cold.json', '1-warm.json', '5-cold.json', '5-warm.json', '20-cold.json', '20-warm.json'];
const artifacts = [];
for (const name of names) {
  const bytes = await readFile(resolve(directory, name));
  const content = bytes.toString('utf8');
  assertSafeEvidenceText(content);
  const report = JSON.parse(content);
  if (!['PASS', 'FAIL', 'INCONCLUSIVE'].includes(report.status)) throw new Error('PERF06_COMPARISON_STATUS_INVALID');
  artifacts.push({ name, sha256: createHash('sha256').update(bytes).digest('hex'), status: report.status });
}
const index = { schemaVersion: 1, artifacts };
const serialized = `${JSON.stringify(index, null, 2)}\n`;
assertSafeEvidenceText(serialized);
const outputPath = resolve(dirname(directory), 'evidence-index.json');
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, serialized, 'utf8');
process.stdout.write(`PERF06 comparison evidence indexed: artifacts=${artifacts.length}; index_sha256=${createHash('sha256').update(serialized).digest('hex')}.\n`);
