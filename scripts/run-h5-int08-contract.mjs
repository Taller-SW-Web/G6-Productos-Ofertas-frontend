import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { assertSafeEvidenceText } from "../tests/h5/evidence-security.mjs";

const reportPath = "test-results/h5/int08-contract-summary.json";
await mkdir(dirname(reportPath), { recursive: true });
const discoveryPath = "test-results/h5/int08-contract-discovery.json";
const docsSha = "40524e96c6973f84d74160076781702fe2a3da19";
let testPort;

const writeOutcome = async (status, reason, counts = {}) => {
  const report = {
    schemaVersion: 1,
    caseId: "INT-08",
    suite: "INT08_CONTRACT",
    status,
    reason,
    docsSha,
    timestampUtc: new Date().toISOString(),
    evidenceLevel: "L0",
    discovered: counts.discovered ?? 0,
    executed: counts.executed ?? 0,
    passed: counts.passed ?? 0,
    failed: counts.failed ?? 0,
    skipped: counts.skipped ?? 0,
    interrupted: counts.interrupted ?? 0,
    timedOut: counts.timedOut ?? 0,
    serviceCalls: 0,
    capturedSubprocessBytes: counts.capturedSubprocessBytes ?? 0,
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  assertSafeEvidenceText(serialized);
  await writeFile(reportPath, serialized, "utf8");
  const index = {
    schemaVersion: 1,
    artifact: "int08-contract-summary.json",
    sha256: createHash("sha256").update(Buffer.from(serialized, "utf8")).digest("hex"),
    caseId: report.caseId,
    docsSha,
    timestampUtc: report.timestampUtc,
    status,
    evidenceLevel: report.evidenceLevel,
  };
  const indexText = `${JSON.stringify(index, null, 2)}\n`;
  assertSafeEvidenceText(indexText);
  await writeFile(`${reportPath}.index.json`, indexText, "utf8");
  return report;
};

const allocateLoopbackPort = async () => {
  const server = createServer();
  let timer;
  await new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      server.close(() => {});
      reject(new Error("LOOPBACK_PORT_ALLOCATION_TIMEOUT"));
    }, 3000);
    server.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    server.listen(0, "127.0.0.1", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("INT08_LOOPBACK_PORT_ALLOCATION_FAILED");
  const port = address.port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
};
const runPlaywright = async (summaryPath, extraArgs = [], timeoutMs = 45_000) => {
  try { await unlink(summaryPath); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const child = spawn(process.execPath, [
    "node_modules/playwright/cli.js",
    "test",
    "--config",
    "playwright.h5-int08-contract.config.ts",
    ...extraArgs,
  ], { stdio: ["ignore", "pipe", "pipe"], shell: false, env: {
    ...process.env,
    G6_H5_INT08_PORT: testPort,
    G6_H5_EVIDENCE_SUMMARY_PATH: summaryPath,
  } });
  let outputBytes = 0;
  let capturedOutput = "";
  let timedOut = false;
  const capture = chunk => {
    outputBytes += chunk.length;
    capturedOutput = `${capturedOutput}${chunk.toString("utf8")}`.slice(-8192);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  let timer;
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", code => {
      clearTimeout(timer);
      resolve(code);
    });
    timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
  });
  clearTimeout(timer);
  let parsedSummary;
  try {
    const report = await readFile(summaryPath, "utf8");
    assertSafeEvidenceText(report);
    parsedSummary = JSON.parse(report);
  } catch { /* Missing or unsafe reporter output stays unavailable. */ }
  return { exitCode, outputBytes, timedOut, capturedOutput, summary: parsedSummary ?? null };
};

const main = async () => {
  for (const path of [reportPath, `${reportPath}.index.json`, discoveryPath]) {
    try { await unlink(path); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  }

  try {
    testPort = process.env.G6_H5_INT08_PORT ?? String(await allocateLoopbackPort());
  } catch {
    const report = await writeOutcome("BLOCKED_DEPENDENCY", "LOCAL_LOOPBACK_UNAVAILABLE");
    process.stdout.write(`INT08 contractual ${report.status}: local loopback unavailable; discovered=0; executed=0.\n`);
    process.exitCode = 2;
    return;
  }
  if (!/^\d{4,5}$/.test(testPort) || Number(testPort) < 1024 || Number(testPort) > 65535) {
    const report = await writeOutcome("BLOCKED_DEPENDENCY", "INT08_PORT_INVALID");
    process.stdout.write(`INT08 contractual ${report.status}: invalid test port; discovered=0; executed=0.\n`);
    process.exitCode = 2;
    return;
  }

  const discovery = await runPlaywright(discoveryPath, ["--list"], 20_000);
  if (discovery.timedOut || discovery.exitCode !== 0 || discovery.summary?.total !== 11) {
    const report = await writeOutcome("BLOCKED_DEPENDENCY", "EXPECTED_11_SPECS_NOT_DISCOVERED", {
      discovered: discovery.summary?.total ?? 0,
      capturedSubprocessBytes: discovery.outputBytes,
      timedOut: discovery.timedOut ? 1 : 0,
    });
    process.stdout.write(`INT08 contractual ${report.status}: expected 11 specs; discovered=${report.discovered}; executed=0.\n`);
    process.exitCode = 2;
    return;
  }

  const run = await runPlaywright(reportPath, [], 45_000);
  const summary = run.summary;
  const capturedSubprocessBytes = discovery.outputBytes + run.outputBytes;
  if (run.timedOut || !summary) {
    const loopbackUnavailable = /EACCES|EPERM|EADDRNOTAVAIL|webServer.*(failed|timed out)|Timed out waiting/i.test(run.capturedOutput);
    const status = loopbackUnavailable || run.timedOut ? "BLOCKED_DEPENDENCY" : "FAIL";
    const reason = run.timedOut ? "INT08_RUNNER_TIMEOUT" : loopbackUnavailable ? "LOCAL_WEBSERVER_UNAVAILABLE" : "RUNNER_FAILED_WITHOUT_SAFE_REPORT";
    const report = await writeOutcome(status, reason, {
      discovered: 11,
      executed: summary?.total ?? 0,
      passed: summary?.passed ?? 0,
      failed: summary?.failed ?? 0,
      skipped: summary?.skipped ?? 0,
      interrupted: summary?.interrupted ?? 0,
      timedOut: (summary?.timedOut ?? 0) + (run.timedOut ? 1 : 0),
      capturedSubprocessBytes,
    });
    process.stdout.write(`INT08 contractual ${report.status}: ${reason}; discovered=11; executed=${report.executed}; captured_bytes=${capturedSubprocessBytes}.\n`);
    process.exitCode = status === "FAIL" ? 1 : 2;
    return;
  }

  const passed = run.exitCode === 0 && summary.status === "passed" && summary.total === 11 && summary.passed === 11 && summary.skipped === 0 && summary.failed === 0 && summary.interrupted === 0 && summary.timedOut === 0;
  const report = await writeOutcome(passed ? "PASS" : "FAIL", passed ? "ALL_11_CONTRACT_CASES_PASSED" : "CONTRACT_CASES_DID_NOT_ALL_PASS", {
    discovered: 11,
    executed: summary.total,
    passed: summary.passed,
    failed: summary.failed,
    skipped: summary.skipped,
    interrupted: summary.interrupted,
    timedOut: summary.timedOut,
    capturedSubprocessBytes,
  });
  process.stdout.write(`INT08 contractual ${report.status}: discovered=11; executed=${report.executed}; passed=${report.passed}; failed=${report.failed}; skipped=${report.skipped}; captured_bytes=${capturedSubprocessBytes}.\n`);
  if (!passed) process.exitCode = 1;
};

main().catch(async () => {
  try {
    await writeOutcome("FAIL", "RUNNER_INTERNAL_ERROR");
  } catch { /* Never emit an exception that may contain secret material. */ }
  process.stdout.write("INT08 contractual FAIL: RUNNER_INTERNAL_ERROR.\n");
  process.exitCode = 1;
});
