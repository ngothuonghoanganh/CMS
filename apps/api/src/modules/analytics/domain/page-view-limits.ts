import { createHash } from 'node:crypto';
import type { ObjectId } from '../../../shared/persistence/object-id.js';

/** Rate-limit key of a visitor's views on a site; the address is hashed, as for leads. */
export function pageViewClientKey(siteId: ObjectId, ip: string): string {
  return `view:ip:${siteId.toHexString()}:${createHash('sha256').update(ip).digest('hex')}`;
}

export function pageViewSiteKey(siteId: ObjectId): string {
  return `view:site:${siteId.toHexString()}`;
}
