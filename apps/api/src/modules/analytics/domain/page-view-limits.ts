import type { ObjectId } from '../../../shared/persistence/object-id.js';
import { addressKey } from '../../../shared/renderer-channel/address-key.js';

/** Rate-limit key of a visitor's views on a site; the address is a keyed hash, as for leads. */
export function pageViewClientKey(secret: Buffer, siteId: ObjectId, ip: string): string {
  return `view:ip:${siteId.toHexString()}:${addressKey(secret, siteId, ip)}`;
}

export function pageViewSiteKey(siteId: ObjectId): string {
  return `view:site:${siteId.toHexString()}`;
}
