import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** A webhook step's secret as it is stored: AES-256-GCM, never in clear (ADR-034). */
export interface StoredWebhookSecret {
  id: string;
  ciphertext: string;
  iv: string;
  tag: string;
}

/** The key of `AUTOMATION_SECRET_KEY`: any 32+ characters, hashed to the 32 bytes AES needs. */
function keyOf(secretKey: string): Buffer {
  return createHash('sha256').update(secretKey, 'utf8').digest();
}

/** A new secret to sign with, as the receiving system copies it: 32 random bytes in hex. */
export function newWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString('hex')}`;
}

export function newSecretId(): string {
  return randomBytes(9).toString('base64url');
}

export function encryptSecret(secretKey: string, id: string, secret: string): StoredWebhookSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyOf(secretKey), iv);
  // The id is bound to the ciphertext: a secret cannot be moved to another step.
  cipher.setAAD(Buffer.from(id, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return {
    id,
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

/** The secret in clear; throws when the key changed or the record was altered. */
export function decryptSecret(secretKey: string, stored: StoredWebhookSecret): string {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyOf(secretKey),
    Buffer.from(stored.iv, 'base64'),
  );
  decipher.setAAD(Buffer.from(stored.id, 'utf8'));
  decipher.setAuthTag(Buffer.from(stored.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(stored.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
