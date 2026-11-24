import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertSafeEvidenceText } from "../tests/h5/evidence-security.mjs";
import { aggregatePerf06Runs, PERF06_PROFILES } from "../tests/h5/perf06-policy.mjs";

const [profileKey, role, subjectSha, cacheMode, outputDirectory] = process.argv.slice(2);
if (!PERF06_PROFILES[profileKey] || !["baseline", "candidate", "reference"].includes(role) || !/^[0-9a-f]{40}$/i.test(subjectSha ?? "") || !["cold", "warm"].includes(cacheMode) || !outputDirectory)
  throw new Error("PERF06_AGGREGATE_ARGUMENTS_INVALID");
const profile = PERF06_PROFILES[profileKey];
const label = `${profile.sessions}VU-${profile.durationSeconds}s`;
const inputs = [];
for (const repetition of [1, 2, 3]) {
  const path = resolve("test-results/h5/perf06", `${subjectSha}-${role}-${label}-r${repetition}-${cacheMode}.json`);
  const bytes = await readFile(path);
  assertSafeEvidenceText(bytes.toString("utf8"));
  inputs.push({ run: JSON.parse(bytes.toString("utf8")), sha256: createHash("sha256").update(bytes).digest("hex") });
}
const aggregate = aggregatePerf06Runs(inputs.map(({ run }) => run));
const outputRoot = resolve(outputDirectory);
const aggregatePath = resolve(outputRoot, "admin-browser-performance.json");
const indexPath = resolve(outputRoot, "evidence-index.json");
if (aggregate.status !== "MEASURED") {
  const blocked = { schemaVersion: 1, status: "INCONCLUSIVE", reason: aggregate.reason ?? "REPETITIONS_NOT_MEASURED", subjectSha, harnessSha: inputs[0]?.run.harnessSha, datasetSha: inputs[0]?.run.datasetSha, profile: label, cacheMode };
  const serialized = `${JSON.stringify(blocked, null, 2)}\n`;
  assertSafeEvidenceText(serialized);
  await mkdir(dirname(aggregatePath), { recursive: true });
  await writeFile(aggregatePath, serialized, "utf8");
  process.stdout.write(`PERF06 aggregate INCONCLUSIVE: profile=${label}; cache=${cacheMode}; reason=${blocked.reason}.\n`);
  process.exit(2);
}
const compatible = {
  ...aggregate,
  sourceRepetitions: [1, 2, 3],
  comparisonStatus: "INCONCLUSIVE",
  comparisonReason: "NO_FUNCTIONALLY_DISTINCT_COMPARABLE_CANDIDATE",
};
const serializedAggregate = `${JSON.stringify(compatible, null, 2)}\n`;
assertSafeEvidenceText(serializedAggregate);
await mkdir(dirname(aggregatePath), { recursive: true });
await writeFile(aggregatePath, serializedAggregate, "utf8");
const index = {
  schemaVersion: 1,
  artifacts: [
    { name: "admin-browser-performance.json", sha256: createHash("sha256").update(serializedAggregate).digest("hex") },
    ...inputs.map((input, index) => ({ name: `run-${index + 1}.json`, sha256: input.sha256 })),
  ],
};
const serializedIndex = `${JSON.stringify(index, null, 2)}\n`;
assertSafeEvidenceText(serializedIndex);
await writeFile(indexPath, serializedIndex, "utf8");
process.stdout.write(`PERF06 aggregate MEASURED: profile=${label}; cache=${cacheMode}; repetitions=3; run_sha256_indexed=4.\n`);
