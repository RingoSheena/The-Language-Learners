import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './auth.js';

test('hashPassword produces a stable hash for the same password', () => {
  const first = hashPassword('secret123');
  const second = hashPassword('secret123');

  assert.equal(first, second);
  assert.notEqual(first, 'secret123');
});

test('verifyPassword matches a stored hash and rejects a different password', () => {
  const stored = hashPassword('secret123');

  assert.equal(verifyPassword('secret123', stored), true);
  assert.equal(verifyPassword('wrong-password', stored), false);
});
