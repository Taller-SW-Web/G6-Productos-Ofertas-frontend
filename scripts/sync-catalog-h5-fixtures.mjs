import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { syncProjection, verifyProjection } from './lib/catalog-h5-fixtures.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(projectRoot, 'tests/fixtures/h5/catalog');

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

try {
  const backendRepository = option('--backend-repo');
  const sourceCommit = option('--source-commit');
  if (!backendRepository || !sourceCommit || process.argv.slice(2).some((arg) => !['--check', '--backend-repo', backendRepository, '--source-commit', sourceCommit].includes(arg))) {
    throw new Error('USAGE: node scripts/sync-catalog-h5-fixtures.mjs --backend-repo <repo-path> --source-commit <40-char-sha> [--check]');
  }
  const result = process.argv.includes('--check')
    ? await verifyProjection({ destination, backendRepository: resolve(backendRepository), sourceCommit })
    : await syncProjection({ destination, backendRepository: resolve(backendRepository), sourceCommit });
  if (process.argv.includes('--check') && !result.crossChecked) throw new Error('PROVENANCE_NOT_CROSS_CHECKED');
  process.stdout.write(`${process.argv.includes('--check') ? 'VERIFIED' : 'SYNCED'} seed=20261123 sha256=${result.sha256} source=${sourceCommit}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : 'UNKNOWN';
  process.stderr.write(`FIXTURE_SYNC_FAILED ${message}\n`);
  process.exitCode = 1;
}
