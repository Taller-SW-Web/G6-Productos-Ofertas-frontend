export const PERF06_MUTATION_PLAN = Object.freeze({
  schemaVersion: 1,
  caseId: 'PERF06_MUTATION',
  profiles: Object.freeze(['1VU-60s', '5VU-180s', '20VU-300s']),
  setup: Object.freeze({
    identity: 'POMA_H5_SYNTHETIC_MUTATION',
    resourceScope: 'one unique disposable Catalog product per session',
    ownership: 'Catalog/Poma harness creates and registers resources before the measured interval',
    concurrency: 'each session has a distinct product_id, catalog_version, operation_id and correlation_id',
  }),
  measuredJourney: Object.freeze([
    Object.freeze({ operationId: 'actualizarProducto', method: 'PATCH', path: '/api/v1/productos/{productoId}', assertion: 'response is 200 and catalog_version advances exactly once' }),
    Object.freeze({ operationId: 'reintentarPreparacionProducto', method: 'POST', path: '/api/v1/productos/{productoId}/preparacion/reintentar', assertion: 'response is 202 admission with operation_id and correlation_id; never terminal' }),
    Object.freeze({ operationId: 'obtenerPreparacionProducto', method: 'GET', path: '/api/v1/productos/{productoId}/preparacion', assertion: 'bounded polling reaches a contract terminal state or the case fails' }),
    Object.freeze({ operationId: 'listarProductosAdministracion', method: 'GET', path: '/api/v1/productos/administracion', assertion: 'edited product/version is present in the return-to-list result' }),
  ]),
  cleanup: Object.freeze({
    timing: 'outside measured interval',
    requirement: 'idempotent owner-harness cleanup of only registered product IDs, invoked in finally even after partial setup',
    verify: 'repeat cleanup and prove every registered resource is absent; no shared/operational data',
  }),
});

const requiredEnvironment = Object.freeze([
  'G6_H5_PERF06_MUTATION_HARNESS',
  'G6_H5_PERF06_MUTATION_RESOURCE_INDEX',
  'G6_H5_PERF06_MUTATION_CLEANUP_ATTESTATION',
  'G6_H5_PERF06_ISOLATED_HARNESS',
  'G6_H5_PERF06_API_ORIGIN',
]);

export function validatePerf06MutationPlan(plan = PERF06_MUTATION_PLAN) {
  if (plan?.caseId !== 'PERF06_MUTATION' || plan?.measuredJourney?.length !== 4) return { valid: false, reason: 'MUTATION_PLAN_SHAPE_INVALID' };
  const [edit, admission, read, list] = plan.measuredJourney;
  if (edit.method !== 'PATCH' || admission.method !== 'POST' || read.method !== 'GET' || list.method !== 'GET') return { valid: false, reason: 'MUTATION_OPERATION_SEQUENCE_INVALID' };
  if (!admission.assertion.includes('202') || !admission.assertion.includes('never terminal')) return { valid: false, reason: 'MUTATION_202_ORACLE_INVALID' };
  if (plan.cleanup?.timing !== 'outside measured interval' || !plan.cleanup.requirement.includes('idempotent')) return { valid: false, reason: 'MUTATION_CLEANUP_POLICY_INVALID' };
  return { valid: true, requiredEnvironment: [...requiredEnvironment] };
}

export function preflightPerf06Mutation(env = process.env) {
  const plan = validatePerf06MutationPlan();
  if (!plan.valid) return { status: 'FAIL', reason: plan.reason, missing: [] };
  const missing = requiredEnvironment.filter(name => !env[name]);
  if (env.G6_H5_PERF06_ISOLATED_HARNESS !== '1') missing.push('ISOLATED_HARNESS_NOT_ATTESTED');
  const origin = env.G6_H5_PERF06_API_ORIGIN ?? '';
  if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(origin)) missing.push('API_ORIGIN_NOT_LOOPBACK');
  if (missing.length) return { status: 'BLOCKED_DEPENDENCY', reason: 'MUTATION_HARNESS_OR_DISPOSABLE_RESOURCES_MISSING', missing: [...new Set(missing)] };
  return { status: 'READY_B', reason: 'OWNER_AUTHORIZED_ISOLATED_HARNESS_PRESENT', missing: [] };
}

export async function pollPreparationUntilTerminal(readPreparation, {
  attempts = 8,
  intervalMs = 100,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  if (typeof readPreparation !== 'function' || !Number.isInteger(attempts) || attempts < 1 || attempts > 20 || !Number.isFinite(intervalMs) || intervalMs < 0 || intervalMs > 5_000)
    throw new Error('PREPARATION_POLL_CONFIGURATION_INVALID');
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const observed = await readPreparation();
    if (observed?.httpStatus !== 200) throw new Error('PREPARATION_POLL_HTTP_STATUS_INVALID');
    if (observed?.status === 'COMPLETED' || observed?.status === 'REJECTED') return { status: observed.status, attempts: attempt, observed };
    if (observed?.status !== 'PENDING') throw new Error('PREPARATION_POLL_DOMAIN_STATE_INVALID');
    if (attempt < attempts) await sleep(intervalMs);
  }
  throw new Error('PREPARATION_POLL_TERMINAL_STATE_TIMEOUT');
}

export async function cleanupRegisteredMutationResources(resourceIndex, cleanupOne) {
  if (!resourceIndex || resourceIndex.schemaVersion !== 1 || !Array.isArray(resourceIndex.resources) || typeof cleanupOne !== 'function')
    throw new Error('MUTATION_RESOURCE_INDEX_INVALID');
  const seen = new Set();
  const cleaned = [];
  for (const item of resourceIndex.resources) {
    const id = item?.product_id;
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) || item.disposable !== true || !item.registered_by_harness)
      throw new Error('MUTATION_RESOURCE_NOT_HARNESS_REGISTERED');
    if (seen.has(id)) throw new Error('MUTATION_RESOURCE_DUPLICATE');
    seen.add(id);
    await cleanupOne(id);
    await cleanupOne(id);
    cleaned.push(id);
  }
  return { cleaned, idempotent: true };
}
