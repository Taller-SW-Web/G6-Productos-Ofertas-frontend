import assert from "node:assert/strict";
import test from "node:test";
import { preflightInt08L1 } from "./int08-l1-coverage.mjs";

test("INT08 L1 readiness is calculated per scenario without a global identity gate", () => {
  const result = preflightInt08L1({
    G6_H5_INT08_ISOLATED_HARNESS: "1",
    CATALOG_REAL_BROWSER_ORIGIN: "http://127.0.0.1:5198",
    CATALOG_REAL_GATEWAY_ORIGIN: "http://127.0.0.1:5199",
  });
  assert.equal(result.length, 4);
  assert.equal(result[0].status, "READY_B");
  assert.deepEqual(result[0].blockers, []);
  assert.ok(
    result
      .find((item) => item.id === "INT08-L1-DENIED-SCOPE")
      .blockers.includes("CATALOG_REAL_FORBIDDEN_JWT"),
  );
  assert.ok(
    result
      .find((item) => item.id === "INT08-L1-AUTHORIZED-ADMIN-READ")
      .blockers.includes("CATALOG_REAL_JWT"),
  );
});

test("INT08 L1 blocks unsafe origins and missing isolated-harness attestation", () => {
  const result = preflightInt08L1({
    CATALOG_REAL_BROWSER_ORIGIN: "https://shared.example/private",
  });
  assert.ok(result.every((item) => item.status === "BLOCKED_DEPENDENCY"));
  assert.ok(
    result.every((item) =>
      item.blockers.includes("G6_H5_INT08_ISOLATED_HARNESS"),
    ),
  );
  assert.ok(
    result.every((item) =>
      item.blockers.includes("CATALOG_REAL_BROWSER_ORIGIN"),
    ),
  );
});
