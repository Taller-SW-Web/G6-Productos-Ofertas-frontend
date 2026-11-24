import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertSafeEvidenceText } from "./evidence-security.mjs";

const reportPath = resolve(process.env.G6_H5_EVIDENCE_SUMMARY_PATH ?? "test-results/h5/safe-summary.json");

export default class H5SafeReporter {
  onBegin(_config, suite) {
    this.total = suite.allTests().length;
    this.counts = { passed: 0, failed: 0, skipped: 0, interrupted: 0, timedOut: 0 };
  }

  onTestEnd(_test, result) {
    const key = result.status === "timedOut" ? "timedOut" : result.status;
    if (Object.hasOwn(this.counts, key)) this.counts[key] += 1;
  }

  async onEnd(result) {
    const summary = {
      schema_version: 1,
      suite: "H5",
      status: result.status,
      total: this.total,
      ...this.counts,
    };
    const serialized = `${JSON.stringify(summary, null, 2)}\n`;
    assertSafeEvidenceText(serialized);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, serialized, { encoding: "utf8", flag: "w" });
    process.stdout.write(`H5 result=${result.status}; total=${this.total}; passed=${this.counts.passed}; failed=${this.counts.failed}; skipped=${this.counts.skipped}; timedOut=${this.counts.timedOut}\n`);
  }
}
