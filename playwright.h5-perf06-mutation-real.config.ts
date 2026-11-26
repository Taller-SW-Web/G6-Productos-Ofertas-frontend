import { defineConfig } from '@playwright/test';

if (process.env.G6_H5_PERF06_MUTATION_MODE !== 'real' || process.env.G6_H5_PERF06_ISOLATED_HARNESS !== '1')
  throw new Error('PERF06_MUTATION_REAL_EXPLICIT_HARNESS_REQUIRED');
const apiOrigin = new URL(process.env.G6_H5_PERF06_API_ORIGIN ?? '');
if (apiOrigin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(apiOrigin.hostname))
  throw new Error('PERF06_MUTATION_REAL_API_MUST_BE_LOOPBACK');
const port = Number(process.env.G6_H5_PERF06_MUTATION_PORT ?? '5431');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PERF06_MUTATION_REAL_PORT_INVALID');
process.env.VITE_DATA_MODE = 'api';
process.env.VITE_G6_ADMIN_API_ENABLED = 'true';
process.env.VITE_GATEWAY_ORIGIN = apiOrigin.origin;
process.env.G6_H5_DISABLE_SCREENSHOTS = '1';

export default defineConfig({
  testDir: './tests/h5',
  testMatch: 'perf06-mutation-real.pw.ts',
  outputDir: 'test-results/h5-perf06-mutation-real',
  preserveOutput: 'never',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 420_000,
  reporter: [['./tests/h5/safe-reporter.mjs']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    headless: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    acceptDownloads: false,
    serviceWorkers: 'block',
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: process.cwd(),
    url: `http://127.0.0.1:${port}/productos`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
