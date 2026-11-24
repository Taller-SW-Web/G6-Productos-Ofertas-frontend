import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const BACKEND_MANIFEST_PATH = 'apps/catalog-svc/test/fixtures/h5/manifest.json';
export const BACKEND_CHECKSUM_PATH = 'apps/catalog-svc/test/fixtures/h5/manifest.sha256';
export const SOURCE_REPOSITORY = 'Taller-SW-Web/G6-Productos-Ofertas-backend';
export const FIXTURE_SEED = 20261123;

export function canonicalJsonBytes(value) {
  const sort = (item) => Array.isArray(item) ? item.map(sort) : item !== null && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, sort(item[key])])) : item;
  return Buffer.from(`${JSON.stringify(sort(value), null, 2)}\n`, 'utf8');
}

export function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseCanonicalJson(bytes, category) {
  if (!Buffer.isBuffer(bytes)) throw new TypeError(`${category}_BYTES_REQUIRED`);
  if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) throw new Error(`${category}_BOM`);
  if (bytes.includes(0x0d)) throw new Error(`${category}_CRLF`);
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new Error(`${category}_INVALID_JSON`); }
  if (!canonicalJsonBytes(value).equals(bytes)) throw new Error(`${category}_NOT_CANONICAL`);
  return value;
}

function parseChecksum(text, bytes, category) {
  const expected = /^([a-f0-9]{64})[\x20]{2}manifest\.json\n$/.exec(text)?.[1];
  if (!expected || expected !== digest(bytes)) throw new Error(`${category}_CHECKSUM_MISMATCH`);
  return expected;
}

export function verifyLocalProjection({ manifestBytes, checksumText, sourceBytes }) {
  const manifest = parseCanonicalJson(manifestBytes, 'FRONTEND_MANIFEST');
  if (manifest.schema_version !== 1 || manifest.seed !== FIXTURE_SEED) throw new Error('FRONTEND_SCHEMA_INVALID');
  const manifestSha = parseChecksum(checksumText, manifestBytes, 'FRONTEND_MANIFEST');
  const source = parseCanonicalJson(sourceBytes, 'FRONTEND_SOURCE');
  if (source.repository !== SOURCE_REPOSITORY || source.path !== BACKEND_MANIFEST_PATH || source.seed !== FIXTURE_SEED || !/^[a-f0-9]{40}$/.test(source.commit ?? '') || source.sha256 !== manifestSha) throw new Error('FRONTEND_PROVENANCE_INVALID');
  return { manifest, source, sha256: manifestSha };
}

function gitBytes(repository, args, category) {
  const result = spawnSync('git', ['-C', repository, ...args], { encoding: 'buffer', windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(category);
  return result.stdout;
}

function backendFiles(repository, commit) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('SOURCE_COMMIT_INVALID');
  const manifestBytes = gitBytes(repository, ['show', `${commit}:${BACKEND_MANIFEST_PATH}`], 'SOURCE_MANIFEST_UNAVAILABLE');
  const checksumBytes = gitBytes(repository, ['show', `${commit}:${BACKEND_CHECKSUM_PATH}`], 'SOURCE_CHECKSUM_UNAVAILABLE');
  const checksumText = checksumBytes.toString('utf8');
  parseCanonicalJson(manifestBytes, 'SOURCE_MANIFEST');
  const sha256 = parseChecksum(checksumText, manifestBytes, 'SOURCE_MANIFEST');
  return { manifestBytes, checksumText, sha256 };
}

export async function syncProjection({ backendRepository, sourceCommit, destination }) {
  const sourceFiles = backendFiles(backendRepository, sourceCommit);
  const source = canonicalJsonBytes({
    commit: sourceCommit,
    path: BACKEND_MANIFEST_PATH,
    repository: SOURCE_REPOSITORY,
    schema_version: 1,
    seed: FIXTURE_SEED,
    sha256: sourceFiles.sha256,
  });
  const localResult = verifyLocalProjection({ manifestBytes: sourceFiles.manifestBytes, checksumText: sourceFiles.checksumText, sourceBytes: source });
  if (localResult.sha256 !== sourceFiles.sha256) throw new Error('PROJECTION_HASH_MISMATCH');
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, 'manifest.json'), sourceFiles.manifestBytes);
  await writeFile(join(destination, 'manifest.sha256'), sourceFiles.checksumText, 'utf8');
  await writeFile(join(destination, 'source.json'), source);
  return { sha256: sourceFiles.sha256, sourceCommit };
}

export async function verifyProjection({ destination, backendRepository, sourceCommit }) {
  const [manifestBytes, checksumText, sourceBytes] = await Promise.all([
    readFile(join(destination, 'manifest.json')),
    readFile(join(destination, 'manifest.sha256'), 'utf8'),
    readFile(join(destination, 'source.json')),
  ]);
  const local = verifyLocalProjection({ manifestBytes, checksumText, sourceBytes });
  if (!backendRepository || !sourceCommit) return { ...local, crossChecked: false };
  if (local.source.commit !== sourceCommit) throw new Error('SOURCE_COMMIT_MISMATCH');
  const sourceFiles = backendFiles(backendRepository, sourceCommit);
  if (sourceFiles.sha256 !== local.sha256 || !sourceFiles.manifestBytes.equals(manifestBytes) || sourceFiles.checksumText !== checksumText) throw new Error('SOURCE_PROVENANCE_MISMATCH');
  return { ...local, crossChecked: true };
}
