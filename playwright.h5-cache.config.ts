import { defineConfig } from "@playwright/test";

const port = Number(process.env.G6_H5_CACHE_PORT ?? "5399");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("H5_CACHE_PORT_INVALID");

export default defineConfig({
  testDir: "./tests/h5",
  testMatch: "cache-cdp.h5.ts",
  outputDir: "test-results/h5-cache-cdp",
  preserveOutput: "never",
  workers: 1,
  retries: 0,
  timeout: 20_000,
  reporter: [["./tests/h5/safe-reporter.mjs"]],
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: "chromium", headless: true, trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" },
  webServer: {
    command: "node scripts/testing/h5-cache-server.mjs",
    cwd: process.cwd(),
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: Number(process.env.G6_H5_CACHE_READINESS_TIMEOUT_MS ?? "15_000"),
  },
});
