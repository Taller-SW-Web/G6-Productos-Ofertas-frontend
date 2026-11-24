import { defineConfig } from "@playwright/test";

const port = Number(process.env.G6_H5_INT08_PORT ?? "5383");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Puerto H5 inválido.");
process.env.G6_H5_DISABLE_SCREENSHOTS = "1";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["catalog-http-ui.spec.ts", "h5/int08.contract.pw.ts"],
  outputDir: "test-results/h5-int08-contract",
  preserveOutput: "never",
  workers: 1,
  retries: 0,
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
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: process.cwd(),
    url: `http://127.0.0.1:${port}/tests/harness/catalog-http.html`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
