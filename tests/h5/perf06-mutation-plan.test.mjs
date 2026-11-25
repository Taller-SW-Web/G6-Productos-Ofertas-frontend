import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupRegisteredMutationResources, PERF06_MUTATION_PLAN, pollPreparationUntilTerminal, preflightPerf06Mutation, validatePerf06MutationPlan } from './perf06-mutation-plan.mjs';

test('PERF06_MUTATION fija edición, admisión asíncrona, polling terminal y vuelta a listado', () => {
  assert.deepEqual(validatePerf06MutationPlan(), { valid: true, requiredEnvironment: [
    'G6_H5_PERF06_MUTATION_HARNESS', 'G6_H5_PERF06_MUTATION_RESOURCE_INDEX',
    'G6_H5_PERF06_MUTATION_CLEANUP_ATTESTATION', 'G6_H5_PERF06_ISOLATED_HARNESS', 'G6_H5_PERF06_API_ORIGIN',
  ] });
  assert.deepEqual(PERF06_MUTATION_PLAN.profiles, ['1VU-60s', '5VU-180s', '20VU-300s']);
  assert.equal(PERF06_MUTATION_PLAN.setup.resourceScope, 'one unique disposable Catalog product per session');
  assert.equal(PERF06_MUTATION_PLAN.cleanup.timing, 'outside measured interval');
});

test('PERF06_MUTATION no hace escrituras si falta harness autorizado', () => {
  const result = preflightPerf06Mutation({});
  assert.equal(result.status, 'BLOCKED_DEPENDENCY');
  assert.equal(result.reason, 'MUTATION_HARNESS_OR_DISPOSABLE_RESOURCES_MISSING');
  assert.ok(result.missing.includes('G6_H5_PERF06_MUTATION_HARNESS'));
});

test('PERF06_MUTATION queda listo cuando el harness de loopback está acreditado', () => {
  const env = {
    G6_H5_PERF06_MUTATION_HARNESS: 'C:/harness/poma-mutation.mjs',
    G6_H5_PERF06_MUTATION_RESOURCE_INDEX: 'C:/harness/resources.json',
    G6_H5_PERF06_MUTATION_CLEANUP_ATTESTATION: 'C:/harness/cleanup.json',
    G6_H5_PERF06_ISOLATED_HARNESS: '1',
    G6_H5_PERF06_API_ORIGIN: 'http://127.0.0.1:54321',
  };
  assert.deepEqual(preflightPerf06Mutation(env), { status: 'READY_B', reason: 'OWNER_AUTHORIZED_ISOLATED_HARNESS_PRESENT', missing: [] });
});

test('PERF06_MUTATION no confunde HTTP 202 con estado terminal', () => {
  const invalid = structuredClone(PERF06_MUTATION_PLAN);
  invalid.measuredJourney[1] = { ...invalid.measuredJourney[1], assertion: 'HTTP 202 means COMPLETED terminal state' };
  assert.deepEqual(validatePerf06MutationPlan(invalid), { valid: false, reason: 'MUTATION_202_ORACLE_INVALID' });
});

test('PERF06_MUTATION acota polling y exige lectura terminal HTTP 200 después de 202', async () => {
  const states = [
    { httpStatus: 200, status: 'PENDING' },
    { httpStatus: 200, status: 'COMPLETED' },
  ];
  const result = await pollPreparationUntilTerminal(async () => states.shift(), { attempts: 3, intervalMs: 0 });
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.attempts, 2);
  await assert.rejects(() => pollPreparationUntilTerminal(async () => ({ httpStatus: 202, status: 'ACCEPTED' }), { attempts: 2, intervalMs: 0 }), /PREPARATION_POLL_HTTP_STATUS_INVALID/);
  await assert.rejects(() => pollPreparationUntilTerminal(async () => ({ httpStatus: 200, status: 'PENDING' }), { attempts: 2, intervalMs: 0 }), /PREPARATION_POLL_TERMINAL_STATE_TIMEOUT/);
});

test('PERF06_MUTATION cleanup solo toca productos registrados y repetirla es idempotente', async () => {
  const deleted = new Set();
  const calls = [];
  const resourceIndex = { schemaVersion: 1, resources: [{ product_id: '11111111-1111-4111-8111-111111111111', disposable: true, registered_by_harness: true }] };
  const result = await cleanupRegisteredMutationResources(resourceIndex, async id => { calls.push(id); deleted.add(id); });
  assert.deepEqual(result, { cleaned: ['11111111-1111-4111-8111-111111111111'], idempotent: true });
  assert.deepEqual(calls, ['11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111']);
  assert.equal(deleted.size, 1);
  await assert.rejects(() => cleanupRegisteredMutationResources({ schemaVersion: 1, resources: [{ product_id: '22222222-2222-4222-8222-222222222222', disposable: true }] }, async () => {}), /MUTATION_RESOURCE_NOT_HARNESS_REGISTERED/);
});
