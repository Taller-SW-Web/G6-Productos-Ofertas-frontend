import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  BACKEND_CHECKSUM_PATH,
  BACKEND_MANIFEST_PATH,
  SOURCE_REPOSITORY,
  canonicalJsonBytes,
  digest,
  syncProjection,
  verifyProjection,
  verifyLocalProjection,
} from '../../../../scripts/lib/catalog-h5-fixtures.mjs';

const fixtureDirectory = new URL('.', import.meta.url);
let tempRoot;

before(async () => { tempRoot = await mkdtemp(join(tmpdir(), 'poma-h5-fixture-test-')); });
after(async () => { if (tempRoot) await rm(tempRoot, { recursive: true, force: true }); });

test('proyección versionada independiente conserva checksum, seed y procedencia declarada', async () => {
  const [manifestBytes, checksumText, sourceBytes, attributes] = await Promise.all([
    readFile(new URL('manifest.json', fixtureDirectory)),
    readFile(new URL('manifest.sha256', fixtureDirectory), 'utf8'),
    readFile(new URL('source.json', fixtureDirectory)),
    readFile(new URL('.gitattributes', fixtureDirectory), 'utf8'),
  ]);
  const local = verifyLocalProjection({ manifestBytes, checksumText, sourceBytes });
  assert.equal(local.manifest.seed, 20261123);
  assert.equal(local.sha256, digest(manifestBytes));
  assert.equal(local.source.repository, SOURCE_REPOSITORY);
  assert.match(attributes, /^\/manifest\.json text eol=lf\n\/manifest\.sha256 text eol=lf\n\/source\.json text eol=lf\n$/);
  assert.equal(manifestBytes.includes(0x0d), false);
  assert.equal(manifestBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
});

test('detecta alteraciones aunque el manifiesto se vuelva a hashear localmente', async () => {
  const [manifestBytes, sourceBytes] = await Promise.all([
    readFile(new URL('manifest.json', fixtureDirectory)),
    readFile(new URL('source.json', fixtureDirectory)),
  ]);
  const changed = Buffer.from(manifestBytes);
  changed[changed.indexOf(Buffer.from('POMA-H5-SIMPLE-0001'))] ^= 1;
  const checksumText = `${digest(changed)}  manifest.json\n`;
  assert.throws(
    () => verifyLocalProjection({ manifestBytes: changed, checksumText, sourceBytes }),
    /FRONTEND_PROVENANCE_INVALID/,
  );
});

test('detecta BOM, CRLF y checksum no coincidente', async () => {
  const [manifestBytes, checksumText, sourceBytes] = await Promise.all([
    readFile(new URL('manifest.json', fixtureDirectory)),
    readFile(new URL('manifest.sha256', fixtureDirectory), 'utf8'),
    readFile(new URL('source.json', fixtureDirectory)),
  ]);
  assert.throws(() => verifyLocalProjection({ manifestBytes: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), manifestBytes]), checksumText, sourceBytes }), /FRONTEND_MANIFEST_BOM/);
  assert.throws(() => verifyLocalProjection({ manifestBytes: Buffer.from(manifestBytes.toString('utf8').replaceAll('\n', '\r\n')), checksumText, sourceBytes }), /FRONTEND_MANIFEST_CRLF/);
  assert.throws(() => verifyLocalProjection({ manifestBytes, checksumText: `${'0'.repeat(64)}  manifest.json\n`, sourceBytes }), /CHECKSUM_MISMATCH/);
});

test('sincroniza y verifica la procedencia a un commit Backend exacto', async () => {
  const backendRepository = join(tempRoot, 'backend-source');
  const projection = join(tempRoot, 'frontend-projection');
  const init = spawnSync('git', ['init', backendRepository], { encoding: 'utf8', windowsHide: true });
  assert.equal(init.status, 0, init.stderr);
  const manifestBytes = canonicalJsonBytes({ schema_version: 1, seed: 20261123, products: [] });
  const checksum = `${digest(manifestBytes)}  manifest.json\n`;
  const sourceManifest = join(backendRepository, BACKEND_MANIFEST_PATH);
  const sourceChecksum = join(backendRepository, BACKEND_CHECKSUM_PATH);
  await import('node:fs/promises').then(({ mkdir }) => mkdir(join(backendRepository, 'apps/catalog-svc/test/fixtures/h5'), { recursive: true }));
  await writeFile(sourceManifest, manifestBytes);
  await writeFile(sourceChecksum, checksum);
  const git = (args) => {
    const result = spawnSync('git', ['-C', backendRepository, ...args], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  };
  git(['config', 'user.name', 'H5 fixture test']);
  git(['config', 'user.email', 'h5-fixture-test@example.invalid']);
  git(['add', BACKEND_MANIFEST_PATH, BACKEND_CHECKSUM_PATH]);
  git(['commit', '-m', 'fixture test source']);
  const sourceCommit = git(['rev-parse', 'HEAD']);
  const synced = await syncProjection({ backendRepository, sourceCommit, destination: projection });
  const verified = await verifyProjection({ destination: projection, backendRepository, sourceCommit });
  assert.equal(synced.sourceCommit, sourceCommit);
  assert.equal(verified.crossChecked, true);
  assert.equal(verified.sha256, digest(manifestBytes));
});
