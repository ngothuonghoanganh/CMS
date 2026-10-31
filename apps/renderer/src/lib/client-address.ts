import { isIP } from 'node:net';
import type { HeaderSource } from './host';

/** `[2001:db8::1]:443` or `[2001:db8::1]`: some proxies write an IPv6 address with brackets. */
const BRACKETED = /^\[([^\]]+)\](?::\d{1,5})?$/;
/** `203.0.113.7:4711`: some proxies add the client's port. */
const WITH_PORT = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/;
/** An IPv4 address carried in IPv6 (`::ffff:203.0.113.7`), as WHATWG URL serializes it. */
const IPV4_MAPPED = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/;

/**
 * One spelling per address: IPv6 compressed and lowercase, and an IPv4 address that a dual-stack
 * proxy reports in IPv6 form as plain IPv4. The same visitor then always lands in the same rate
 * limit bucket and counts as the same visitor (ADR-016, ADR-019).
 */
function canonicalAddress(entry: string): string | null {
  const unbracketed = BRACKETED.exec(entry)?.[1] ?? WITH_PORT.exec(entry)?.[1] ?? entry;
  const family = isIP(unbracketed);
  if (family === 4) {
    return unbracketed;
  }
  // A zone index (`fe80::1%en0`) never comes from beyond the edge proxy, and URL rejects it.
  if (family !== 6 || !URL.canParse(`http://[${unbracketed}]/`)) {
    return null;
  }
  const compressed = new URL(`http://[${unbracketed}]/`).hostname.slice(1, -1);
  const mapped = IPV4_MAPPED.exec(compressed);
  const high = mapped?.[1];
  const low = mapped?.[2];
  if (high === undefined || low === undefined) {
    return compressed;
  }
  const [a, b] = [Number.parseInt(high, 16), Number.parseInt(low, 16)];
  return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
}

/**
 * The visitor's address for the rate limits (ADR-016, ADR-019): the last `X-Forwarded-For` entry,
 * which the one trusted edge proxy appended. Entries before it are whatever the client sent, so
 * they never count. Without that proxy any client could write the header, so no address is
 * trusted and every visitor of a site shares one bucket, as in ADR-004.
 */
export function clientAddress(headers: HeaderSource, trustProxy: boolean): string | null {
  if (!trustProxy) {
    return null;
  }
  // Several header lines arrive joined by ", "; the edge proxy's entry is still the last one.
  const last = headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  return last === undefined || last === '' ? null : canonicalAddress(last);
}
