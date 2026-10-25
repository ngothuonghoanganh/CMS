import { createHmac, hkdfSync } from 'node:crypto';
import type { ObjectId } from '../../../shared/persistence/object-id.js';

/** The key of visitor hashes, derived from the renderer channel's secret: never in the database. */
export function visitorHashSecret(rendererApiSecret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', rendererApiSecret, '', 'plp visitor hashes', 32));
}

/**
 * A unique visitor of one day (ADR-019): an HMAC of the day's salt, the site, the visitor's
 * address and user agent, keyed with a secret the database never holds. Neither the address nor
 * the browser is stored. The database alone (or a backup) cannot test an address against a hash,
 * since it lacks the key; once the salt expires, not even the key links a hash to anyone. Without
 * a trusted address every visitor with the same browser looks alike.
 */
export function visitorHash(
  secret: Buffer,
  input: { salt: string; siteId: ObjectId; ip: string | null; userAgent: string },
): string {
  return createHmac('sha256', secret)
    .update([input.salt, input.siteId.toHexString(), input.ip ?? '', input.userAgent].join('\n'))
    .digest('base64url');
}
