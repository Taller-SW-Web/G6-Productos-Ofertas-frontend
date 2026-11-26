import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAllowedLoopbackOrigin } from './loopback-only-proxy.mjs';

test('proxy allowlist only accepts configured HTTP loopback origins', () => {
  const allowlist = ['http://127.0.0.1:5173', 'http://127.0.0.1:8081'];
  assert.equal(isAllowedLoopbackOrigin('http://127.0.0.1:5173/path', allowlist), true);
  assert.equal(isAllowedLoopbackOrigin('http://127.0.0.1:8081/api', allowlist), true);
  assert.equal(isAllowedLoopbackOrigin('https://127.0.0.1:5173', allowlist), false);
  assert.equal(isAllowedLoopbackOrigin('http://example.invalid:5173', allowlist), false);
  assert.equal(isAllowedLoopbackOrigin('http://127.0.0.1:5174', allowlist), false);
});

test('PERF06 measured run uses CDP transfer metrics and no Playwright route interception', async () => {
  const source = await readFile(new URL('./perf06.pw.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:page|context)\.route\s*\(/);
  assert.match(source, /Network\.loadingFinished/);
  assert.match(source, /encodedDataLength/);
});
