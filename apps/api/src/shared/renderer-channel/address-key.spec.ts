import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { toObjectId } from '../persistence/object-id.js';
import { addressKey, addressKeySecret } from './address-key.js';

const SECRET = addressKeySecret('renderer-api-secret-of-at-least-32-chars');
const SITE_A = toObjectId('64b0000000000000000000a1');
const SITE_B = toObjectId('64b0000000000000000000a2');
const IP = '203.0.113.7';

describe('addressKey', () => {
  it('is one bucket per address and site, and no plain hash of the address', () => {
    const key = addressKey(SECRET, SITE_A, IP);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(addressKey(SECRET, SITE_A, IP)).toBe(key);
    expect(addressKey(SECRET, SITE_A, '203.0.113.8')).not.toBe(key);
    // Hashing every IPv4 address finds nothing: the key needs the secret.
    expect(key).not.toBe(createHash('sha256').update(IP).digest('hex'));
    expect(key).not.toBe(
      createHash('sha256').update(`${SITE_A.toHexString()}\n${IP}`).digest('hex'),
    );
  });

  it('does not link one visitor across sites, nor across secrets', () => {
    const key = addressKey(SECRET, SITE_A, IP);
    expect(addressKey(SECRET, SITE_B, IP)).not.toBe(key);
    expect(
      addressKey(addressKeySecret('another-renderer-api-secret-32-chars!!'), SITE_A, IP),
    ).not.toBe(key);
  });

  it('keys the hashes with a secret of its own, not the renderer secret itself', () => {
    const renderer = 'renderer-api-secret-of-at-least-32-chars';
    expect(addressKeySecret(renderer)).toHaveLength(32);
    expect(addressKeySecret(renderer).equals(Buffer.from(renderer))).toBe(false);
  });
});
