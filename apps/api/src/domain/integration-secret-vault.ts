import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

export class IntegrationSecretVault {
  private readonly key: Buffer;

  constructor(secretKey: string | undefined) {
    if (!secretKey) {
      throw new Error(
        'INTEGRATION_SECRET_ENCRYPTION_KEY is required for integration secrets',
      );
    }
    this.key = createHash('sha256').update(secretKey, 'utf8').digest();
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      iv.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join(':');
  }

  decrypt(ciphertext: string): string {
    const [version, ivValue, tagValue, encryptedValue] = ciphertext.split(':');
    if (version !== VERSION || !ivValue || !tagValue || !encryptedValue) {
      throw new Error('Unsupported integration secret ciphertext');
    }
    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(ivValue, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
