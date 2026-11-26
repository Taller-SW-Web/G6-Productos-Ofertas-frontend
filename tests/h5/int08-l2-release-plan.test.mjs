import test from 'node:test';
import assert from 'node:assert/strict';
import { INT08_L2_RELEASE_PLAN, preflightInt08L2Release } from './int08-l2-release-plan.mjs';

test('INT-08 L2 conserva login G7 y recorrido APIM en contrato opt-in con evidencia de release', () => {
  assert.equal(INT08_L2_RELEASE_PLAN.status, 'WAIT_C_G7_APIM');
  assert.deepEqual(INT08_L2_RELEASE_PLAN.steps.map(step => step.scenarioId), [
    'INT08-L2-G7-LOGIN', 'INT08-L2-APIM-CATALOG-READ', 'INT08-L2-APIM-202-NONTERMINAL',
  ]);
  for (const field of ['hostname_sha256', 'release_sha', 'gateway_sha', 'service_sha', 'correlation_id']) {
    assert.ok(INT08_L2_RELEASE_PLAN.requiredEvidenceFields.includes(field));
  }
  // The plan may name secret categories; it must not contain secret-shaped values.
  const serialized = JSON.stringify(INT08_L2_RELEASE_PLAN);
  assert.doesNotMatch(serialized, /https?:\/\//i);
  assert.doesNotMatch(serialized, /Authorization:\s*(?:Bearer|Basic)\s+\S+/i);
  assert.doesNotMatch(serialized, /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/);
  assert.doesNotMatch(serialized, /Cookie:\s*[^"\s,;]+/i);
});

test('INT-08 L2 falla cerrado, espera autorización de certificación y no emite llamadas', () => {
  const result = preflightInt08L2Release({});
  assert.equal(result.status, 'WAIT_C_G7_APIM');
  assert.equal(result.serviceCalls, 0);
  assert.ok(result.missing.includes('RELEASE_APPROVAL_REQUIRED'));
  assert.ok(result.missing.includes('OWNER_AUTHORIZED_IDENTITY_HARNESS_REQUIRED'));
});
