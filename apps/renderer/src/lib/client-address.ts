import { isIP } from 'node:net';
import type { HeaderSource } from './host';

/**
 * The visitor's address for the lead rate limit (ADR-016): the last `X-Forwarded-For` entry,
 * which the trusted edge proxy appended. Without that proxy any client could write the header,
 * so no address is trusted and every visitor of a site shares one bucket, as in ADR-004.
 */
export function clientAddress(headers: HeaderSource, trustProxy: boolean): string | null {
  if (!trustProxy) {
    return null;
  }
  const last = headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  return last !== undefined && isIP(last) !== 0 ? last : null;
}
