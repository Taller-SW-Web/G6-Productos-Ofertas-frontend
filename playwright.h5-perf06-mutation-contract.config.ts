import { defineConfig } from "@playwright/test";

const port = Number(process.env.G6_H5_PERF06_MUTATION_CONTRACT_PORT ?? "5412");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("PERF06_MUTATION_CONTRACT_PORT_INVALID");

export default defineConfig({
  testDir: "./tests/h5",
  testMatch: "perf06-mutation.pw.ts",
  outputDir: "test-results/h5-perf06-mutation-contract",
  preserveOutput: "never",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 45_000,
  reporter: [["./tests/h5/safe-reporter.mjs"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    headless: true,
    trace: "off",
    screenshot: "off",
    video: "off",
    acceptDownloads: false,
    serviceWorkers: "block",
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/tests/harness/catalog-http.html`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
