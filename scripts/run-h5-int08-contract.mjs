import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { assertSafeEvidenceText } from "../tests/h5/evidence-security.mjs";

const reportPath = "test-results/h5/int08-contract-summary.json";
await mkdir(dirname(reportPath), { recursive: true });

const allocateLoopbackPort = async () => {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("INT08_LOOPBACK_PORT_ALLOCATION_FAILED");
  const port = address.port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
};
const port = process.env.G6_H5_INT08_PORT ?? String(await allocateLoopbackPort());
if (!/^\d{4,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw new Error("INT08_PORT_INVALID");

const runPlaywright = async (summaryPath, extraArgs = []) => {
  try { await unlink(summaryPath); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const child = spawn(process.execPath, [
    "node_modules/playwright/cli.js",
    "test",
    "--config",
    "playwright.h5-int08-contract.config.ts",
    ...extraArgs,
  ], { stdio: ["ignore", "pipe", "pipe"], shell: false, env: {
    ...process.env,
    G6_H5_INT08_PORT: port,
    G6_H5_EVIDENCE_SUMMARY_PATH: summaryPath,
  } });
  let outputBytes = 0;
  child.stdout.on("data", chunk => { outputBytes += chunk.length; });
  child.stderr.on("data", chunk => { outputBytes += chunk.length; });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  let parsedSummary;
  try {
    const report = await readFile(summaryPath, "utf8");
    assertSafeEvidenceText(report);
    parsedSummary = JSON.parse(report);
  } catch { /* Missing or unsafe reporter output stays unavailable. */ }
  return { exitCode, outputBytes, summary: parsedSummary ?? null };
};

const discoveryPath = "test-results/h5/int08-contract-discovery.json";
const discovery = await runPlaywright(discoveryPath, ["--list"]);
if (discovery.exitCode !== 0 || discovery.summary?.total !== 11) {
  const blocked = { schemaVersion: 1, suite: "INT08_CONTRACT", status: "BLOCKED_DEPENDENCY", reason: "EXPECTED_11_SPECS_NOT_DISCOVERED", discovered: discovery.summary?.total ?? 0, serviceCalls: 0 };
  const serialized = `${JSON.stringify(blocked, null, 2)}\n`;
  assertSafeEvidenceText(serialized);
  await writeFile(reportPath, serialized, "utf8");
  process.stdout.write(`INT08 contractual BLOCKED_DEPENDENCY: discovered=${blocked.discovered}; expected=11; service_calls=0.\n`);
  process.exit(2);
}

const run = await runPlaywright(reportPath);
const summary = run.summary;
if (!summary || summary.total !== 11) {
  const failed = { schemaVersion: 1, suite: "INT08_CONTRACT", status: "FAIL", reason: "RUNNER_OR_WEBSERVER_FAILED_AFTER_11_SPECS_DISCOVERED", discovered: 11, executed: summary?.total ?? 0, capturedSubprocessBytes: discovery.outputBytes + run.outputBytes, serviceCalls: "NONE" };
  const serialized = `${JSON.stringify(failed, null, 2)}\n`;
  assertSafeEvidenceText(serialized);
  await writeFile(reportPath, serialized, "utf8");
  process.stdout.write(`INT08 contractual FAIL: runner_start_failed; discovered=11; executed=${failed.executed}; captured_bytes=${failed.capturedSubprocessBytes}.\n`);
  process.exit(1);
}
if (run.exitCode !== 0 || summary.status !== "passed" || summary.passed !== 11 || summary.skipped !== 0 || summary.failed !== 0 || summary.interrupted !== 0 || summary.timedOut !== 0) {
  process.stdout.write(`INT08 contractual FAIL: executed=${summary.total}; passed=${summary.passed}; failed=${summary.failed}; skipped=${summary.skipped}; captured_bytes=${discovery.outputBytes + run.outputBytes}.\n`);
  process.exit(1);
}
process.stdout.write(`INT08 contractual PASS: discovered=11; executed=${summary.total}; passed=11; skipped=0; captured_bytes=${discovery.outputBytes + run.outputBytes}.\n`);
