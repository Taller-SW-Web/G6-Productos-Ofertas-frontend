import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 5173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("PLAYWRIGHT_PORT inválido.");

export default defineConfig({
  testDir: ".",
  testMatch: "*.browser.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: "../../../../test-results/pricing-http",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.PLAYWRIGHT_PORT,
  },
});
