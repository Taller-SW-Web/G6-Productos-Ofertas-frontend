import { defineConfig } from "@playwright/test";

const vitePort = Number(process.env.CATALOG_REAL_VITE_PORT ?? "5197");
const browserPort = Number(process.env.CATALOG_REAL_BROWSER_PORT ?? "5198");
if (
  ![vitePort, browserPort].every(
    (port) => Number.isInteger(port) && port >= 1024 && port <= 65535,
  )
)
  throw new Error("INT08_L1_PORT_INVALID");
if (vitePort !== browserPort)
  throw new Error("INT08_L1_BROWSER_ORIGIN_MUST_BE_VITE_ORIGIN");
process.env.G6_H5_DISABLE_SCREENSHOTS = "1";

export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "catalog-http-real.spec.ts",
    "catalog-http-real-l1-independent.h5.pw.ts",
  ],
  outputDir: "test-results/h5-int08-real",
  preserveOutput: "never",
  workers: 1,
  retries: 0,
  reporter: [["./tests/h5/safe-reporter.mjs"]],
  use: {
    browserName: "chromium",
    baseURL: `http://127.0.0.1:${vitePort}`,
    headless: true,
    trace: "off",
    screenshot: "off",
    video: "off",
    acceptDownloads: false,
    serviceWorkers: "block",
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --config tests/harness/vite.catalog-real.config.ts --host 127.0.0.1 --port ${vitePort} --strictPort`,
    cwd: process.cwd(),
    url: `http://127.0.0.1:${vitePort}/tests/harness/catalog-http-real.html`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
