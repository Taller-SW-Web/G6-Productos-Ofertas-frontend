import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertSafeEvidenceText } from "./evidence-security.mjs";

const reportPath = resolve(process.env.G6_H5_EVIDENCE_SUMMARY_PATH ?? "test-results/h5/safe-summary.json");

export function evidenceLevelForH5Test(testTitle) {
  if (/^INT08-L1-[A-Z0-9-]+:/.test(testTitle)) return "L1_BROWSER_HTTP";
  if (testTitle.startsWith("CAT real HTTP:")) return "L1_BROWSER_UI";
  return "L0_CONTRACT";
}

export default class H5SafeReporter {
  onBegin(_config, suite) {
    this.total = suite.allTests().length;
    this.counts = { passed: 0, failed: 0, skipped: 0, interrupted: 0, timedOut: 0 };
    this.cases = [];
  }

  onTestEnd(test, result) {
    const key = result.status === "timedOut" ? "timedOut" : result.status;
    if (Object.hasOwn(this.counts, key)) this.counts[key] += 1;
    const stableName = test.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "ASSERTION";
    const status = result.status === "passed" ? "PASS" : result.status === "failed" ? "FAIL" : result.status === "skipped" ? "SKIPPED" : result.status === "interrupted" ? "INTERRUPTED" : "TIMED_OUT";
    const explicitScenario = /^(INT08-L1-[A-Z0-9-]+):/.exec(test.title)?.[1];
    this.cases.push({
      scenario_id: explicitScenario ?? `H5-${stableName}-${String(this.cases.length + 1).padStart(3, "0")}`,
      status,
      evidence_level: evidenceLevelForH5Test(test.title),
    });
  }

  async onEnd(result) {
    const summary = {
      schema_version: 1,
      suite: "H5",
      status: result.status,
      total: this.total,
      ...this.counts,
      cases: this.cases,
    };
    const serialized = `${JSON.stringify(summary, null, 2)}\n`;
    assertSafeEvidenceText(serialized);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, serialized, { encoding: "utf8", flag: "w" });
    process.stdout.write(`H5 result=${result.status}; total=${this.total}; passed=${this.counts.passed}; failed=${this.counts.failed}; skipped=${this.counts.skipped}; timedOut=${this.counts.timedOut}\n`);
  }
}
