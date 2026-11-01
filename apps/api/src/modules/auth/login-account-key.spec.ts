import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loginAccountKey } from './login-attempts.repository.js';

const SECRET = 'login-attempt-secret-of-at-least-32-chars';
const EMAIL = 'lan@smilecare.vn';

describe('loginAccountKey', () => {
  it('is one key per email, and no plain hash of it', () => {
    const key = loginAccountKey(SECRET, EMAIL);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(loginAccountKey(SECRET, EMAIL)).toBe(key);
    expect(loginAccountKey(SECRET, 'mai@smilecare.vn')).not.toBe(key);
    // Hashing a list of emails finds nothing: the key needs the secret.
    expect(key).not.toBe(createHash('sha256').update(EMAIL).digest('hex'));
  });

  it('changes with the secret', () => {
    expect(loginAccountKey('another-login-attempt-secret-32-chars!!', EMAIL)).not.toBe(
      loginAccountKey(SECRET, EMAIL),
    );
  });
});
