import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const port = Number(process.env.G6_H5_PERF06_PORT ?? "5398");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("PERF06_PORT_INVALID");
const subjectRoot = resolve(process.env.G6_H5_PERF06_APP_ROOT ?? process.cwd());

export default defineConfig({
  testDir: "./tests/h5",
  testMatch: "perf06.pw.ts",
  outputDir: "test-results/h5-perf06",
  preserveOutput: "never",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 420_000,
  reporter: [["./tests/h5/safe-reporter.mjs"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    headless: true,
    trace: "off",
    screenshot: "off",
    video: "off",
    acceptDownloads: false,
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: subjectRoot,
    url: `http://127.0.0.1:${port}/productos`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
