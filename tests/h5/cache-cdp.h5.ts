import { expect, test } from "@playwright/test";

test("CDP distingue la primera lectura HTTP fría de la segunda lectura warm sin route interception", async ({ page }) => {
  test.setTimeout(20_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  let cacheHits = 0;
  let networkResponses = 0;
  cdp.on("Network.requestServedFromCache", () => { cacheHits += 1; });
  cdp.on("Network.responseReceived", (event: { response: { url: string; fromDiskCache?: boolean } }) => {
    if (!event.response.url.endsWith("/resource.js")) return;
    networkResponses += 1;
    if (event.response.fromDiskCache) cacheHits += 1;
  });

  await page.goto("/", { timeout: 5_000 });
  const firstBody = await page.evaluate(async () => (await fetch("/resource.js", { signal: AbortSignal.timeout(3_000) })).text());
  const countAfterFirst = await page.evaluate(async () => (await fetch("/resource-count", { signal: AbortSignal.timeout(3_000) })).json()) as { resourceRequests: number };
  const secondBody = await page.evaluate(async () => (await fetch("/resource.js", { signal: AbortSignal.timeout(3_000) })).text());
  const countAfterSecond = await page.evaluate(async () => (await fetch("/resource-count", { signal: AbortSignal.timeout(3_000) })).json()) as { resourceRequests: number };

  expect(firstBody).toBe(secondBody);
  expect(countAfterFirst.resourceRequests).toBe(1);
  expect(countAfterSecond.resourceRequests).toBe(1);
  expect(networkResponses).toBeGreaterThanOrEqual(1);
  expect(cacheHits).toBeGreaterThanOrEqual(1);
  await cdp.detach();
});
