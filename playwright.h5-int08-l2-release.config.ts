import { defineConfig } from '@playwright/test';

if (process.env.G6_H5_INT08_L2_RUN !== '1' || process.env.G6_H5_INT08_L2_APPROVED !== '1')
  throw new Error('INT08_L2_EXPLICIT_APPROVED_OPT_IN_REQUIRED');
process.env.G6_H5_DISABLE_SCREENSHOTS = '1';
const port = Number(process.env.G6_H5_INT08_L2_PORT ?? '5421');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('INT08_L2_PORT_INVALID');
const preview = new URL(process.env.G6_H5_INT08_L2_PREVIEW_URL ?? '');
if (preview.protocol !== 'https:') throw new Error('INT08_L2_PREVIEW_MUST_USE_HTTPS');

export default defineConfig({
  testDir: './tests/h5',
  testMatch: 'int08.l2-release.pw.ts',
  outputDir: 'test-results/h5-int08-l2-release',
  preserveOutput: 'never',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 240_000,
  reporter: [['./tests/h5/safe-reporter.mjs']],
  use: {
    baseURL: preview.origin,
    browserName: 'chromium',
    headless: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    acceptDownloads: false,
    serviceWorkers: 'block',
  },
  webServer: undefined,
});
