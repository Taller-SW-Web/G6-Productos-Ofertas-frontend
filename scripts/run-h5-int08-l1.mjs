import { spawn } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { assertSafeEvidenceText } from "../tests/h5/evidence-security.mjs";

const reportPath = "test-results/h5/int08-l1-summary.json";
const innerReportPath = "test-results/h5/int08-l1-inner-summary.json";
const required = [
  "G6_H5_INT08_ISOLATED_HARNESS",
  "CATALOG_REAL_JWT",
  "CATALOG_REAL_FORBIDDEN_JWT",
  "CATALOG_REAL_BROWSER_ORIGIN",
  "CATALOG_REAL_PRODUCT_ID",
  "CATALOG_REAL_VARIANT_PRODUCT_ID",
  "CATALOG_REAL_VARIANT_ID",
  "CATALOG_REAL_VARIANT_SKU",
  "CATALOG_REAL_CONCURRENT_VARIANT_ID",
  "CATALOG_REAL_CONCURRENT_VARIANT_SKU",
];
const missing = required.filter(key => !process.env[key]);
if (process.env.G6_H5_INT08_ISOLATED_HARNESS !== "1") missing.push("ISOLATED_HARNESS_NOT_CONFIRMED");
if (missing.length) {
  const summary = { schema_version: 1, suite: "INT08-L1", status: "BLOCKED_DEPENDENCY", missing_count: missing.length };
  const serialized = `${JSON.stringify(summary, null, 2)}\n`;
  assertSafeEvidenceText(serialized);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, serialized, "utf8");
  process.stdout.write(`INT08 L1 BLOCKED_DEPENDENCY: missing_or_unconfirmed=${missing.length}; no service calls made.\n`);
  process.exit(2);
}
await mkdir(dirname(innerReportPath), { recursive: true });
try { await unlink(innerReportPath); } catch (error) { if (error?.code !== "ENOENT") throw error; }

const child = spawn(process.execPath, [
  "node_modules/playwright/cli.js", "test", "--config", "playwright.h5-int08-l1.config.ts", "tests/catalog-http-real.spec.ts",
], { stdio: ["ignore", "pipe", "pipe"], shell: false, env: { ...process.env, G6_H5_EVIDENCE_SUMMARY_PATH: innerReportPath } });
let capturedBytes = 0;
child.stdout.on("data", chunk => { capturedBytes += chunk.length; });
child.stderr.on("data", chunk => { capturedBytes += chunk.length; });
const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", resolve);
});
const innerText = await readFile(innerReportPath, "utf8");
assertSafeEvidenceText(innerText);
const inner = JSON.parse(innerText);
if (inner.total !== 1) {
  process.stdout.write("INT08 L1 BLOCKED_DEPENDENCY: expected real suite discovery did not match; no PASS emitted.\n");
  process.exit(2);
}
const summary = {
  schema_version: 1,
  suite: "INT08-L1",
  status: inner.skipped > 0 ? "NOT_RUN" : exitCode === 0 && inner.passed === 1 && inner.failed === 0 ? "DONE_B" : "FAIL",
  executed: inner.total,
  passed: inner.passed,
  failed: inner.failed,
  skipped: inner.skipped,
  captured_subprocess_bytes: capturedBytes,
};
const serialized = `${JSON.stringify(summary, null, 2)}\n`;
assertSafeEvidenceText(serialized);
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, serialized, "utf8");
process.stdout.write(`INT08 L1 ${summary.status}: executed=${summary.executed}; passed=${summary.passed}; failed=${summary.failed}; skipped=${summary.skipped}; captured_bytes=${capturedBytes}.\n`);
if (summary.status === "NOT_RUN") process.exit(2);
if (summary.status !== "DONE_B") process.exit(1);
