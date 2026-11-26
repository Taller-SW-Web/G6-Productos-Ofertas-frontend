import test from "node:test";
import assert from "node:assert/strict";
import { adjudicateInt08L1Run } from "./int08-l1-runner-adjudication.mjs";
import { evidenceLevelForH5Test } from "./safe-reporter.mjs";

const expectedScenarioIds = ["INT08-L1-A", "INT08-L1-B"];
const readiness = expectedScenarioIds.map((id) => ({
  id,
  status: "READY_B",
  blockers: [],
}));
const validRun = () => ({
  exitCode: 0,
  signal: null,
  timedOut: false,
  summary: {
    schema_version: 1,
    suite: "H5",
    status: "passed",
    total: 2,
    passed: 2,
    failed: 0,
    skipped: 0,
    interrupted: 0,
    timedOut: 0,
    cases: expectedScenarioIds.map((scenario_id) => ({
      scenario_id,
      status: "PASS",
      evidence_level: "L1_BROWSER_HTTP",
    })),
  },
});
const adjudicate = (overrides = {}) =>
  adjudicateInt08L1Run({
    run: validRun(),
    expectedScenarioIds,
    readiness,
    ...overrides,
  });

test("accepts complete successful browser HTTP cases only after process and reporter pass", () => {
  const result = adjudicate();
  assert.equal(result.valid, true);
  assert.equal(result.status, "PASS");
  assert.equal(
    result.cases.every((item) => item.accepted_by_global_runner),
    true,
  );
});

test("accepts the integral real-UI scenario with its dedicated report evidence level", () => {
  const integral = validRun();
  integral.summary.total = 1;
  integral.summary.passed = 1;
  integral.summary.cases = [{
    scenario_id: "INT08-L1-INTEGRAL",
    status: "PASS",
    evidence_level: evidenceLevelForH5Test("CAT real HTTP: UI journey"),
  }];
  const result = adjudicateInt08L1Run({
    run: integral,
    expectedScenarioIds: ["INT08-L1-INTEGRAL"],
    readiness: [{ id: "INT08-L1-INTEGRAL", status: "READY_B", blockers: [] }],
  });
  assert.equal(result.valid, true);
  assert.equal(result.status, "PASS");
  assert.equal(result.cases[0].evidence_level, "L1_BROWSER_UI");
});

test("rejects integral UI evidence mislabeled as browser HTTP evidence", () => {
  const integral = validRun();
  integral.summary.total = 1;
  integral.summary.passed = 1;
  integral.summary.cases = [{
    scenario_id: "INT08-L1-INTEGRAL",
    status: "PASS",
    evidence_level: "L1_BROWSER_HTTP",
  }];
  const result = adjudicateInt08L1Run({
    run: integral,
    expectedScenarioIds: ["INT08-L1-INTEGRAL"],
    readiness: [{ id: "INT08-L1-INTEGRAL", status: "READY_B", blockers: [] }],
  });
  assert.equal(result.valid, false);
  assert.equal(result.errors.includes("SCENARIO_EVIDENCE_LEVEL_INVALID"), true);
});

test("keeps the four independent HTTP checks at L1_BROWSER_HTTP", () => {
  assert.equal(evidenceLevelForH5Test("INT08-L1-READ-AUTHORIZED: reads product"), "L1_BROWSER_HTTP");
  assert.equal(evidenceLevelForH5Test("CAT real HTTP: UI journey"), "L1_BROWSER_UI");
});

test("INT-08 L1 summary and index use POM-A02 / H5-02 and browser HTTP evidence", async () => {
  const { readFile } = await import("node:fs/promises");
  const runner = await readFile(
    new URL("../../scripts/run-h5-int08-l1.mjs", import.meta.url),
    "utf8",
  );
  const reporter = await readFile(
    new URL("./safe-reporter.mjs", import.meta.url),
    "utf8",
  );
  assert.match(runner, /task_id:\s*"POM-A02"/);
  assert.match(runner, /h5_criterion:\s*"H5-02"/);
  assert.match(runner, /task_id:\s*summary\.task_id/);
  assert.match(runner, /h5_criterion:\s*summary\.h5_criterion/);
  assert.match(reporter, /evidenceLevelForH5Test\(test\.title\)/);
});

test("rejects failed, interrupted, timed out, or missing Playwright process output", () => {
  for (const run of [
    { ...validRun(), exitCode: 1 },
    { ...validRun(), exitCode: null, signal: "SIGTERM" },
    { ...validRun(), exitCode: null, spawnError: true },
    { ...validRun(), timedOut: true },
    { ...validRun(), summary: null },
  ]) {
    assert.equal(adjudicate({ run }).valid, false);
    assert.equal(adjudicate({ run }).status, "FAIL");
  }
});

test("rejects global reporter failure and discovery or case-set inconsistencies", () => {
  const mutations = [
    (summary) => {
      summary.status = "failed";
    },
    (summary) => {
      summary.total = 1;
      summary.cases.pop();
      summary.passed = 1;
    },
    (summary) => {
      summary.cases[1].scenario_id = summary.cases[0].scenario_id;
    },
    (summary) => {
      summary.cases[1].scenario_id = "INT08-L1-UNEXPECTED";
    },
    (summary) => {
      summary.passed = 1;
    },
  ];
  for (const mutate of mutations) {
    const run = validRun();
    mutate(run.summary);
    assert.equal(adjudicate({ run }).valid, false);
  }
});

test("allows only preflight-declared skips and never reports them as PASS", () => {
  const run = validRun();
  run.summary.cases[0] = {
    scenario_id: expectedScenarioIds[0],
    status: "SKIPPED",
    evidence_level: "L1_BROWSER_HTTP",
  };
  run.summary.passed = 1;
  run.summary.skipped = 1;
  const blockedReadiness = [
    {
      id: expectedScenarioIds[0],
      status: "BLOCKED_DEPENDENCY",
      blockers: ["LOOPBACK_HARNESS_MISSING"],
    },
    readiness[1],
  ];
  const result = adjudicate({ run, readiness: blockedReadiness });
  assert.equal(result.valid, true);
  assert.equal(result.status, "PARTIAL_B");
  assert.equal(result.cases[0].status, "BLOCKED_DEPENDENCY");
  assert.equal(result.cases[0].observed_status, "SKIPPED");
  assert.equal(result.cases[0].execution, "NOT_EXECUTED");

  const unexpected = adjudicate({ run, readiness });
  assert.equal(unexpected.valid, false);
  assert.equal(unexpected.errors.includes("UNEXPECTED_SKIP"), true);
});

test("rejects interrupted, timed-out, and incorrectly classified evidence rows", () => {
  for (const status of ["INTERRUPTED", "TIMED_OUT", "FAIL"]) {
    const run = validRun();
    run.summary.cases[0].status = status;
    run.summary.passed = 1;
    run.summary.failed = status === "FAIL" ? 1 : 0;
    run.summary.interrupted = status === "INTERRUPTED" ? 1 : 0;
    run.summary.timedOut = status === "TIMED_OUT" ? 1 : 0;
    assert.equal(adjudicate({ run }).status, "FAIL");
  }
  const wrongEvidence = validRun();
  wrongEvidence.summary.cases[0].evidence_level = "L1";
  assert.equal(
    adjudicate({ run: wrongEvidence }).errors.includes(
      "SCENARIO_EVIDENCE_LEVEL_INVALID",
    ),
    true,
  );
});

test("rejects per-case statuses that disagree with globally consistent reporter counters", () => {
  const run = validRun();
  run.summary.failed = 1;
  run.summary.passed = 1;
  assert.equal(
    run.summary.total,
    run.summary.passed + run.summary.failed + run.summary.skipped +
      run.summary.interrupted + run.summary.timedOut,
  );
  const result = adjudicate({ run });
  assert.equal(result.valid, false);
  assert.equal(
    result.errors.includes("REPORTER_CASE_COUNTS_MISMATCH"),
    true,
  );
  assert.equal(result.cases[0].status, "NOT_ADJUDICATED");
});
