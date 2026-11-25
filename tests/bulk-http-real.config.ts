import { defineConfig } from "@playwright/test";

const port = Number(process.env.BULK_REAL_VITE_PORT ?? "5217");
const browserPort = Number(process.env.BULK_REAL_BROWSER_PORT ?? "5218");
for (const value of [port, browserPort]) {
  if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error("Puerto de E2E Bulk inválido.");
}
const viteOrigin = `http://127.0.0.1:${port}`;
const browserOrigin = `http://127.0.0.1:${browserPort}`;

export default defineConfig({
  testDir: ".",
  timeout: 90_000,
  workers: 1,
  retries: 0,
  reporter: [["line"], ["junit", { outputFile: "test-results/bulk-http-real-junit.xml" }]],
  outputDir: "test-results/bulk-http-real",
  use: { browserName: "chromium", baseURL: browserOrigin, headless: true, trace: "retain-on-failure", screenshot: "only-on-failure", video: "retain-on-failure" },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --config tests/harness/vite.bulk-real.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: "..",
    url: `${viteOrigin}/tests/harness/bulk-http-real.html`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
