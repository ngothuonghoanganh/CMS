import type { ObjectId } from '../../../shared/persistence/object-id.js';
import { addressKey } from '../../../shared/renderer-channel/address-key.js';
import { addressNetwork } from '../../leads/domain/visitor-address.js';

/**
 * Rate-limit key of a visitor's views on a site: as for leads, a keyed hash of the address, or of
 * the /64 network of an IPv6 address.
 */
export function pageViewClientKey(secret: Buffer, siteId: ObjectId, ip: string): string {
  return `view:ip:${siteId.toHexString()}:${addressKey(secret, siteId, addressNetwork(ip))}`;
}

export function pageViewSiteKey(siteId: ObjectId): string {
  return `view:site:${siteId.toHexString()}`;
}
