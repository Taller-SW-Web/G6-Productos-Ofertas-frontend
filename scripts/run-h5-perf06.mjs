import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertSafeEvidenceText } from "../tests/h5/evidence-security.mjs";
import { parsePerf06Run } from "../tests/h5/perf06-policy.mjs";

let reportPath = resolve("test-results/h5/perf06-preflight.json");
const block = async (reason, count = 1) => {
  const summary = { schemaVersion: 1, suite: "PERF06", status: "BLOCKED_DEPENDENCY", reason, blockerCount: count, serviceCalls: 0 };
  const serialized = `${JSON.stringify(summary, null, 2)}\n`;
  assertSafeEvidenceText(serialized);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, serialized, "utf8");
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
  "G6_H5_PERF06_READ_ONLY_ATTESTATION",
  "VITE_GATEWAY_ORIGIN",
  "VITE_DATA_MODE",
  "VITE_G6_ADMIN_API_ENABLED",
];
if (run.cacheMode === "cold") required.push("G6_H5_PERF06_COLD_ORACLE");
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

reportPath = resolve(
  "test-results/h5/perf06",
  `${process.env.G6_H5_PERF06_SUBJECT_SHA}-${run.subjectRole}-${run.sessions}VU-${run.durationSeconds}s-r${run.repetition}-${run.cacheMode}.json`,
);
const safeReporterPath = resolve("test-results/h5/perf06/reporter-summary.json");
await Promise.all([reportPath, safeReporterPath].map(async path => {
  try { await unlink(path); } catch (error) { if (error?.code !== "ENOENT") throw error; }
}));

const child = spawn(process.execPath, [
  "node_modules/playwright/cli.js",
  "test",
  "--config",
  "playwright.h5-perf06.config.ts",
], { stdio: ["ignore", "pipe", "pipe"], shell: false, env: { ...process.env, G6_H5_EVIDENCE_SUMMARY_PATH: safeReporterPath } });
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
  // Missing or unreadable reporter output becomes a safe summary failure below.
}
if (!runReport || !reporterSummary || reporterSummary.suite !== "H5" || reporterSummary.total !== 1 || reporterSummary.passed !== 1 || reporterSummary.skipped !== 0 || runReport.schemaVersion !== 1) {
  const summary = { schemaVersion: 1, suite: "PERF06", status: "FAIL", reason: "SAFE_METRICS_NOT_PRODUCED", capturedSubprocessBytes: capturedBytes, serviceCalls: "ATTEMPTED" };
  const serialized = `${JSON.stringify(summary, null, 2)}\n`;
  assertSafeEvidenceText(serialized);
  await writeFile(reportPath, serialized, "utf8");
  process.stdout.write(`PERF06 FAIL: safe_metrics_not_produced; captured_bytes=${capturedBytes}.\n`);
  process.exit(1);
}
const reportText = await readFile(reportPath, "utf8");
assertSafeEvidenceText(reportText);
process.stdout.write(`PERF06 ${runReport.status}: profile=${runReport.profile}; cache=${runReport.cacheMode}; requests=${runReport.http?.requests ?? 0}; journeys=${runReport.journeys?.completed ?? 0}; captured_bytes=${capturedBytes}.\n`);
if (exitCode !== 0 || runReport.status !== "MEASURED") process.exit(1);
