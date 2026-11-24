import test from "node:test";
import assert from "node:assert/strict";
import { aggregatePerf06Runs, coldCacheProofDigest, comparePerf06, evaluatePerf06Run, parsePerf06Run, PERF06_PROFILES, PERF06_REPETITIONS, percentile, validateColdCacheAttestation, validateExistingComparatorReport } from "./perf06-policy.mjs";

const validEnv = {
  G6_H5_PERF06_PROFILE: "1",
  G6_H5_PERF06_REPETITION: "1",
  G6_H5_PERF06_CACHE_MODE: "warm",
  G6_H5_PERF06_SUBJECT_ROLE: "baseline",
  G6_H5_PERF06_SUBJECT_SHA: "a".repeat(40),
  G6_H5_PERF06_HARNESS_SHA: "b".repeat(40),
  G6_H5_PERF06_SERVICE_SHA: "d".repeat(40),
  G6_H5_PERF06_DATASET_SHA: "c".repeat(64),
  G6_H5_PERF06_ISOLATED_HARNESS: "1",
  G6_H5_PERF06_COLD_ORACLE_PATH: "attestation.json",
  G6_H5_PERF06_NETWORK_PROFILE: "LOCAL_LOOPBACK",
};

test("declares three exact profiles and three repetitions", () => {
  assert.deepEqual(PERF06_PROFILES, {
    "1": { sessions: 1, durationSeconds: 60 },
    "5": { sessions: 5, durationSeconds: 180 },
    "20": { sessions: 20, durationSeconds: 300 },
  });
  assert.equal(PERF06_REPETITIONS, 3);
});

test("rejects absent identity, isolation, cache oracle, or malformed run provenance", () => {
  assert.throws(() => parsePerf06Run({ ...validEnv, G6_H5_PERF06_ISOLATED_HARNESS: undefined }), /ISOLATED/);
  assert.throws(() => parsePerf06Run({ ...validEnv, G6_H5_PERF06_SUBJECT_SHA: "short" }), /SUBJECT_SHA_INVALID/);
  assert.throws(() => parsePerf06Run({ ...validEnv, G6_H5_PERF06_REPETITION: "4" }), /REPETITION/);
});

test("verifies a fresh service-cache attestation bound to the API origin and both subjects", () => {
  const context = { apiOriginSha256: "e".repeat(64), subjectSha: "a".repeat(40), serviceSha: "d".repeat(40), now: Date.parse("2026-11-23T12:00:00Z") };
  const fields = { schemaVersion: 1, issuer: "POMA_H5_DISPOSABLE_SERVICE_HARNESS", cacheState: "COLD", serviceCacheState: "RESET", apiOriginSha256: context.apiOriginSha256, subjectSha: context.subjectSha, sourceSha: context.serviceSha, serviceInstanceAlias: "CATALOG_H5_LOCAL", attestedAtUtc: "2026-11-23T11:55:00Z" };
  const makeAttestation = (proofFields) => ({ ...proofFields, proof: proofFields, proofSha256: coldCacheProofDigest(proofFields) });
  const attestation = makeAttestation(fields);
  assert.equal(validateColdCacheAttestation(attestation, context).valid, true);
  assert.equal(validateColdCacheAttestation(makeAttestation({ ...fields, apiOriginSha256: "0".repeat(64) }), context).reason, "COLD_CACHE_ATTESTATION_SUBJECT_MISMATCH");
  assert.equal(validateColdCacheAttestation(makeAttestation({ ...fields, sourceSha: "0".repeat(40) }), context).reason, "COLD_CACHE_ATTESTATION_SUBJECT_MISMATCH");
  assert.equal(validateColdCacheAttestation(makeAttestation({ ...fields, attestedAtUtc: "2026-11-23T11:00:00Z" }), context).reason, "COLD_CACHE_ATTESTATION_STALE");
  assert.equal(validateColdCacheAttestation({ ...attestation, proof: { ...fields, serviceCacheState: "DISABLED" } }, context).reason, "COLD_CACHE_PROOF_INVALID");
  assert.equal(validateColdCacheAttestation({ ...attestation, proofSha256: "f".repeat(64) }, context).reason, "COLD_CACHE_PROOF_SHA_MISMATCH");
});

test("requires a verified observed cold/warm cache state and preserves error denominators", () => {
  const sync = {
    startSkewMs: 10, minimumActiveSessionMs: 57_000, requiredDurationMs: 60_000,
    configuredSessions: 1, sessionsStarted: 1, maxSessionsActive: 1, completedJourneys: 1, failedJourneys: 0,
  };
  assert.deepEqual(evaluatePerf06Run({ ...sync, cacheMode: "warm", cacheHits: 0, serviceWorkerHits: 0, requestCount: 100, unexpectedErrors: 0, unexpectedOrigins: 0 }), {
    status: "INCONCLUSIVE", cacheValid: false, startSynchronized: true, durationValid: true,
    sessionConcurrencyValid: true, journeyOutcomeValid: true, errorRate: 0,
  });
  assert.equal(evaluatePerf06Run({ ...sync, cacheMode: "warm", cacheHits: 3, serviceWorkerHits: 0, requestCount: 100, unexpectedErrors: 1, unexpectedOrigins: 0 }).status, "FAIL");
  assert.equal(evaluatePerf06Run({ ...sync, cacheMode: "cold", coldOracleVerified: true, firstNetworkReads: 1, firstCacheHits: 1, cacheHits: 5, serviceWorkerHits: 0, requestCount: 100, unexpectedErrors: 0, unexpectedOrigins: 0 }).status, "INCONCLUSIVE");
  assert.equal(evaluatePerf06Run({ ...sync, cacheMode: "cold", coldOracleVerified: true, cacheHits: 0, serviceWorkerHits: 1, requestCount: 100, unexpectedErrors: 0, unexpectedOrigins: 0 }).status, "INCONCLUSIVE");
  assert.equal(evaluatePerf06Run({ ...sync, cacheMode: "cold", coldOracleVerified: true, firstNetworkReads: 1, firstCacheHits: 0, cacheHits: 5, serviceWorkerHits: 0, requestCount: 100, unexpectedErrors: 0, unexpectedOrigins: 0 }).status, "MEASURED");
  assert.equal(evaluatePerf06Run({ ...sync, maxSessionsActive: 0, cacheMode: "warm", cacheHits: 3, serviceWorkerHits: 0, requestCount: 100, unexpectedErrors: 0, unexpectedOrigins: 0 }).status, "INCONCLUSIVE");
  assert.equal(evaluatePerf06Run({ ...sync, failedJourneys: 1, completedJourneys: 0, cacheMode: "warm", cacheHits: 3, serviceWorkerHits: 0, requestCount: 100, unexpectedErrors: 0, unexpectedOrigins: 0 }).status, "FAIL");
  assert.equal(evaluatePerf06Run({ ...sync, completedJourneys: 0, cacheMode: "warm", cacheHits: 3, serviceWorkerHits: 0, requestCount: 100, unexpectedErrors: 0, unexpectedOrigins: 0 }).status, "FAIL");
  assert.equal(evaluatePerf06Run({ ...sync, minimumActiveSessionMs: 56_999, cacheMode: "warm", cacheHits: 3, serviceWorkerHits: 0, requestCount: 100, unexpectedErrors: 0, unexpectedOrigins: 0 }).status, "INCONCLUSIVE");
  assert.equal(evaluatePerf06Run({ ...sync, startSkewMs: 501, cacheMode: "warm", cacheHits: 2, serviceWorkerHits: 0, requestCount: 100, unexpectedErrors: 0, unexpectedOrigins: 0 }).status, "INCONCLUSIVE");
});

test("percentiles are stable and comparison stays inconclusive without a functional candidate", () => {
  assert.equal(percentile([3, 1, 2], 0.95), 3);
  assert.deepEqual(comparePerf06({ baseline: {}, candidate: {} }), { status: "INCONCLUSIVE", reason: "NO_FUNCTIONALLY_DISTINCT_COMPARABLE_CANDIDATE" });
  const baseline = { harnessSha: "a", datasetSha: "b", profile: "1", cacheMode: "warm", functionalChange: true, medianP95Ms: 100, medianJourneysPerSecond: 1, medianRequestsPerJourney: 40, medianRequestsPerSecond: 100, unexpectedErrorPercent: 0 };
  const candidate = { ...baseline, medianP95Ms: 110, medianJourneysPerSecond: 0.9, medianRequestsPerSecond: 90, unexpectedErrorPercent: 0.99 };
  assert.equal(comparePerf06({ baseline, candidate }).status, "PASS");
  const changedRequests = comparePerf06({ baseline, candidate: { ...candidate, medianRequestsPerJourney: 45 } });
  assert.equal(changedRequests.status, "INCONCLUSIVE");
  assert.equal(changedRequests.reason, "HTTP_RPS_GATE_NOT_COMPARABLE_REQUEST_PATTERN_DIFFERS");
  assert.equal(changedRequests.userExperience.p95Pass, true);
  assert.equal(comparePerf06({ baseline, candidate: { ...candidate, medianP95Ms: Number.NaN } }).reason, "COMPARISON_METRICS_MISSING_OR_INVALID");
  assert.equal(comparePerf06({ baseline, candidate: { ...candidate, unexpectedErrorPercent: 1 } }).status, "FAIL");
});

test("rejects failed or incomplete output from the existing administrative comparator", () => {
  assert.deepEqual(validateExistingComparatorReport(null), { valid: false, reason: "COMPARATOR_REPORT_MISSING_OR_INVALID" });
  const incomplete = { schemaVersion: 1, familyComparison: [{ family: "Catalog", baseline: { p95Ms: 1, requests: 2, requestBodyBytes: 1, responseBodyBytes: 1 }, optimized: { p95Ms: 1, requests: 2, requestBodyBytes: 1 } }] };
  assert.deepEqual(validateExistingComparatorReport(incomplete), { valid: false, reason: "COMPARATOR_METRIC_MISSING_OR_INVALID" });
  const valid = { ...incomplete, familyComparison: [{ ...incomplete.familyComparison[0], optimized: { p95Ms: 1, requests: 2, requestBodyBytes: 1, responseBodyBytes: 1 } }] };
  assert.deepEqual(validateExistingComparatorReport(valid), { valid: true });
});

test("aggregates exactly three matched repetitions into the existing comparator shape", () => {
  const runs = [1, 2, 3].map(repetition => ({
    repetition, status: "MEASURED", subjectRole: "baseline", subjectSha: "a", harnessSha: "b", datasetSha: "c",
    profile: "1VU-60s", cacheMode: "warm", environment: { browser: "Chromium test" },
    journeys: { p50Ms: 10 * repetition, p95Ms: 20 * repetition, p99Ms: 30 * repetition, throughputPerSecond: 2 / repetition, failed: 0, cancelled: 0 },
    http: { requestsPerSecond: 4 / repetition, unexpectedErrorPercent: 0, requests: 40, requestBodyBytes: 10, responseBodyBytes: 100, transferredBytes: 130 },
  }));
  const result = aggregatePerf06Runs(runs);
  assert.equal(result.status, "MEASURED");
  assert.equal(result.medianP95Ms, 40);
  assert.equal(result.medianJourneysPerSecond, 1);
  assert.equal(result.familyUiSamples[0].family, "Catalog");
  assert.deepEqual(result.catalogListDatasetRuns, { series: [] });
  assert.equal(aggregatePerf06Runs(runs.slice(1)).reason, "THREE_REPETITIONS_REQUIRED");
  assert.equal(aggregatePerf06Runs(runs.map((run, index) => index ? { ...run, harnessSha: "different" } : run)).reason, "REPETITION_PROVENANCE_MISMATCH");
});
