import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

async function findReport(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      const found = await findReport(path);
      if (found) return found;
    } else if (entry.name === "admin-browser-performance.json") return path;
  }
  return undefined;
}

const [baselineRoot, optimizedRoot, outputPath] = process.argv.slice(2);
if (!baselineRoot || !optimizedRoot || !outputPath) {
  throw new Error("Uso: node scripts/compare-admin-performance.mjs <base> <optimizado> <salida>");
}
const baselinePath = await findReport(resolve(baselineRoot));
const optimizedPath = await findReport(resolve(optimizedRoot));
if (!baselinePath || !optimizedPath) {
  throw new Error(`Falta el reporte JSON: base=${baselinePath ?? "no encontrado"}, optimizado=${optimizedPath ?? "no encontrado"}`);
}
const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const optimized = JSON.parse(await readFile(optimizedPath, "utf8"));
const percentDelta = (before, after) => typeof before === "number" && before !== 0 && typeof after === "number"
  ? Number((((after - before) / before) * 100).toFixed(2))
  : null;
const oldFamilies = new Map(baseline.familyUiSamples.map((sample) => [sample.family, sample]));
const familyComparison = optimized.familyUiSamples.map((after) => {
  const before = oldFamilies.get(after.family);
  return {
    family: after.family,
    baseline: before ? { p50Ms: before.p50Ms, p95Ms: before.p95Ms, p99Ms: before.p99Ms, requests: before.requestCount, requestBodyBytes: before.requestBodyBytes, responseBodyBytes: before.responseBodyBytes } : null,
    optimized: { p50Ms: after.p50Ms, p95Ms: after.p95Ms, p99Ms: after.p99Ms, requests: after.requestCount, requestBodyBytes: after.requestBodyBytes, responseBodyBytes: after.responseBodyBytes },
    deltaPercent: before ? {
      p50: percentDelta(before.p50Ms, after.p50Ms),
      p95: percentDelta(before.p95Ms, after.p95Ms),
      p99: percentDelta(before.p99Ms, after.p99Ms),
    } : null,
  };
});
const baselineDatasets = new Map(baseline.catalogListDatasetRuns.series.map((sample) => [sample.fixtureTotal, sample]));
const datasetComparison = optimized.catalogListDatasetRuns.series.map((after) => {
  const before = baselineDatasets.get(after.fixtureTotal);
  return {
    totalRows: after.fixtureTotal,
    baseline: before ? { elapsedMs: before.elapsedMs, requests: before.requestCount, responseBodyBytes: before.responseBodyBytes, traversedPages: before.traversedPages } : null,
    optimized: { elapsedMs: after.elapsedMs, requests: after.requestCount, responseBodyBytes: after.responseBodyBytes, traversedPages: after.traversedPages },
    elapsedDeltaPercent: before ? percentDelta(before.elapsedMs, after.elapsedMs) : null,
    responseBytesDeltaPercent: before ? percentDelta(before.responseBodyBytes, after.responseBodyBytes) : null,
  };
});
const report = {
  schemaVersion: 1,
  baselineRun: baseline.runLabel,
  optimizedRun: optimized.runLabel,
  sameRunnerJob: true,
  browser: optimized.browser,
  measurementScope: "controlled browser/Gateway fixtures; no microservice/provider latency or production data",
  routeCoverage: { baseline: baseline.routeCount, optimized: optimized.routeCount, baselineFamilies: baseline.familyCount, optimizedFamilies: optimized.familyCount },
  familyComparison,
  catalogListDatasetComparison: datasetComparison,
};
await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
