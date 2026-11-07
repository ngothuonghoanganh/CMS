import { BlockList, isIP } from 'node:net';

/**
 * Addresses a webhook never reaches (ADR-034): this machine, private and shared networks,
 * link-local, documentation and benchmark ranges, multicast and reserved space, in IPv4 and IPv6.
 */
const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

/** The IPv4 address an IPv4-mapped IPv6 address (`::ffff:10.0.0.1`) stands for. */
function mappedIpv4(address: string): string | null {
  const match = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (match?.[1] !== undefined) {
    return match[1];
  }
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (hex?.[1] === undefined || hex[2] === undefined) {
    return null;
  }
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

/** Whether a webhook may connect to this address; anything that is not an IP is refused. */
export function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    return blocked.check(address, 'ipv4');
  }
  if (version === 6) {
    const v4 = mappedIpv4(address);
    return v4 !== null ? blocked.check(v4, 'ipv4') : blocked.check(address, 'ipv6');
  }
  return true;
}

/** The host and path a webhook URL names, or null when it is not HTTPS on port 443. */
export function webhookTarget(value: string): URL | null {
  if (!URL.canParse(value)) {
    return null;
  }
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    (url.port !== '' && url.port !== '443') ||
    url.username !== '' ||
    url.password !== '' ||
    url.hostname === ''
  ) {
    return null;
  }
  return url;
}
