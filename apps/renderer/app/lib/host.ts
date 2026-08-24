import { headers } from 'next/headers';

import { normalizeHostname } from '@payload/contracts';

function configuredPlatformHostnames(): Set<string> {
  const values = [
    process.env.PUBLIC_PLATFORM_HOST,
    process.env.NEXT_PUBLIC_RENDERER_BASE_URL,
    process.env.PUBLIC_PLATFORM_ORIGIN,
  ];
  const hostnames = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    try {
      const url = value.includes('://') ? new URL(value) : new URL(`http://${value}`);
      const normalized = normalizeHostname(url.hostname);
      if (normalized) hostnames.add(normalized);
    } catch {
      // Invalid optional configuration is ignored; the API remains authoritative.
    }
  }
  return hostnames;
}

function stripPort(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) return null;
  const portSeparator = trimmed.lastIndexOf(':');
  if (portSeparator > -1) {
    if (!/^\d+$/.test(trimmed.slice(portSeparator + 1))) return null;
    return trimmed.slice(0, portSeparator);
  }
  return trimmed;
}

export async function getRequestHostname(): Promise<string | null> {
  const requestHeaders = await headers();
  const forwardedHost =
    process.env.TRUST_PROXY === 'true'
      ? requestHeaders.get('x-forwarded-host')?.split(',')[0]
      : undefined;
  const rawHost = forwardedHost ?? requestHeaders.get('host');
  if (!rawHost) return null;
  const hostWithoutPort = stripPort(rawHost);
  if (hostWithoutPort?.toLowerCase() === 'localhost') return 'localhost';
  return normalizeHostname(hostWithoutPort ?? '');
}

export function isPlatformHostname(hostname: string): boolean {
  if (configuredPlatformHostnames().has(hostname)) return true;
  if (process.env.NODE_ENV === 'production') return false;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function getPlatformOrigin(): URL {
  const configured =
    process.env.PUBLIC_PLATFORM_ORIGIN ?? process.env.NEXT_PUBLIC_RENDERER_BASE_URL;
  try {
    return new URL(configured ?? 'http://127.0.0.1:3002');
  } catch {
    return new URL('http://127.0.0.1:3002');
  }
}
