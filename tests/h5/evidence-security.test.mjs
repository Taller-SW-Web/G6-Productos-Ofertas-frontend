import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertSafeEvidenceText } from "./evidence-security.mjs";

test("accepts an allowlisted synthetic H5 summary", () => {
  assert.equal(assertSafeEvidenceText(JSON.stringify({ scenario_id: "INT08-HTTP-503", status: "passed" })), true);
});

test("rejects secret, private endpoint, and personal-data canaries before storage", async () => {
  const canaries = [
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjYW5hcnkifQ.signature",
    "Authorization: Bearer fake-token-value",
    "Cookie: session=fake-cookie-value",
    "postgresql://user:fake-password@db.private.example:5432/catalog",
    "password=fake-password-value",
    "base64: Y2FuYXJ5LXRlc3QtY3JlZGVudGlhbA==",
    "qa.person@example.test",
    "https://pricing.internal.example/private-m2m",
    JSON.stringify({ token: "fake-credential-value" }),
  ];
  for (const canary of canaries) assert.throws(() => assertSafeEvidenceText(canary), /EVIDENCE_REJECTED/);
});

test("H5 reporter contains only counters and never serializes test errors", async () => {
  const source = await readFile(new URL("./safe-reporter.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /error\.message|stack|request\.url|headers\(/i);
  assert.match(source, /passed|failed|skipped|timedOut/);
});
