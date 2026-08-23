import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class WebhookSecurityError extends Error {
  readonly code = 'WEBHOOK_URL_BLOCKED';

  constructor(message: string) {
    super(message);
    this.name = 'WebhookSecurityError';
  }
}

export type SafeWebhookTarget = {
  url: URL;
  address: string;
  family: 4 | 6;
};

export type WebhookUrlPolicyOptions = {
  allowHttp?: boolean;
  allowLocalNetwork?: boolean;
};

const MAX_REDIRECTS = 3;

export async function resolveSafeWebhookTarget(
  rawUrl: string,
  options: WebhookUrlPolicyOptions = {},
): Promise<SafeWebhookTarget> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new WebhookSecurityError('Webhook URL is malformed');
  }

  const allowHttp = options.allowHttp === true;
  const allowLocalNetwork = options.allowLocalNetwork === true;
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && allowHttp)) {
    throw new WebhookSecurityError('Webhook URL must use HTTPS');
  }
  if (url.username || url.password || url.hash) {
    throw new WebhookSecurityError(
      'Webhook URL cannot contain credentials or a fragment',
    );
  }

  const hostname = normalizeHostname(url.hostname);
  if (!allowLocalNetwork && isBlockedHostname(hostname)) {
    throw new WebhookSecurityError('Webhook URL targets a local or metadata hostname');
  }

  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily as 4 | 6 }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length) {
    throw new WebhookSecurityError('Webhook hostname did not resolve');
  }

  const blocked = addresses.find(({ address }) => isBlockedIp(address));
  if (blocked && !allowLocalNetwork) {
    throw new WebhookSecurityError(
      'Webhook URL resolves to a private or metadata network',
    );
  }

  const selected = addresses[0];
  if (!selected || !isIP(selected.address)) {
    throw new WebhookSecurityError('Webhook hostname resolved to an invalid address');
  }
  return {
    url,
    address: selected.address,
    family: selected.family as 4 | 6,
  };
}

export function isBlockedHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal') ||
    normalized === 'metadata' ||
    normalized === 'metadata.google.internal' ||
    normalized === 'instance-data.ec2.internal'
  );
}

export function isBlockedIp(value: string): boolean {
  const address = normalizeHostname(value);
  if (isIP(address) === 4) {
    const octets = address.split('.').map(Number);
    const number =
      octets[0]! * 2 ** 24 + octets[1]! * 2 ** 16 + octets[2]! * 2 ** 8 + octets[3]!;
    return (
      octets[0] === 0 ||
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 100 && octets[1]! >= 64 && octets[1]! <= 127) ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      number === 0xffffffff
    );
  }

  if (isIP(address) !== 6) return true;
  const normalized = address.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(normalized)) return true;

  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mappedIpv4 ? isBlockedIp(mappedIpv4[1]!) : false;
}

export function normalizeHostname(hostname: string): string {
  return hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
}

export function maxWebhookRedirects(): number {
  return MAX_REDIRECTS;
}
