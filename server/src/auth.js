import crypto from 'node:crypto';

export function hashPassword(password) {
  const normalized = String(password ?? '').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function verifyPassword(password, storedHash) {
  return hashPassword(password) === storedHash;
}
