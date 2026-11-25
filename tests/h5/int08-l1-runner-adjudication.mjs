const countKeys = ["passed", "failed", "skipped", "interrupted", "timedOut"];
const countIsValid = (value) => Number.isSafeInteger(value) && value >= 0;

export function adjudicateInt08L1Run({
  run,
  expectedScenarioIds,
  readiness = [],
}) {
  const errors = [];
  const add = (code) => {
    if (!errors.includes(code)) errors.push(code);
  };
  const expected = Array.isArray(expectedScenarioIds)
    ? expectedScenarioIds
    : [];
  const expectedSet = new Set(expected);
  if (!expected.length || expectedSet.size !== expected.length)
    add("EXPECTED_SCENARIO_IDS_INVALID");
  if (!run || run.exitCode !== 0) add("RUNNER_EXIT_NOT_ZERO");
  if (run?.spawnError) add("RUNNER_SPAWN_FAILED");
  if (run?.signal) add("RUNNER_INTERRUPTED");
  if (run?.timedOut) add("RUNNER_TIMED_OUT");
  const summary = run?.summary;
  if (!summary || typeof summary !== "object") add("REPORTER_SUMMARY_MISSING");
  if (summary?.schema_version !== 1 || summary?.suite !== "H5")
    add("REPORTER_SCHEMA_INVALID");
  if (summary?.status !== "passed") add("REPORTER_GLOBAL_STATUS_NOT_PASSED");

  const rows = Array.isArray(summary?.cases) ? summary.cases : [];
  const ids = rows.map((row) => row?.scenario_id);
  const idSet = new Set(ids);
  if (
    rows.length !== expected.length ||
    ids.some((id) => typeof id !== "string") ||
    idSet.size !== ids.length ||
    expected.some((id) => !idSet.has(id)) ||
    ids.some((id) => !expectedSet.has(id))
  )
    add("SCENARIO_DISCOVERY_MISMATCH");
  if (
    countKeys.some((key) => !countIsValid(summary?.[key])) ||
    !countIsValid(summary?.total)
  )
    add("REPORTER_COUNTS_INVALID");
  if (countIsValid(summary?.total) && summary.total !== expected.length)
    add("DISCOVERED_COUNT_MISMATCH");
  if (
    countKeys.every((key) => countIsValid(summary?.[key])) &&
    summary.total !== countKeys.reduce((sum, key) => sum + summary[key], 0)
  )
    add("REPORTER_COUNTS_INCONSISTENT");

  const readyById = new Map(readiness.map((item) => [item.id, item]));
  const observedCounts = { passed: 0, failed: 0, skipped: 0, interrupted: 0, timedOut: 0 };
  for (const row of rows) {
    const countKey = {
      PASS: "passed",
      FAIL: "failed",
      SKIPPED: "skipped",
      INTERRUPTED: "interrupted",
      TIMED_OUT: "timedOut",
    }[row?.status];
    if (!countKey) add("SCENARIO_STATUS_INVALID");
    else observedCounts[countKey] += 1;
    const expectedEvidence = row?.scenario_id === "INT08-L1-INTEGRAL"
      ? "L1_BROWSER_UI"
      : expectedSet.has(row?.scenario_id)
        ? "L1_BROWSER_HTTP"
        : null;
    if (expectedEvidence && row?.evidence_level !== expectedEvidence)
      add("SCENARIO_EVIDENCE_LEVEL_INVALID");
    if (
      row?.status === "SKIPPED" &&
      readyById.get(row.scenario_id)?.status === "READY_B"
    )
      add("UNEXPECTED_SKIP");
    if (row?.status === "INTERRUPTED") add("REPORTER_INTERRUPTED_CASE");
    if (row?.status === "TIMED_OUT") add("REPORTER_TIMED_OUT_CASE");
  }
  if (
    countKeys.some((key) => countIsValid(summary?.[key]) && summary[key] !== observedCounts[key])
  )
    add("REPORTER_CASE_COUNTS_MISMATCH");

  const byId = new Map(rows.map((row) => [row?.scenario_id, row]));
  const cases = expected.map((scenarioId) => {
    const row = byId.get(scenarioId);
    const prerequisite = readyById.get(scenarioId);
    let status = "FAIL";
    let execution = row ? "EXECUTED_FAILED" : "NOT_EXECUTED";
    let observedStatus = row?.status ?? "NOT_REPORTED";
    if (row?.status === "PASS") {
      status = "PASS";
      execution = "EXECUTED";
    } else if (
      row?.status === "SKIPPED" &&
      prerequisite?.status === "BLOCKED_DEPENDENCY"
    ) {
      status = "BLOCKED_DEPENDENCY";
      execution = "NOT_EXECUTED";
    } else if (row?.status === "INTERRUPTED" || row?.status === "TIMED_OUT") {
      status = "FAIL";
      execution = "EXECUTED_FAILED";
    } else if (row?.status === "FAIL") {
      status = "FAIL";
      execution = "EXECUTED_FAILED";
    }
    if (!row && prerequisite?.status === "BLOCKED_DEPENDENCY")
      status = "BLOCKED_DEPENDENCY";
    if (row?.status === "PASS" && errors.length > 0) status = "NOT_ADJUDICATED";
    return {
      scenario_id: scenarioId,
      status,
      observed_status: observedStatus,
      execution,
      accepted_by_global_runner: errors.length === 0,
      evidence_level: row?.evidence_level ?? "L1_BROWSER_HTTP",
      blockers:
        status === "BLOCKED_DEPENDENCY"
          ? (prerequisite?.blockers ?? ["CASE_PREREQUISITES_MISSING"])
          : [],
    };
  });
  const passed = cases.filter((item) => item.status === "PASS").length;
  const failed = cases.filter((item) => item.status === "FAIL").length;
  const blocked = cases.filter(
    (item) => item.status === "BLOCKED_DEPENDENCY",
  ).length;
  const valid = errors.length === 0;
  const status =
    !valid || failed > 0
      ? "FAIL"
      : blocked > 0
        ? passed > 0
          ? "PARTIAL_B"
          : "BLOCKED_DEPENDENCY"
        : "PASS";
  return {
    valid,
    errors,
    status,
    discovered: summary?.total ?? 0,
    executed: countKeys
      .filter((key) => key !== "skipped")
      .reduce(
        (sum, key) => sum + (countIsValid(summary?.[key]) ? summary[key] : 0),
        0,
      ),
    passed,
    failed,
    blocked,
    skipped: countIsValid(summary?.skipped) ? summary.skipped : 0,
    cases,
    reporter: summary
      ? {
          status: summary.status ?? null,
          total: summary.total ?? null,
          passed: summary.passed ?? null,
          failed: summary.failed ?? null,
          skipped: summary.skipped ?? null,
          interrupted: summary.interrupted ?? null,
          timedOut: summary.timedOut ?? null,
        }
      : null,
  };
}
