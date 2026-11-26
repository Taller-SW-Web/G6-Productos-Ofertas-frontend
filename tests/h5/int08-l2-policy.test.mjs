import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { preflightInt08L2 } from './int08-l2-policy.mjs';

test('INT08 L2 exige ejecución explícita, autorización, identidades, APIM y producto descartable', async () => {
  const result = await preflightInt08L2({});
  assert.equal(result.status, 'BLOCKED_DEPENDENCY');
  assert.equal(result.metadata.approvedHostsSha256, null);
  assert.ok(result.missing.includes('EXPLICIT_L2_RUN_REQUIRED'));
  assert.ok(result.missing.includes('RELEASE_APPROVAL_REQUIRED'));
  assert.ok(result.missing.includes('OWNER_AUTHORIZED_IDENTITY_HARNESS_REQUIRED'));
  assert.ok(result.missing.includes('G6_H5_INT08_L2_PRODUCT_ID'));
});

test('INT08 L2 valida allowlist, hashes y registro autorizado antes de habilitar ejecución', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'poma-h5-l2-policy-'));
  try {
    const hostPath = join(directory, 'approved-hosts.json');
    const resourcePath = join(directory, 'resource-index.json');
    const hosts = Buffer.from(`${JSON.stringify({ schema_version: 1, preview: ['preview.test'], g7: ['auth.test'], apim: ['apim.test'] })}\n`);
    const resources = Buffer.from(`${JSON.stringify({ schemaVersion: 1, resources: [{ product_id: '11111111-1111-4111-8111-111111111111', display_name: 'Producto H5 sintético', disposable: true, registered_by_harness: true, mutation_authorized: true, initial_catalog_version: 1 }] })}\n`);
    await writeFile(hostPath, hosts);
    await writeFile(resourcePath, resources);
    const env = {
      G6_H5_INT08_L2_RUN: '1', G6_H5_INT08_L2_APPROVED: '1', G6_H5_INT08_L2_IDENTITY_HARNESS: '1',
      G6_H5_INT08_L2_ALLOWED_HOSTS_FILE: hostPath,
      G6_H5_INT08_L2_ALLOWED_HOSTS_SHA256: createHash('sha256').update(hosts).digest('hex'),
      G6_H5_INT08_L2_RESOURCE_INDEX: resourcePath,
      G6_H5_INT08_L2_RESOURCE_INDEX_SHA256: createHash('sha256').update(resources).digest('hex'),
      G6_H5_INT08_L2_PRODUCT_ID: '11111111-1111-4111-8111-111111111111',
      G6_H5_INT08_L2_PREVIEW_URL: 'https://preview.test', G6_H5_INT08_L2_G7_BASE_URL: 'https://auth.test', G6_H5_INT08_L2_APIM_BASE_URL: 'https://apim.test',
      G6_H5_INT08_L2_AUTHORIZED_EMAIL: 'authorized@example.test', G6_H5_INT08_L2_AUTHORIZED_PASSWORD: 'synthetic-canary',
      G6_H5_INT08_L2_DENIED_EMAIL: 'denied@example.test', G6_H5_INT08_L2_DENIED_PASSWORD: 'synthetic-canary',
      G6_H5_INT08_L2_RELEASE_SHA: 'a'.repeat(40), G6_H5_INT08_L2_GATEWAY_SHA: 'b'.repeat(40), G6_H5_INT08_L2_SERVICE_SHA: 'c'.repeat(40),
    };
    const valid = await preflightInt08L2(env);
    assert.equal(valid.status, 'READY_C');
    assert.equal(valid.missing.length, 0);
    assert.equal(valid.metadata.approvedHostsSha256, env.G6_H5_INT08_L2_ALLOWED_HOSTS_SHA256);
    const wrongHost = await preflightInt08L2({ ...env, G6_H5_INT08_L2_APIM_BASE_URL: 'https://unapproved.test' });
    assert.equal(wrongHost.status, 'BLOCKED_DEPENDENCY');
    assert.ok(wrongHost.missing.includes('APIM_BASE_URL_HOST_NOT_APPROVED'));
    const wrongHash = await preflightInt08L2({ ...env, G6_H5_INT08_L2_ALLOWED_HOSTS_SHA256: '0'.repeat(64) });
    assert.equal(wrongHash.status, 'BLOCKED_DEPENDENCY');
    assert.ok(wrongHash.missing.includes('APPROVED_HOSTS_CHECKSUM_MISMATCH'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('INT08 L2 rechaza activación incompleta y SHA de aprobación malformado sin llamadas', async () => {
  const result = await preflightInt08L2({
    G6_H5_INT08_L2_RUN: '1',
    G6_H5_INT08_L2_APPROVED: '1',
    G6_H5_INT08_L2_IDENTITY_HARNESS: '1',
    G6_H5_INT08_L2_ALLOWED_HOSTS_SHA256: 'bad',
    G6_H5_INT08_L2_RESOURCE_INDEX_SHA256: 'bad',
  });
  assert.equal(result.status, 'BLOCKED_DEPENDENCY');
  assert.ok(result.missing.includes('G6_H5_INT08_L2_ALLOWED_HOSTS_SHA256_INVALID'));
  assert.ok(result.missing.includes('G6_H5_INT08_L2_RESOURCE_INDEX_SHA256_INVALID'));
  assert.ok(result.missing.includes('G6_H5_INT08_L2_ALLOWED_HOSTS_FILE'));
  assert.ok(result.missing.includes('G6_H5_INT08_L2_AUTHORIZED_PASSWORD'));
});
