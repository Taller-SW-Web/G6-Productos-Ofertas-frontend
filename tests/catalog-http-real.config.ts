import { defineConfig } from "@playwright/test";

const port = Number(process.env.CATALOG_REAL_VITE_PORT ?? "5197");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Puerto Vite E2E inválido.");
const gateway = process.env.CATALOG_REAL_GATEWAY_ORIGIN;
if (!gateway) throw new Error("CATALOG_REAL_GATEWAY_ORIGIN es obligatorio.");
const target = new URL(gateway);
if (target.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) || target.username || target.password || target.pathname !== "/") throw new Error("El Gateway E2E debe usar exclusivamente HTTP loopback.");

export default defineConfig({
  testDir: ".",
  workers: 1,
  retries: 0,
  reporter: "line",
  use: { browserName: "chromium", baseURL: `http://127.0.0.1:${port}`, headless: true, trace: "off", screenshot: "off", video: "off" },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --config tests/harness/vite.catalog-real.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: "..",
    url: `http://127.0.0.1:${port}/tests/harness/catalog-http-real.html`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
