import { defineConfig } from "@playwright/test";

const port = Number(process.env.CATALOG_REAL_VITE_PORT ?? "5197");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Puerto Vite E2E inválido.");
const browserPort = Number(process.env.CATALOG_REAL_BROWSER_PORT ?? "5198");
if (!Number.isInteger(browserPort) || browserPort < 1024 || browserPort > 65535) throw new Error("Puerto del proxy Browser E2E inválido.");
const viteOrigin = `http://127.0.0.1:${port}`;
const browserOrigin = `http://127.0.0.1:${browserPort}`;

export default defineConfig({
  testDir: ".",
  workers: 1,
  retries: 0,
  reporter: "line",
  use: { browserName: "chromium", baseURL: browserOrigin, headless: true, trace: "off", screenshot: "off", video: "off" },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --config tests/harness/vite.catalog-real.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: "..",
    url: `${viteOrigin}/tests/harness/catalog-http-real.html`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
