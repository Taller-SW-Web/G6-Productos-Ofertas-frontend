import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertSafeEvidenceText } from "../tests/h5/evidence-security.mjs";
import { preflightInt08L1 } from "../tests/h5/int08-l1-coverage.mjs";

const reportPath = resolve("test-results/h5/int08-l1-summary.json");
const independentReportPath = resolve("test-results/h5/int08-l1-independent-inner.json");
const integralReportPath = resolve("test-results/h5/int08-l1-integral-inner.json");
const docsSha = "c9e1e5c217616d28229fccf5315fb97a1ae061a9";
const isolated = process.env.G6_H5_INT08_ISOLATED_HARNESS === "1";
const loopbackOrigin = (() => {
  try {
    const url = new URL(process.env.CATALOG_REAL_BROWSER_ORIGIN ?? "");
    return url.protocol === "http:" && url.hostname === "127.0.0.1" && Number(url.port) >= 1024;
  } catch { return false; }
})();
const integralVariables = [
  "CATALOG_REAL_JWT", "CATALOG_REAL_FORBIDDEN_JWT", "CATALOG_REAL_PRODUCT_ID",
  "CATALOG_REAL_VARIANT_PRODUCT_ID", "CATALOG_REAL_VARIANT_ID", "CATALOG_REAL_VARIANT_SKU",
  "CATALOG_REAL_CONCURRENT_VARIANT_ID", "CATALOG_REAL_CONCURRENT_VARIANT_SKU",
];
const integralMissing = [
  ...(!isolated ? ["G6_H5_INT08_ISOLATED_HARNESS=1"] : []),
  ...(!loopbackOrigin ? ["CATALOG_REAL_BROWSER_ORIGIN (loopback requerido)"] : []),
  ...integralVariables.filter(key => !process.env[key]),
];
const independentPreflight = preflightInt08L1(process.env);
const independentReadiness = new Map(independentPreflight.map(item => [item.id, item]));

await mkdir(dirname(reportPath), { recursive: true });

async function runPlaywright(spec, summaryPath) {
  try { await unlink(summaryPath); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const child = spawn(process.execPath, [
    "node_modules/playwright/cli.js", "test", "--config", "playwright.h5-int08-l1.config.ts",
    spec, "--workers=1",
  ], {
    stdio: ["ignore", "pipe", "pipe"], shell: false,
    env: { ...process.env, G6_H5_EVIDENCE_SUMMARY_PATH: summaryPath },
  });
  let capturedBytes = 0;
  child.stdout.on("data", chunk => { capturedBytes += chunk.length; });
  child.stderr.on("data", chunk => { capturedBytes += chunk.length; });
  const exitCode = await new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", resolvePromise);
  });
  try {
    const bytes = await readFile(summaryPath);
    const text = bytes.toString("utf8");
    assertSafeEvidenceText(text);
    return { summary: JSON.parse(text), sha256: createHash("sha256").update(bytes).digest("hex"), capturedBytes, exitCode };
  } catch {
    return { summary: null, sha256: null, capturedBytes, exitCode };
  }
}

function mapCases(run, expectedTotal, fallbackId, blockers = []) {
  if (!run.summary || run.summary.total !== expectedTotal || run.summary.cases?.length !== expectedTotal) {
    return [{ scenario_id: fallbackId, status: "FAIL", execution: "DISCOVERY_MISMATCH", blockers: [] }];
  }
  return run.summary.cases.map(item => ({
    scenario_id: item.scenario_id,
    status: item.status === "PASS" ? "PASS" : item.status === "FAIL" || item.status === "TIMED_OUT" || item.status === "INTERRUPTED" ? "FAIL" : "BLOCKED_DEPENDENCY",
    execution: item.status === "PASS" ? "EXECUTED" : item.status === "FAIL" ? "EXECUTED_FAILED" : "NOT_EXECUTED",
    evidence_level: item.evidence_level,
    blockers: item.status === "SKIPPED" ? independentReadiness.get(item.scenario_id)?.blockers ?? blockers : [],
  }));
}

const independent = await runPlaywright("tests/catalog-http-real-l1-independent.h5.pw.ts", independentReportPath);
const cases = mapCases(independent, 4, "INT08-L1-INDEPENDENT-DISCOVERY", [
  ...(!isolated ? ["isolated local service harness not attested"] : []),
  ...(!loopbackOrigin ? ["loopback Browser-to-Gateway origin absent or invalid"] : []),
]);
const innerArtifacts = [{ path: "test-results/h5/int08-l1-independent-inner.json", sha256: independent.sha256 }];

if (integralMissing.length === 0) {
  const integral = await runPlaywright("tests/catalog-http-real.spec.ts", integralReportPath);
  const integralCases = mapCases(integral, 1, "INT08-L1-INTEGRAL-DISCOVERY", integralMissing);
  for (const item of integralCases) item.scenario_id = "INT08-L1-INTEGRAL";
  cases.push(...integralCases);
  innerArtifacts.push({ path: "test-results/h5/int08-l1-integral-inner.json", sha256: integral.sha256 });
} else {
  cases.push({
    scenario_id: "INT08-L1-INTEGRAL",
    status: "BLOCKED_DEPENDENCY",
    execution: "NOT_EXECUTED",
    evidence_level: "L1",
    blockers: integralMissing,
  });
}

const passed = cases.filter(item => item.status === "PASS").length;
const failed = cases.filter(item => item.status === "FAIL").length;
const blocked = cases.filter(item => item.status === "BLOCKED_DEPENDENCY").length;
const status = failed > 0 ? "FAIL" : blocked > 0 ? passed > 0 ? "PARTIAL_B" : "BLOCKED_DEPENDENCY" : "DONE_B";
const sourceResult = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const sourceSha = sourceResult.status === 0 ? sourceResult.stdout.trim() : null;
const npmResult = spawnSync(process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npm",
  process.platform === "win32" ? ["/d", "/s", "/c", "npm --version"] : ["--version"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
const summary = {
  schema_version: 1,
  case_id: "INT-08-L1",
  task_id: "POM-A01",
  h5_criterion: "H5-02",
  repository: "Taller-SW-Web/G6-Productos-Ofertas-frontend",
  owner: "Poma",
  source_sha: sourceSha,
  docs_sha: docsSha,
  timestamp_utc: new Date().toISOString(),
  config_version: "h5-int08-partial-l1-v1",
  tool_versions: { node: process.version, npm: npmResult.status === 0 ? npmResult.stdout.trim() : "UNAVAILABLE" },
  test_command: "node scripts/run-h5-int08-l1.mjs",
  suite: "INT08-L1",
  status,
  discovered: (independent.summary?.total ?? 0) + (integralMissing.length === 0 ? 1 : 0),
  executed: cases.filter(item => item.execution === "EXECUTED" || item.execution === "EXECUTED_FAILED").length,
  passed,
  failed,
  blocked,
  skipped: cases.filter(item => item.execution === "NOT_EXECUTED").length,
  cases,
  case_prerequisites: independentPreflight,
  artifacts: innerArtifacts,
  environment: { loopback_harness_attested: isolated, loopback_origin_valid: loopbackOrigin, no_shared_services: true },
  limitations: ["El E2E integral se conserva y solo corre si tiene todos sus prerrequisitos.", "Los casos SKIPPED se registran como BLOCKED_DEPENDENCY, nunca como PASS."],
};
const serialized = `${JSON.stringify(summary, null, 2)}\n`;
assertSafeEvidenceText(serialized);
await writeFile(reportPath, serialized, "utf8");
const reportSha = createHash("sha256").update(Buffer.from(serialized, "utf8")).digest("hex");
const index = {
  schema_version: 1,
  artifact: "test-results/h5/int08-l1-summary.json",
  sha256: reportSha,
  source_sha: sourceSha,
  docs_sha: docsSha,
  case_id: summary.case_id,
  task_id: summary.task_id,
  h5_criterion: summary.h5_criterion,
  status,
};
const indexText = `${JSON.stringify(index, null, 2)}\n`;
assertSafeEvidenceText(indexText);
await writeFile(`${reportPath}.index.json`, indexText, "utf8");
process.stdout.write(`INT08 L1 ${status}: discovered=${summary.discovered}; executed=${summary.executed}; passed=${passed}; failed=${failed}; blocked=${blocked}; evidence_sha256=${reportSha}.\n`);
if (status === "FAIL") process.exit(1);
if (blocked > 0) process.exit(2);
