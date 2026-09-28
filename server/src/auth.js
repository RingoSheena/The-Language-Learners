import crypto from 'node:crypto';

const KEY_LENGTH = 64;

// scrypt with a random per-password salt, stored alongside the derived key
// as "salt:key" (both hex). A previous version of this file hashed with
// plain unsalted SHA-256, which produces the same output for the same
// password every time -- exactly what a salt exists to prevent, since
// identical hashes for identical passwords is what makes rainbow-table
// attacks against a leaked user table practical.
export function hashPassword(password) {
  const normalized = String(password ?? '').trim();
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(normalized, salt, KEY_LENGTH);

  return `${salt}:${derivedKey.toString('hex')}`;
}

export function verifyPassword(password, storedHash) {
  const normalized = String(password ?? '').trim();
  const [salt, key] = String(storedHash ?? '').split(':');

  if (!salt || !key) {
    return false;
  }

  const keyBuffer = Buffer.from(key, 'hex');
  const derivedKey = crypto.scryptSync(normalized, salt, KEY_LENGTH);

  // timingSafeEqual throws on length mismatch rather than returning false,
  // and requires equal-length buffers -- guard that explicitly first.
  return keyBuffer.length === derivedKey.length && crypto.timingSafeEqual(keyBuffer, derivedKey);
}
