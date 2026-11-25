import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sha = value => /^[a-f0-9]{40}$/i.test(value ?? '');
const digest = value => /^[a-f0-9]{64}$/i.test(value ?? '');
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value ?? '');
const required = Object.freeze([
  'G6_H5_INT08_L2_RUN', 'G6_H5_INT08_L2_APPROVED', 'G6_H5_INT08_L2_IDENTITY_HARNESS',
  'G6_H5_INT08_L2_ALLOWED_HOSTS_FILE', 'G6_H5_INT08_L2_ALLOWED_HOSTS_SHA256',
  'G6_H5_INT08_L2_RESOURCE_INDEX', 'G6_H5_INT08_L2_RESOURCE_INDEX_SHA256', 'G6_H5_INT08_L2_PRODUCT_ID',
  'G6_H5_INT08_L2_PREVIEW_URL', 'G6_H5_INT08_L2_G7_BASE_URL', 'G6_H5_INT08_L2_APIM_BASE_URL',
  'G6_H5_INT08_L2_AUTHORIZED_EMAIL', 'G6_H5_INT08_L2_AUTHORIZED_PASSWORD',
  'G6_H5_INT08_L2_DENIED_EMAIL', 'G6_H5_INT08_L2_DENIED_PASSWORD',
  'G6_H5_INT08_L2_RELEASE_SHA', 'G6_H5_INT08_L2_GATEWAY_SHA', 'G6_H5_INT08_L2_SERVICE_SHA',
]);

export async function preflightInt08L2(env = process.env) {
  const missing = required.filter(name => !env[name]);
  for (const key of ['G6_H5_INT08_L2_ALLOWED_HOSTS_SHA256', 'G6_H5_INT08_L2_RESOURCE_INDEX_SHA256'])
    if (env[key] && !digest(env[key])) missing.push(`${key}_INVALID`);
  if (env.G6_H5_INT08_L2_RUN !== '1') missing.push('EXPLICIT_L2_RUN_REQUIRED');
  if (env.G6_H5_INT08_L2_APPROVED !== '1') missing.push('RELEASE_APPROVAL_REQUIRED');
  if (env.G6_H5_INT08_L2_IDENTITY_HARNESS !== '1') missing.push('OWNER_AUTHORIZED_IDENTITY_HARNESS_REQUIRED');
  for (const key of ['G6_H5_INT08_L2_RELEASE_SHA', 'G6_H5_INT08_L2_GATEWAY_SHA', 'G6_H5_INT08_L2_SERVICE_SHA'])
    if (env[key] && !sha(env[key])) missing.push(`${key}_INVALID`);
  for (const key of ['G6_H5_INT08_L2_PREVIEW_URL', 'G6_H5_INT08_L2_G7_BASE_URL', 'G6_H5_INT08_L2_APIM_BASE_URL']) {
    try { if (new URL(env[key]).protocol !== 'https:') missing.push(`${key}_MUST_USE_HTTPS`); }
    catch { missing.push(`${key}_INVALID`); }
  }
  if (env.G6_H5_INT08_L2_PRODUCT_ID && !uuid(env.G6_H5_INT08_L2_PRODUCT_ID)) missing.push('DISPOSABLE_PRODUCT_ID_INVALID');

  let approvedHostsSha256 = null;
  let resourceIndexSha256 = null;
  let hosts = null;
  if (!missing.some(item => item.startsWith('G6_H5_INT08_L2_ALLOWED_HOSTS_FILE'))) {
    try {
      const bytes = await readFile(resolve(env.G6_H5_INT08_L2_ALLOWED_HOSTS_FILE));
      approvedHostsSha256 = createHash('sha256').update(bytes).digest('hex');
      if (approvedHostsSha256 !== env.G6_H5_INT08_L2_ALLOWED_HOSTS_SHA256) missing.push('APPROVED_HOSTS_CHECKSUM_MISMATCH');
      hosts = JSON.parse(bytes.toString('utf8'));
      for (const key of ['preview', 'g7', 'apim']) {
        if (!Array.isArray(hosts?.[key]) || hosts[key].length === 0 || hosts[key].some(host => typeof host !== 'string' || host !== host.toLowerCase() || host.includes('/') || host.includes(':')))
          missing.push(`APPROVED_${key.toUpperCase()}_HOSTS_INVALID`);
      }
      for (const [key, group] of [['PREVIEW_URL', 'preview'], ['G7_BASE_URL', 'g7'], ['APIM_BASE_URL', 'apim']]) {
        try { if (!hosts?.[group]?.includes(new URL(env[`G6_H5_INT08_L2_${key}`]).hostname.toLowerCase())) missing.push(`${key}_HOST_NOT_APPROVED`); }
        catch { /* URL error already recorded above. */ }
      }
    } catch { missing.push('APPROVED_HOSTS_FILE_UNREADABLE'); }
  }
  let resourceIndex = null;
  if (env.G6_H5_INT08_L2_RESOURCE_INDEX) {
    try {
      const bytes = await readFile(resolve(env.G6_H5_INT08_L2_RESOURCE_INDEX));
      resourceIndexSha256 = createHash('sha256').update(bytes).digest('hex');
      if (resourceIndexSha256 !== env.G6_H5_INT08_L2_RESOURCE_INDEX_SHA256) missing.push('RESOURCE_INDEX_CHECKSUM_MISMATCH');
      resourceIndex = JSON.parse(bytes.toString('utf8'));
      const item = resourceIndex?.resources?.find(entry => entry?.product_id === env.G6_H5_INT08_L2_PRODUCT_ID);
      if (resourceIndex?.schemaVersion !== 1 || item?.disposable !== true || item?.registered_by_harness !== true || item?.mutation_authorized !== true || !Number.isSafeInteger(item?.initial_catalog_version) || !item?.display_name)
        missing.push('DISPOSABLE_PRODUCT_NOT_REGISTERED_AND_AUTHORIZED');
    } catch { missing.push('RESOURCE_INDEX_UNREADABLE'); }
  }
  return {
    status: missing.length ? 'BLOCKED_DEPENDENCY' : 'READY_C',
    missing: [...new Set(missing)],
    metadata: { approvedHostsSha256, resourceIndexSha256, releaseSha: env.G6_H5_INT08_L2_RELEASE_SHA ?? null, gatewaySha: env.G6_H5_INT08_L2_GATEWAY_SHA ?? null, serviceSha: env.G6_H5_INT08_L2_SERVICE_SHA ?? null },
    hosts,
    resourceIndex,
  };
}
