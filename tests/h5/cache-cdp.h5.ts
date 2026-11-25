import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { assertSafeEvidenceText } from "./evidence-security.mjs";

test("CDP distingue la primera lectura HTTP fría de la segunda lectura warm sin route interception", async ({ page }) => {
  test.setTimeout(20_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.clearBrowserCache");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
  const resourceRequestIds: string[] = [];
  const cachedRequestIds = new Set<string>();
  const coldNetworkRequestIds = new Set<string>();
  cdp.on("Network.requestWillBeSent", (event: { requestId: string; request: { url: string } }) => {
    if (event.request.url.endsWith("/resource.js")) resourceRequestIds.push(event.requestId);
  });
  cdp.on("Network.requestServedFromCache", (event: { requestId: string }) => { cachedRequestIds.add(event.requestId); });
  cdp.on("Network.responseReceived", (event: { requestId: string; response: { url: string; fromDiskCache?: boolean; fromServiceWorker?: boolean } }) => {
    if (!event.response.url.endsWith("/resource.js")) return;
    if (event.response.fromDiskCache || event.response.fromServiceWorker) cachedRequestIds.add(event.requestId);
    else coldNetworkRequestIds.add(event.requestId);
  });

  await page.goto("/", { timeout: 5_000 });
  const firstBody = await page.evaluate(async () => (await fetch("/resource.js", { signal: AbortSignal.timeout(3_000) })).text());
  const countAfterFirst = await page.evaluate(async () => (await fetch("/resource-count", { signal: AbortSignal.timeout(3_000) })).json()) as { resourceRequests: number };
  const secondBody = await page.evaluate(async () => (await fetch("/resource.js", { signal: AbortSignal.timeout(3_000) })).text());
  const countAfterSecond = await page.evaluate(async () => (await fetch("/resource-count", { signal: AbortSignal.timeout(3_000) })).json()) as { resourceRequests: number };

  expect(firstBody).toBe(secondBody);
  expect(resourceRequestIds).toHaveLength(2);
  const firstRequestId = resourceRequestIds[0];
  const secondRequestId = resourceRequestIds[1];
  expect(firstRequestId).toBeDefined();
  expect(secondRequestId).toBeDefined();
  if (!firstRequestId || !secondRequestId) throw new Error("CDP_RESOURCE_REQUEST_IDS_MISSING");
  expect(coldNetworkRequestIds.has(firstRequestId)).toBe(true);
  expect(cachedRequestIds.has(secondRequestId)).toBe(true);
  expect(countAfterFirst.resourceRequests).toBe(1);
  expect(countAfterSecond.resourceRequests).toBe(1);
  const outputPath = resolve(process.env.G6_H5_CACHE_CDP_OBSERVATION_PATH ?? "test-results/h5/cache-cdp-observation.json");
  const observation = {
    schema_version: 1,
    case_id: "H5-CACHE-CDP",
    status: "PASS",
    evidence_level: "L0",
    docs_sha: "c9e1e5c217616d28229fccf5315fb97a1ae061a9",
    cold_network_reads: coldNetworkRequestIds.size,
    warm_cache_reads: cachedRequestIds.size,
    disposable_server_requests_after_cold: countAfterFirst.resourceRequests,
    disposable_server_requests_after_warm: countAfterSecond.resourceRequests,
  };
  const bytes = Buffer.from(`${JSON.stringify(observation, null, 2)}\n`, "utf8");
  assertSafeEvidenceText(bytes.toString("utf8"));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);
  const observationIndex = {
    schema_version: 1,
    artifact: "cache-cdp-observation.json",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    case_id: observation.case_id,
    evidence_level: observation.evidence_level,
    status: observation.status,
  };
  const indexBytes = Buffer.from(`${JSON.stringify(observationIndex, null, 2)}\n`, "utf8");
  assertSafeEvidenceText(indexBytes.toString("utf8"));
  await writeFile(`${outputPath}.index.json`, indexBytes);
  await cdp.detach();
});
