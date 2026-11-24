import test from 'node:test';
import assert from 'node:assert/strict';
import { PERF06_MUTATION_PLAN, preflightPerf06Mutation, validatePerf06MutationPlan } from './perf06-mutation-plan.mjs';

test('PERF06_MUTATION fija edición, admisión asíncrona, polling terminal y vuelta a listado', () => {
  assert.deepEqual(validatePerf06MutationPlan(), { valid: true, requiredEnvironment: [
    'G6_H5_PERF06_MUTATION_HARNESS', 'G6_H5_PERF06_MUTATION_RESOURCE_INDEX',
    'G6_H5_PERF06_MUTATION_CLEANUP_ATTESTATION', 'G6_H5_PERF06_ISOLATED_HARNESS', 'G6_H5_PERF06_API_ORIGIN',
  ] });
  assert.deepEqual(PERF06_MUTATION_PLAN.profiles, ['1VU-60s', '5VU-180s', '20VU-300s']);
  assert.equal(PERF06_MUTATION_PLAN.setup.resourceScope, 'one unique disposable Catalog product per session');
  assert.equal(PERF06_MUTATION_PLAN.cleanup.timing, 'outside measured interval');
});

test('PERF06_MUTATION no hace escrituras si falta harness y cleanup idempotente', () => {
  const result = preflightPerf06Mutation({});
  assert.equal(result.status, 'BLOCKED_DEPENDENCY');
  assert.equal(result.reason, 'MUTATION_HARNESS_OR_DISPOSABLE_RESOURCES_MISSING');
  assert.ok(result.missing.includes('G6_H5_PERF06_MUTATION_HARNESS'));
});

test('PERF06_MUTATION no confunde HTTP 202 con estado terminal', () => {
  const invalid = structuredClone(PERF06_MUTATION_PLAN);
  invalid.measuredJourney[1] = { ...invalid.measuredJourney[1], assertion: 'HTTP 202 means COMPLETED terminal state' };
  assert.deepEqual(validatePerf06MutationPlan(invalid), { valid: false, reason: 'MUTATION_202_ORACLE_INVALID' });
});
