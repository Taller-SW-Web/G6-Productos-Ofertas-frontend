import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_REAL_PORT ?? 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("PLAYWRIGHT_REAL_PORT inválido.");
}

if (process.env.VITE_DATA_MODE && process.env.VITE_DATA_MODE !== "api") {
  throw new Error(
    "playwright.real.config.ts prohíbe VITE_DATA_MODE distinto de 'api'. No se permiten fallbacks a mock.",
  );
}

const gatewayOrigin =
  process.env.VITE_GATEWAY_ORIGIN ?? process.env.G6_REAL_GATEWAY_URL ?? "";
const g7ApiBase = process.env.VITE_G7_API_BASE ?? "";

export default defineConfig({
  testDir: "./tests/e2e-real",
  testMatch: "**/*.real.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    video: "off",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: {
      ...process.env,
      VITE_DATA_MODE: "api",
      ...(gatewayOrigin ? { VITE_GATEWAY_ORIGIN: gatewayOrigin } : {}),
      ...(g7ApiBase ? { VITE_G7_API_BASE: g7ApiBase } : {}),
    },
  },
});
