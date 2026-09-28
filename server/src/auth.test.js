import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './auth.js';

test('hashPassword salts each call, so the same password hashes differently', () => {
  const first = hashPassword('secret123');
  const second = hashPassword('secret123');

  assert.notEqual(first, second);
  assert.notEqual(first, 'secret123');
});

test('verifyPassword matches a stored hash and rejects a different password', () => {
  const stored = hashPassword('secret123');

  assert.equal(verifyPassword('secret123', stored), true);
  assert.equal(verifyPassword('wrong-password', stored), false);
});

test('verifyPassword rejects a malformed stored hash instead of throwing', () => {
  assert.equal(verifyPassword('secret123', 'not-a-valid-hash'), false);
  assert.equal(verifyPassword('secret123', ''), false);
  assert.equal(verifyPassword('secret123', undefined), false);
});
