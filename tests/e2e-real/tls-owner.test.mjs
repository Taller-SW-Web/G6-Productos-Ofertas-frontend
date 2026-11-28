import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tlsOwnerCommand } from './tls-owner.mjs';

test('assigns the synthetic TLS key to the Linux runner without exposing it', () => {
  assert.equal(tlsOwnerCommand('linux', 1001, 127), ' && chown 1001:127 /out/server.key /out/server.crt');
  for (const uid of [undefined, -1, '1;id', 1.2]) {
    assert.throws(() => tlsOwnerCommand('linux', uid, 127), /G5_TLS_HOST_ID_UNAVAILABLE/);
  }
  assert.equal(tlsOwnerCommand('win32'), '');
});
