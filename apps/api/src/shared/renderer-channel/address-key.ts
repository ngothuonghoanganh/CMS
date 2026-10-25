import { createHmac, hkdfSync } from 'node:crypto';
import type { ObjectId } from '../persistence/object-id.js';

/**
 * The key of visitors' address hashes, derived from the renderer channel's secret: only the API
 * and the renderer hold it, never the database.
 */
export function addressKeySecret(rendererApiSecret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', rendererApiSecret, '', 'plp visitor address keys', 32));
}

/**
 * A visitor's address as a rate-limit bucket that the database alone cannot turn back into the
 * address (rule 11): a plain hash of an IPv4 address is undone by hashing all 2^32 of them, an
 * HMAC keyed outside the database is not. Per site, so one visitor is not linked across sites.
 */
export function addressKey(secret: Buffer, siteId: ObjectId, ip: string): string {
  return createHmac('sha256', secret).update(`${siteId.toHexString()}\n${ip}`).digest('hex');
}
