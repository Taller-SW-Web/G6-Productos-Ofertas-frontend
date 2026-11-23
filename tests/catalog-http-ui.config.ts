import { defineConfig } from "@playwright/test";

const port = 5381;
export default defineConfig({
  testDir: ".",
  testMatch: "catalog-http-ui.spec.ts",
  workers: 1,
  retries: 0,
  reporter: "line",
  use: { browserName: "chromium", headless: true, baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: process.cwd(),
    url: `http://127.0.0.1:${port}/tests/harness/catalog-http.html`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
