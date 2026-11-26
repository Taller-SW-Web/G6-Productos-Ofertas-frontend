import test from 'node:test';
import assert from 'node:assert/strict';
import { prerequisite } from './int06-runner.mjs';
test('missing backend and mismatched provider are blocked, never pass',()=>{
 assert.equal(prerequisite({}).execution_result,'BLOCKED_PROVIDER');
 assert.equal(prerequisite({G6_INT06_BACKEND_PATH:'__missing__'}).execution_result,'BLOCKED_PROVIDER');
});
