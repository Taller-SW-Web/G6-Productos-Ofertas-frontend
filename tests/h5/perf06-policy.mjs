import { createHash } from "node:crypto";

export const PERF06_PROFILES = Object.freeze({
  "1": Object.freeze({ sessions: 1, durationSeconds: 60 }),
  "5": Object.freeze({ sessions: 5, durationSeconds: 180 }),
  "20": Object.freeze({ sessions: 20, durationSeconds: 300 }),
});

export const PERF06_REPETITIONS = 3;

const sortKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  return value;
};

export function coldCacheProofDigest(proof) {
  return createHash("sha256").update(`${JSON.stringify(sortKeys(proof))}\n`, "utf8").digest("hex");
}

export function parsePerf06Run(env) {
  const profile = PERF06_PROFILES[env.G6_H5_PERF06_PROFILE];
  if (!profile) throw new Error("PERF06_PROFILE_INVALID");
  const repetition = Number(env.G6_H5_PERF06_REPETITION);
  if (!Number.isInteger(repetition) || repetition < 1 || repetition > PERF06_REPETITIONS)
    throw new Error("PERF06_REPETITION_INVALID");
  if (!['cold', 'warm'].includes(env.G6_H5_PERF06_CACHE_MODE)) throw new Error("PERF06_CACHE_MODE_INVALID");
  if (!['baseline', 'candidate', 'reference'].includes(env.G6_H5_PERF06_SUBJECT_ROLE)) throw new Error("PERF06_SUBJECT_ROLE_INVALID");
  for (const [name, pattern] of [
    ['G6_H5_PERF06_SUBJECT_SHA', /^[0-9a-f]{40}$/i],
    ['G6_H5_PERF06_HARNESS_SHA', /^[0-9a-f]{40}$/i],
    ['G6_H5_PERF06_SERVICE_SHA', /^[0-9a-f]{40}$/i],
    ['G6_H5_PERF06_DATASET_SHA', /^[0-9a-f]{64}$/i],
  ]) if (!pattern.test(env[name] ?? '')) throw new Error(`${name}_INVALID`);
  if (env.G6_H5_PERF06_ISOLATED_HARNESS !== '1') throw new Error('PERF06_ISOLATED_HARNESS_REQUIRED');
  if (!/^[A-Z0-9_-]{1,40}$/.test(env.G6_H5_PERF06_NETWORK_PROFILE ?? '')) throw new Error('PERF06_NETWORK_PROFILE_INVALID');
  return { ...profile, repetition, cacheMode: env.G6_H5_PERF06_CACHE_MODE, subjectRole: env.G6_H5_PERF06_SUBJECT_ROLE };
}

export function validateColdCacheAttestation(attestation, { apiOriginSha256, subjectSha, serviceSha, now = Date.now() } = {}) {
  if (!attestation || attestation.schemaVersion !== 1 || attestation.issuer !== 'POMA_H5_DISPOSABLE_SERVICE_HARNESS' || attestation.cacheState !== 'COLD')
    return { valid: false, reason: 'COLD_CACHE_ATTESTATION_SHAPE_INVALID' };
  const proof = attestation.proof;
  if (!proof || typeof proof !== 'object' || Array.isArray(proof) || proof.schemaVersion !== 1 || proof.issuer !== attestation.issuer || proof.cacheState !== attestation.cacheState || proof.serviceCacheState !== attestation.serviceCacheState || proof.apiOriginSha256 !== attestation.apiOriginSha256 || proof.subjectSha !== attestation.subjectSha || proof.sourceSha !== attestation.sourceSha || proof.serviceInstanceAlias !== attestation.serviceInstanceAlias || proof.attestedAtUtc !== attestation.attestedAtUtc)
    return { valid: false, reason: 'COLD_CACHE_PROOF_INVALID' };
  if (!['RESET', 'DISABLED'].includes(attestation.serviceCacheState) || attestation.apiOriginSha256 !== apiOriginSha256 || attestation.subjectSha !== subjectSha || attestation.sourceSha !== serviceSha)
    return { valid: false, reason: 'COLD_CACHE_ATTESTATION_SUBJECT_MISMATCH' };
  if (!/^[A-Z0-9_-]{1,60}$/.test(attestation.serviceInstanceAlias ?? '') || !/^[0-9a-f]{40}$/i.test(attestation.sourceSha ?? '') || !/^[0-9a-f]{64}$/i.test(attestation.proofSha256 ?? ''))
    return { valid: false, reason: 'COLD_CACHE_ATTESTATION_PROVENANCE_INVALID' };
  if (coldCacheProofDigest(proof) !== attestation.proofSha256)
    return { valid: false, reason: 'COLD_CACHE_PROOF_SHA_MISMATCH' };
  const timestamp = Date.parse(attestation.attestedAtUtc ?? '');
  if (!Number.isFinite(timestamp) || timestamp > now || now - timestamp > 15 * 60 * 1000)
    return { valid: false, reason: 'COLD_CACHE_ATTESTATION_STALE' };
  return { valid: true, reason: 'COLD_CACHE_ATTESTATION_VERIFIED' };
}

export function percentile(values, fraction) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(fraction * sorted.length) - 1);
  return Number(sorted[index].toFixed(2));
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return Number(value.toFixed(4));
}

export function aggregatePerf06Runs(runs) {
  if (!Array.isArray(runs) || runs.length !== PERF06_REPETITIONS)
    return { status: 'INCONCLUSIVE', reason: 'THREE_REPETITIONS_REQUIRED' };
  const first = runs[0];
  const sameSubject = runs.every((run) => run.subjectSha === first.subjectSha && run.harnessSha === first.harnessSha && run.datasetSha === first.datasetSha && run.profile === first.profile && run.cacheMode === first.cacheMode && run.status === 'MEASURED');
  const sameExecutionContext = runs.every((run) => run.subjectLockfileSha === first.subjectLockfileSha && run.apiOriginSha256 === first.apiOriginSha256 && JSON.stringify(run.environment) === JSON.stringify(first.environment));
  const repetitions = new Set(runs.map((run) => run.repetition));
  if (!sameSubject || !sameExecutionContext || repetitions.size !== PERF06_REPETITIONS || ![1, 2, 3].every((value) => repetitions.has(value)))
    return { status: 'INCONCLUSIVE', reason: 'REPETITION_PROVENANCE_MISMATCH' };
  const completeMetrics = runs.every((run) => [
    run.journeys?.p50Ms, run.journeys?.p95Ms, run.journeys?.p99Ms,
    run.journeys?.throughputPerSecond, run.http?.requestsPerSecond,
    run.http?.unexpectedErrorPercent, run.http?.requests,
    run.http?.requestBodyBytes, run.http?.responseBodyBytes, run.http?.transferredBytes,
  ].every(Number.isFinite) && run.journeys.p95Ms > 0 && run.journeys.throughputPerSecond > 0 && run.http.requests > 0 && run.http.requestsPerSecond > 0 && run.http.unexpectedErrorPercent >= 0);
  if (!completeMetrics) return { status: 'INCONCLUSIVE', reason: 'RUN_METRICS_MISSING_OR_NONFINITE' };
  const medianField = (selector) => median(runs.map(selector).filter(Number.isFinite));
  return {
    schemaVersion: 1,
    status: 'MEASURED',
    subjectRole: first.subjectRole,
    subjectSha: first.subjectSha,
    subjectLockfileSha: first.subjectLockfileSha,
    apiOriginSha256: first.apiOriginSha256,
    harnessSha: first.harnessSha,
    datasetSha: first.datasetSha,
    profile: first.profile,
    cacheMode: first.cacheMode,
    browser: first.environment.browser,
    environment: first.environment,
    runLabel: `POMA-H5-PERF06-${first.subjectRole}-${first.profile}-${first.cacheMode}-median-r1-r2-r3`,
    routeCount: 6,
    familyCount: 1,
    measurementScope: 'isolated real Catalog admin browser journeys; no shared services or production data',
    medianP50Ms: medianField((run) => run.journeys.p50Ms),
    medianP95Ms: medianField((run) => run.journeys.p95Ms),
    medianP99Ms: medianField((run) => run.journeys.p99Ms),
    medianJourneysPerSecond: medianField((run) => run.journeys.throughputPerSecond),
    medianRequestsPerSecond: medianField((run) => run.http.requestsPerSecond),
    medianRequestsPerJourney: medianField((run) => run.journeys.completed > 0 ? run.http.requests / run.journeys.completed : null),
    unexpectedErrorPercent: medianField((run) => run.http.unexpectedErrorPercent),
    failedJourneys: runs.reduce((sum, run) => sum + run.journeys.failed, 0),
    cancelledJourneys: runs.reduce((sum, run) => sum + run.journeys.cancelled, 0),
    familyUiSamples: [{
      family: 'Catalog',
      p50Ms: medianField((run) => run.journeys.p50Ms),
      p95Ms: medianField((run) => run.journeys.p95Ms),
      p99Ms: medianField((run) => run.journeys.p99Ms),
      requestCount: medianField((run) => run.http.requests),
      requestBodyBytes: medianField((run) => run.http.requestBodyBytes),
      responseBodyBytes: medianField((run) => run.http.responseBodyBytes),
      transferredBytes: medianField((run) => run.http.transferredBytes),
      journeysPerSecond: medianField((run) => run.journeys.throughputPerSecond),
      requestsPerJourney: medianField((run) => run.journeys.completed > 0 ? run.http.requests / run.journeys.completed : null),
    }],
    catalogListDatasetRuns: { series: [] },
  };
}

export function evaluatePerf06Run(run) {
  const cacheValid = run.cacheMode === 'warm'
    ? run.cacheHits > 0
    : run.coldOracleVerified && run.cacheHits === 0 && run.serviceWorkerHits === 0;
  const denominator = run.requestCount;
  const errorRate = denominator === 0 ? 1 : run.unexpectedErrors / denominator;
  const startSynchronized = Number.isFinite(run.startSkewMs) && run.startSkewMs <= 500;
  const durationValid = !Number.isFinite(run.requiredDurationMs) ||
    (Number.isFinite(run.minimumActiveSessionMs) && run.minimumActiveSessionMs >= run.requiredDurationMs * 0.95);
  const sessionConcurrencyValid = Number.isInteger(run.configuredSessions) && run.configuredSessions > 0 &&
    run.sessionsStarted === run.configuredSessions && run.maxSessionsActive === run.configuredSessions;
  const journeyOutcomeValid = Number.isInteger(run.completedJourneys) && run.completedJourneys > 0 &&
    Number.isInteger(run.failedJourneys) && run.failedJourneys === 0;
  const status = !cacheValid
    ? 'INCONCLUSIVE'
    : !startSynchronized
      ? 'INCONCLUSIVE'
      : !durationValid
        ? 'INCONCLUSIVE'
        : !sessionConcurrencyValid
          ? 'INCONCLUSIVE'
          : !journeyOutcomeValid
            ? 'FAIL'
            : denominator === 0 || errorRate >= 0.01 || run.unexpectedOrigins > 0
              ? 'FAIL'
              : 'MEASURED';
  return {
    status,
    cacheValid,
    startSynchronized,
    durationValid,
    sessionConcurrencyValid,
    journeyOutcomeValid,
    errorRate: Number(errorRate.toFixed(6)),
  };
}

export function comparePerf06({ baseline, candidate }) {
  if (!baseline || !candidate) return { status: 'INCONCLUSIVE', reason: 'SUBJECT_PAIR_MISSING' };
  if (baseline.harnessSha !== candidate.harnessSha || baseline.datasetSha !== candidate.datasetSha || baseline.profile !== candidate.profile || baseline.cacheMode !== candidate.cacheMode)
    return { status: 'INCONCLUSIVE', reason: 'RUN_CONFIGURATION_MISMATCH' };
  if (baseline.functionalChange !== true || candidate.functionalChange !== true)
    return { status: 'INCONCLUSIVE', reason: 'NO_FUNCTIONALLY_DISTINCT_COMPARABLE_CANDIDATE' };
  const finiteMetrics = [baseline.medianP95Ms, candidate.medianP95Ms, baseline.medianJourneysPerSecond, candidate.medianJourneysPerSecond,
    baseline.medianRequestsPerJourney, candidate.medianRequestsPerJourney, baseline.medianRequestsPerSecond, candidate.medianRequestsPerSecond,
    baseline.unexpectedErrorPercent, candidate.unexpectedErrorPercent].every(Number.isFinite);
  if (!finiteMetrics || baseline.medianP95Ms <= 0 || baseline.medianJourneysPerSecond <= 0 || baseline.medianRequestsPerJourney <= 0 || baseline.medianRequestsPerSecond <= 0)
    return { status: 'INCONCLUSIVE', reason: 'COMPARISON_METRICS_MISSING_OR_INVALID' };
  const requestPatternDelta = Math.abs((candidate.medianRequestsPerJourney - baseline.medianRequestsPerJourney) / baseline.medianRequestsPerJourney);
  const p95Pass = candidate.medianP95Ms <= baseline.medianP95Ms * 1.1;
  const journeyThroughputDeltaPercent = Number((((candidate.medianJourneysPerSecond - baseline.medianJourneysPerSecond) / baseline.medianJourneysPerSecond) * 100).toFixed(2));
  if (requestPatternDelta > 0.05) return {
    status: 'INCONCLUSIVE', reason: 'HTTP_RPS_GATE_NOT_COMPARABLE_REQUEST_PATTERN_DIFFERS',
    userExperience: { p95Pass, baselineMedianP95Ms: baseline.medianP95Ms, candidateMedianP95Ms: candidate.medianP95Ms, journeyThroughputDeltaPercent },
    httpRpsGate: 'INCONCLUSIVE', requestPatternDeltaPercent: Number((requestPatternDelta * 100).toFixed(2)),
  };
  const rpsPass = candidate.medianRequestsPerSecond >= baseline.medianRequestsPerSecond * 0.9;
  const errorPass = baseline.unexpectedErrorPercent < 1 && candidate.unexpectedErrorPercent < 1;
  return {
    status: p95Pass && rpsPass && errorPass ? 'PASS' : 'FAIL',
    p95Pass,
    rpsPass,
    errorPass,
    journeyThroughputDeltaPercent,
    requestPatternDeltaPercent: Number((requestPatternDelta * 100).toFixed(2)),
  };
}

export function validateExistingComparatorReport(report) {
  if (!report || report.schemaVersion !== 1 || !Array.isArray(report.familyComparison)) return { valid: false, reason: 'COMPARATOR_REPORT_MISSING_OR_INVALID' };
  const catalog = report.familyComparison.find((sample) => sample.family === 'Catalog');
  const metrics = [catalog?.baseline?.p95Ms, catalog?.optimized?.p95Ms, catalog?.baseline?.requests, catalog?.optimized?.requests,
    catalog?.baseline?.requestBodyBytes, catalog?.optimized?.requestBodyBytes, catalog?.baseline?.responseBodyBytes, catalog?.optimized?.responseBodyBytes];
  if (!catalog || !metrics.every(Number.isFinite) || catalog.baseline.p95Ms <= 0 || catalog.optimized.p95Ms <= 0 || catalog.baseline.requests <= 0 || catalog.optimized.requests <= 0)
    return { valid: false, reason: 'COMPARATOR_METRIC_MISSING_OR_INVALID' };
  return { valid: true };
}
