import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { assertSafeEvidenceText } from "../tests/h5/evidence-security.mjs";
import { comparePerf06 } from "../tests/h5/perf06-policy.mjs";

const [baselinePathArg, candidatePathArg, outputPathArg, repositoryRootArg] = process.argv.slice(2);
if (!baselinePathArg || !candidatePathArg || !outputPathArg || !repositoryRootArg) throw new Error("PERF06_COMPARE_ARGUMENTS_INVALID");
const baselinePath = resolve(baselinePathArg);
const candidatePath = resolve(candidatePathArg);
const outputPath = resolve(outputPathArg);
if (basename(baselinePath) !== "admin-browser-performance.json" || basename(candidatePath) !== "admin-browser-performance.json") throw new Error("PERF06_AGGREGATE_FILE_INVALID");
const [baselineText, candidateText] = await Promise.all([readFile(baselinePath, "utf8"), readFile(candidatePath, "utf8")]);
assertSafeEvidenceText(baselineText);
assertSafeEvidenceText(candidateText);
const baseline = JSON.parse(baselineText);
const candidate = JSON.parse(candidateText);
const output = {
  schemaVersion: 1,
  status: "INCONCLUSIVE",
  baselineSha: baseline.subjectSha,
  candidateSha: candidate.subjectSha,
  harnessSha: baseline.harnessSha,
  datasetSha: baseline.datasetSha,
  profile: baseline.profile,
  cacheMode: baseline.cacheMode,
  subjectPairSha256: createHash("sha256").update(`${baselineText}\0${candidateText}`).digest("hex"),
};

if (baseline.status !== "MEASURED" || candidate.status !== "MEASURED") {
  output.reason = "ONE_OR_BOTH_SUBJECTS_LACK_VALID_MEASUREMENTS";
} else if (
  baseline.harnessSha !== candidate.harnessSha ||
  baseline.datasetSha !== candidate.datasetSha ||
  baseline.apiOriginSha256 !== candidate.apiOriginSha256 ||
  JSON.stringify(baseline.environment) !== JSON.stringify(candidate.environment) ||
  baseline.profile !== candidate.profile ||
  baseline.cacheMode !== candidate.cacheMode ||
  baseline.measurementScope !== candidate.measurementScope
) {
  output.reason = "BASELINE_CANDIDATE_CONFIGURATION_MISMATCH";
} else {
  const diff = spawnSync("git", ["diff", "--name-only", baseline.subjectSha, candidate.subjectSha], { cwd: resolve(repositoryRootArg), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (diff.status !== 0) output.reason = "SUBJECT_COMMITS_NOT_AVAILABLE_IN_SAME_REPOSITORY";
  else {
    const changedFiles = diff.stdout.split(/\r?\n/).filter(Boolean);
    const functionalChange = changedFiles.some(path => path.startsWith("src/") && !/\.(?:spec|test)\.[^.]+$/.test(path));
    const numericPath = resolve(dirname(outputPath), "existing-comparator-output.json");
    await mkdir(dirname(outputPath), { recursive: true });
    try { await unlink(numericPath); } catch (error) { if (error?.code !== "ENOENT") throw error; }
    const comparator = spawnSync(process.execPath, [
      resolve(repositoryRootArg, "scripts/compare-admin-performance.mjs"),
      dirname(baselinePath),
      dirname(candidatePath),
      numericPath,
    ], { cwd: resolve(repositoryRootArg), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    let numeric = null;
    let numericSha256 = null;
    if (comparator.status === 0) {
      try {
        const numericText = await readFile(numericPath, "utf8");
        assertSafeEvidenceText(numericText);
        numeric = JSON.parse(numericText);
        numericSha256 = createHash("sha256").update(numericText).digest("hex");
      } catch {
        numeric = null;
      }
    }
    try { await unlink(numericPath); } catch (error) { if (error?.code !== "ENOENT") throw error; }
    const gate = comparePerf06({ baseline: { ...baseline, functionalChange }, candidate: { ...candidate, functionalChange } });
    output.status = gate.status;
    output.reason = gate.reason ?? (comparator.status === 0 ? undefined : "EXISTING_COMPARATOR_FAILED");
    output.functionalChange = functionalChange;
    output.changedProductionFileCount = changedFiles.filter(path => path.startsWith("src/") && !/\.(?:spec|test)\.[^.]+$/.test(path)).length;
    output.userExperience = {
      baselineMedianP95Ms: baseline.medianP95Ms,
      candidateMedianP95Ms: candidate.medianP95Ms,
      baselineJourneysPerSecond: baseline.medianJourneysPerSecond,
      candidateJourneysPerSecond: candidate.medianJourneysPerSecond,
      journeysPerSecondDeltaPercent: baseline.medianJourneysPerSecond ? Number(((candidate.medianJourneysPerSecond - baseline.medianJourneysPerSecond) / baseline.medianJourneysPerSecond * 100).toFixed(2)) : null,
    };
    output.http = {
      baselineRequestsPerSecond: baseline.medianRequestsPerSecond,
      candidateRequestsPerSecond: candidate.medianRequestsPerSecond,
      baselineRequestsPerJourney: baseline.medianRequestsPerJourney,
      candidateRequestsPerJourney: candidate.medianRequestsPerJourney,
      candidateUnexpectedErrorPercent: candidate.unexpectedErrorPercent,
    };
    output.existingComparator = numeric;
    output.existingComparatorSha256 = numericSha256;
  }
}
const serialized = `${JSON.stringify(output, null, 2)}\n`;
assertSafeEvidenceText(serialized);
await writeFile(outputPath, serialized, "utf8");
process.stdout.write(`PERF06 comparison ${output.status}: profile=${output.profile ?? "UNKNOWN"}; cache=${output.cacheMode ?? "UNKNOWN"}; reason=${output.reason ?? "GATES_EVALUATED"}.\n`);
if (output.status !== "PASS") process.exitCode = output.status === "FAIL" ? 1 : 2;
