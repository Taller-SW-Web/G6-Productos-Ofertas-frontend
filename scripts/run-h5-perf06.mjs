import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertSafeEvidenceText } from "../tests/h5/evidence-security.mjs";
import { parsePerf06Run, validateColdCacheAttestation } from "../tests/h5/perf06-policy.mjs";

let reportPath = resolve("test-results/h5/perf06-preflight.json");
const validSha = (value, length) => new RegExp(`^[0-9a-f]{${length}}$`, "i").test(value ?? "") ? value : null;
const docsSha = "c9e1e5c217616d28229fccf5315fb97a1ae061a9";
const sourceRevision = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const sourceSha = sourceRevision.status === 0 ? sourceRevision.stdout.trim() : null;
const datasetBytes = await readFile("tests/fixtures/h5/catalog/manifest.json");
const dataset = JSON.parse(datasetBytes.toString("utf8"));
const datasetSha = createHash("sha256").update(datasetBytes).digest("hex");
const toolVersions = { node: process.version, playwright: JSON.parse(await readFile("node_modules/@playwright/test/package.json", "utf8")).version };
const writeIndexedReport = async (path, report) => {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  assertSafeEvidenceText(serialized);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serialized, "utf8");
  const sha256 = createHash("sha256").update(Buffer.from(serialized, "utf8")).digest("hex");
  const index = {
    schemaVersion: 1,
    artifact: path.replaceAll("\\", "/").split("/").at(-1),
    sha256,
    sha256_artifact: sha256,
    case_id: "PERF-06",
    task_id: "POM-A05",
    h5_criterion: "H5-03",
    source_sha: validSha(report.source_sha ?? process.env.G6_H5_PERF06_SUBJECT_SHA, 40) ?? sourceSha,
    docs_sha: docsSha,
    dataset_seed: dataset.seed,
    dataset_checksum: datasetSha,
    artifact_uri: path.replaceAll("\\", "/"),
    caseId: "PERF06",
    h5Criterion: "POM-A05",
    repository: "Taller-SW-Web/G6-Productos-Ofertas-frontend",
    owner: "Poma",
    sourceSha: validSha(report.source_sha ?? process.env.G6_H5_PERF06_SUBJECT_SHA, 40) ?? sourceSha,
    harnessSha: validSha(process.env.G6_H5_PERF06_HARNESS_SHA, 40),
    datasetSha: validSha(process.env.G6_H5_PERF06_DATASET_SHA, 64),
    coldAttestationArtifact: report.evidence?.coldAttestation?.artifact ?? null,
    coldAttestationSha256: report.evidence?.coldAttestation?.sha256 ?? null,
    docsSha,
    timestampUtc: new Date().toISOString(),
    status: report.status,
    evidenceLevel: "L1",
  };
  const indexText = `${JSON.stringify(index, null, 2)}\n`;
  assertSafeEvidenceText(indexText);
  await writeFile(`${path}.index.json`, indexText, "utf8");
  return sha256;
};
const block = async (reason, count = 1) => {
  const summary = {
    schema_version: 1, case_id: "PERF-06", task_id: "POM-A05", h5_criterion: "H5-03",
    repository: "Taller-SW-Web/G6-Productos-Ofertas-frontend", repo: "Taller-SW-Web/G6-Productos-Ofertas-frontend", owner: "Poma",
    source_sha: sourceSha, docs_sha: docsSha, timestamp_utc: new Date().toISOString(), config_version: "h5-perf06-read-only-v2",
    dataset_seed: dataset.seed, dataset_checksum: datasetSha, tool_versions: toolVersions,
    environment: { platform: process.platform, architecture: process.arch, network_scope: "no target contacted; preflight only", service_calls: 0 },
    configuration: { profiles: [{ vus: 1, seconds: 60 }, { vus: 5, seconds: 180 }, { vus: 20, seconds: 300 }], repetitions_per_subject: 3, mode: "read-only", cold_requires_owner_attestation: true },
    test_command: "node scripts/run-h5-perf06.mjs", artifact_uri: "test-results/h5/perf06-preflight.json; digest index: test-results/h5/perf06-preflight.json.index.json",
    implementation_state: "DONE_A", execution_result: "BLOCKED_DEPENDENCY", evidence_level: "L1",
    suite: "PERF06", status: "BLOCKED_DEPENDENCY", reason, blocker_count: count, blockerCount: count, service_calls: 0, serviceCalls: 0,
    expected: { preflight_must_block_without_isolated_identities_and_harness: true, service_calls: 0 },
    observed: { preflight_status: "BLOCKED_DEPENDENCY", blocker_count: count, service_calls: 0, comparison_status: "INCONCLUSIVE" },
    negative_tests: ["Missing identity, isolated API, or service harness blocks before Playwright or network calls.", "A missing cache-state attestation cannot be reported as cold or measured."],
    known_limits: ["No authorized isolated Gateway, identity set, service harness, or candidate/baseline pair was supplied.", "No PERF-06 user journey or benchmark was executed."],
    blocker_owner: "Catalog/Gateway harness and identity owners",
    evidence: { case_id: "PERF-06", h5_criterion: "H5-03", docs_sha: docsSha, timestamp_utc: new Date().toISOString(), evidence_level: "L1" },
  };
  await writeIndexedReport(reportPath, summary);
  process.stdout.write(`PERF06 BLOCKED_DEPENDENCY: ${reason}; blockers=${count}; service_calls=0.\n`);
  process.exit(2);
};

let run;
try {
  run = parsePerf06Run(process.env);
} catch {
  await block("RUN_CONFIGURATION_OR_ISOLATION_MISSING");
}
const required = [
  "G6_H5_PERF06_APP_ROOT",
  "G6_H5_PERF06_STORAGE_STATE_DIR",
  "G6_H5_PERF06_IDENTITY_INDEX",
  "G6_H5_PERF06_API_ORIGIN",
  "G6_H5_PERF06_EVIDENCE_ROOT",
  "G6_H5_PERF06_SERVICE_SHA",
  "G6_H5_PERF06_READ_ONLY_ATTESTATION",
  "VITE_GATEWAY_ORIGIN",
  "VITE_DATA_MODE",
  "VITE_G6_ADMIN_API_ENABLED",
];
const missing = required.filter(name => !process.env[name]);
if (process.env.G6_H5_PERF06_READ_ONLY_ATTESTATION !== "1") missing.push("READ_ONLY_NOT_ATTESTED");
if (process.env.VITE_DATA_MODE !== "api" || process.env.VITE_G6_ADMIN_API_ENABLED !== "true") missing.push("REAL_API_MODE_NOT_SELECTED");
let apiOrigin;
try {
  apiOrigin = new URL(process.env.G6_H5_PERF06_API_ORIGIN ?? "");
  if (apiOrigin.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(apiOrigin.hostname)) missing.push("API_ORIGIN_NOT_LOOPBACK");
  if (new URL(process.env.VITE_GATEWAY_ORIGIN ?? "").origin !== apiOrigin.origin) missing.push("GATEWAY_ORIGIN_MISMATCH");
} catch {
  missing.push("API_ORIGIN_INVALID");
}
const appRoot = resolve(process.env.G6_H5_PERF06_APP_ROOT ?? ".");
const identityDirectory = resolve(process.env.G6_H5_PERF06_STORAGE_STATE_DIR ?? ".");
const identityIndexPath = resolve(process.env.G6_H5_PERF06_IDENTITY_INDEX ?? ".");
try {
  const manifestBytes = await readFile("tests/fixtures/h5/catalog/manifest.json");
  if (createHash("sha256").update(manifestBytes).digest("hex") !== process.env.G6_H5_PERF06_DATASET_SHA) missing.push("DATASET_SHA_MISMATCH");
  const actualHarnessSha = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (actualHarnessSha.status !== 0 || actualHarnessSha.stdout.trim() !== process.env.G6_H5_PERF06_HARNESS_SHA) missing.push("HARNESS_SHA_MISMATCH");
  const harnessStatus = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (harnessStatus.status !== 0 || harnessStatus.stdout.trim() !== "") missing.push("HARNESS_WORKTREE_NOT_CLEAN");
  const index = JSON.parse(await readFile(identityIndexPath, "utf8"));
  if (!Array.isArray(index.sessions) || index.sessions.length !== run.sessions) missing.push("IDENTITY_INDEX_COUNT_MISMATCH");
  const aliases = new Set();
  const stateHashes = new Set();
  for (let user = 1; user <= run.sessions; user += 1) {
    const id = `session-${String(user).padStart(3, "0")}`;
    const entry = index.sessions?.find(item => item.session_id === id);
    const bytes = await readFile(resolve(identityDirectory, `${id}.json`));
    const digest = createHash("sha256").update(bytes).digest("hex");
    const state = JSON.parse(bytes.toString("utf8"));
    if (!entry || entry.identity_alias !== `POMA_H5_USER_${String(user).padStart(3, "0")}` || entry.authorization !== "catalog-read" || entry.storage_state_sha256 !== digest || !(state.origins?.length || state.cookies?.length)) missing.push("TEST_IDENTITY_NOT_VERIFIED");
    aliases.add(entry?.identity_alias);
    stateHashes.add(digest);
  }
  if (aliases.size !== run.sessions || stateHashes.size !== run.sessions) missing.push("TEST_USERS_NOT_INDEPENDENT");
  await readFile(resolve(appRoot, "package-lock.json"));
  const subjectGit = spawnSync("git", ["-C", appRoot, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  let actualSubjectSha = subjectGit.status === 0 ? subjectGit.stdout.trim() : "";
  if (!actualSubjectSha) actualSubjectSha = (await readFile(resolve(appRoot, ".h5-subject-sha"), "utf8")).trim();
  if (actualSubjectSha !== process.env.G6_H5_PERF06_SUBJECT_SHA) missing.push("SUBJECT_SHA_MISMATCH");
} catch {
  missing.push("ISOLATED_APP_OR_TEST_IDENTITIES_UNAVAILABLE");
}
if (missing.length) await block("ISOLATED_HARNESS_OR_IDENTITY_MISSING", new Set(missing).size);

let coldAttestationSha256 = null;
let coldAttestationEvidence = null;
if (run.cacheMode === "cold") {
  try {
    const bytes = await readFile(resolve(process.env.G6_H5_PERF06_COLD_ORACLE_PATH));
    const text = bytes.toString("utf8");
    assertSafeEvidenceText(text);
    const attestation = JSON.parse(text);
    const apiOriginSha256 = createHash("sha256").update(apiOrigin.origin).digest("hex");
    const verified = validateColdCacheAttestation(attestation, {
      apiOriginSha256,
      subjectSha: process.env.G6_H5_PERF06_SUBJECT_SHA,
      serviceSha: process.env.G6_H5_PERF06_SERVICE_SHA,
    });
    if (!verified.valid) throw new Error(verified.reason);
    coldAttestationSha256 = createHash("sha256").update(bytes).digest("hex");
    const evidenceRoot = resolve(process.env.G6_H5_PERF06_EVIDENCE_ROOT);
    const rootInfo = await lstat(evidenceRoot);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("EVIDENCE_ROOT_INVALID");
    const attestationDirectory = resolve(evidenceRoot, "cold-attestations");
    await mkdir(attestationDirectory, { recursive: true });
    const attestationDirectoryInfo = await lstat(attestationDirectory);
    if (!attestationDirectoryInfo.isDirectory() || attestationDirectoryInfo.isSymbolicLink()) throw new Error("ATTESTATION_DIRECTORY_INVALID");
    const attestationName = `${run.subjectRole}-${process.env.G6_H5_PERF06_SUBJECT_SHA}-${run.sessions}VU-${run.durationSeconds}s-r${run.repetition}.json`;
    const attestationPath = resolve(attestationDirectory, attestationName);
    if (!attestationPath.startsWith(`${attestationDirectory}${process.platform === "win32" ? "\\" : "/"}`)) throw new Error("ATTESTATION_PATH_INVALID");
    await writeFile(attestationPath, bytes, { flag: "wx" });
    coldAttestationEvidence = { artifact: `cold-attestations/${attestationName}`, sha256: coldAttestationSha256 };
  } catch {
    const summary = { schemaVersion: 1, suite: "PERF06", status: "INCONCLUSIVE", reason: "SERVICE_CACHE_COLD_STATE_NOT_VERIFIED", serviceCalls: 0 };
    summary.evidence = { caseId: "PERF06", h5Criterion: "POM-A05", docsSha: "c9e1e5c217616d28229fccf5315fb97a1ae061a9", timestampUtc: new Date().toISOString(), evidenceLevel: "L1" };
    await writeIndexedReport(reportPath, summary);
    process.stdout.write("PERF06 INCONCLUSIVE: service_cache_cold_state_not_verified; service_calls=0.\n");
    process.exit(2);
  }
}

reportPath = resolve(
  "test-results/h5/perf06",
  `${process.env.G6_H5_PERF06_SUBJECT_SHA}-${run.subjectRole}-${run.sessions}VU-${run.durationSeconds}s-r${run.repetition}-${run.cacheMode}.json`,
);
const safeReporterPath = resolve("test-results/h5/perf06/reporter-summary.json");
await Promise.all([reportPath, safeReporterPath].map(async path => {
  try { await unlink(path); } catch (error) { if (error?.code !== "ENOENT") throw error; }
}));

const child = spawn(process.execPath, [
  "scripts/run-admin-performance.mjs",
  "--h5-perf06",
], { stdio: ["ignore", "pipe", "pipe"], shell: false, env: { ...process.env,
  G6_H5_EVIDENCE_SUMMARY_PATH: safeReporterPath,
  G6_H5_PERF06_COLD_ORACLE_VERIFIED: coldAttestationSha256 ? "1" : "0",
  G6_H5_PERF06_COLD_ORACLE_PATH_SHA256: coldAttestationSha256 ?? "",
} });
let capturedBytes = 0;
child.stdout.on("data", chunk => { capturedBytes += chunk.length; });
child.stderr.on("data", chunk => { capturedBytes += chunk.length; });
const exitCode = await new Promise((resolvePromise, reject) => {
  child.once("error", reject);
  child.once("close", resolvePromise);
});
let runReport;
try {
  const text = await readFile(reportPath, "utf8");
  assertSafeEvidenceText(text);
  runReport = JSON.parse(text);
} catch {
  runReport = null;
}
let reporterSummary = null;
try {
  const text = await readFile(safeReporterPath, "utf8");
  assertSafeEvidenceText(text);
  reporterSummary = JSON.parse(text);
} catch {
  // Missing or unreadable reporter output cannot qualify as PASS.
}
const reportMetricsValid = runReport?.schemaVersion === 1 && [
  runReport.journeys?.p50Ms, runReport.journeys?.p95Ms, runReport.journeys?.p99Ms,
  runReport.journeys?.throughputPerSecond, runReport.http?.requests,
  runReport.http?.requestsPerSecond, runReport.http?.responseBodyBytes,
  runReport.http?.transferredBytes, runReport.http?.unexpectedErrorPercent,
].every(Number.isFinite) && runReport.journeys.completed > 0 && runReport.http.requests > 0;
const reporterShapeValid = reporterSummary?.suite === "H5" && reporterSummary.status === "passed" && reporterSummary.total === 1 && reporterSummary.skipped === 0;
const status = reporterSummary?.failed > 0 || runReport?.status === "FAIL"
  ? "FAIL"
  : reporterShapeValid && reporterSummary.passed === 1 && reportMetricsValid && exitCode === 0
    ? runReport.status
    : "INCONCLUSIVE";
if (coldAttestationEvidence && runReport?.evidence) runReport.evidence.coldAttestation = coldAttestationEvidence;
if (status !== "MEASURED") {
  if (runReport) {
    runReport.status = status;
    runReport.reason = status === "FAIL" ? "PERF06_ASSERTION_FAILED" : "SAFE_METRICS_OR_TEST_DISCOVERY_INCOMPLETE";
    if (runReport.evidence) {
      runReport.evidence.observed.status = status;
      runReport.evidence.blockerOwner = status === "INCONCLUSIVE" ? "Vera or isolated-service owner" : null;
    }
    const serialized = `${JSON.stringify(runReport, null, 2)}\n`;
    assertSafeEvidenceText(serialized);
    await writeFile(reportPath, serialized, "utf8");
  } else {
    const summary = { schemaVersion: 1, suite: "PERF06", status, reason: status === "FAIL" ? "PERF06_ASSERTION_FAILED" : "SAFE_METRICS_OR_TEST_DISCOVERY_INCOMPLETE", capturedSubprocessBytes: capturedBytes, serviceCalls: "UNKNOWN" };
    const serialized = `${JSON.stringify(summary, null, 2)}\n`;
    assertSafeEvidenceText(serialized);
    await writeFile(reportPath, serialized, "utf8");
  }
}
const reportSha256 = await writeIndexedReport(reportPath, runReport ?? {
  schemaVersion: 1, suite: "PERF06", status, reason: "SAFE_METRICS_OR_TEST_DISCOVERY_INCOMPLETE",
  evidence: { caseId: "PERF06", h5Criterion: "POM-A05", docsSha: "c9e1e5c217616d28229fccf5315fb97a1ae061a9", timestampUtc: new Date().toISOString(), evidenceLevel: "L1", coldAttestation: coldAttestationEvidence },
});
process.stdout.write(`PERF06 ${runReport?.status ?? status}: profile=${runReport?.profile ?? "UNKNOWN"}; cache=${runReport?.cacheMode ?? "UNKNOWN"}; requests=${runReport?.http?.requests ?? 0}; journeys=${runReport?.journeys?.completed ?? 0}; artifact_sha256=${reportSha256}; captured_bytes=${capturedBytes}.\n`);
if (status !== "MEASURED") process.exit(status === "FAIL" ? 1 : 2);
