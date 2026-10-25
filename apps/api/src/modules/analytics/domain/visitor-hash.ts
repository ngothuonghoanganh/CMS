import { createHash } from 'node:crypto';
import type { ObjectId } from '../../../shared/persistence/object-id.js';

/**
 * A unique visitor of one day (ADR-019): sha256 of the day's salt, the site, the visitor's address
 * and user agent. Neither is stored; once the salt expires the hash points to no one. Without a
 * trusted address every visitor with the same browser looks alike.
 */
export function visitorHash(input: {
  salt: string;
  siteId: ObjectId;
  ip: string | null;
  userAgent: string;
}): string {
  return createHash('sha256')
    .update([input.salt, input.siteId.toHexString(), input.ip ?? '', input.userAgent].join('\n'))
    .digest('base64url');
}
