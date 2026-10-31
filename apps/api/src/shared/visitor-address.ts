import { isIPv4, isIPv6 } from 'node:net';

/** `203.0.113.7:51234`: an IPv4 address with the port of the client's connection. */
const IPV4_WITH_PORT = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/;

/** `[2001:db8::1]:51234` or `[2001:db8::1]`: an IPv6 address in brackets, with or without a port. */
const IPV6_IN_BRACKETS = /^\[([^\]]+)\](?::\d{1,5})?$/;

/** `::ffff:a.b.c.d`: an IPv4 visitor seen through an IPv6 socket. */
const IPV4_MAPPED_PREFIX = [0, 0, 0, 0, 0, 0xffff] as const;

function parseGroups(text: string): number[] {
  return text === '' ? [] : text.split(':').map((group) => Number.parseInt(group, 16));
}

/** The eight 16-bit groups of an address `isIPv6` accepted. */
function ipv6Groups(ip: string): number[] {
  // A zone index ("fe80::1%eth0") names an interface of the proxy, not the visitor.
  let text = ip.split('%')[0] ?? '';
  const tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (tail) {
    const [a = 0, b = 0, c = 0, d = 0] = tail.slice(1).map(Number);
    text = `${text.slice(0, tail.index)}${(a * 256 + b).toString(16)}:${(c * 256 + d).toString(16)}`;
  }
  const [head = '', rest] = text.split('::');
  const left = parseGroups(head);
  const right = rest === undefined ? [] : parseGroups(rest);
  const zeros = rest === undefined ? 0 : 8 - left.length - right.length;
  return [...left, ...Array.from({ length: zeros }, () => 0), ...right];
}

/**
 * A forwarded address without the port some load balancers write into `X-Forwarded-For`: the
 * port is dropped from `ip:port`, and the brackets and port from `[v6]:port`. Anything else comes
 * back as it is, for the caller to check with `isIP`.
 */
export function withoutPort(forwarded: string): string {
  return (IPV4_WITH_PORT.exec(forwarded) ?? IPV6_IN_BRACKETS.exec(forwarded))?.[1] ?? forwarded;
}

/**
 * One spelling per visitor address, so one visitor is one rate-limit bucket and one unique
 * visitor however the edge proxy wrote the address: an IPv4-mapped IPv6 address
 * (`::ffff:203.0.113.7`) is the IPv4 address, and an IPv6 address is its eight groups in lowercase
 * hex without leading zeros (`2001:DB8::0001` and `2001:db8:0:0:0:0:0:1` are the same).
 */
export function canonicalAddress(ip: string): string {
  if (isIPv4(ip)) {
    return ip;
  }
  if (!isIPv6(ip)) {
    // The renderer guard only lets valid addresses through; the address itself is not logged.
    throw new Error('A visitor address that is not an IP address reached the API');
  }
  const groups = ipv6Groups(ip);
  if (IPV4_MAPPED_PREFIX.every((group, index) => groups[index] === group)) {
    const [high = 0, low = 0] = groups.slice(6);
    return [Math.floor(high / 256), high % 256, Math.floor(low / 256), low % 256].join('.');
  }
  return groups.map((group) => group.toString(16)).join(':');
}

/**
 * The bucket a visitor's rate limits count in (ADR-016, ADR-019): their IPv4 address, or the /64
 * network of their IPv6 address. One subscriber (a phone, a home router) holds a whole /64, so a
 * limit per IPv6 address would let them send from as many addresses as they like.
 */
export function addressNetwork(ip: string): string {
  const address = canonicalAddress(ip);
  return isIPv4(address) ? address : `${address.split(':').slice(0, 4).join(':')}::/64`;
}
