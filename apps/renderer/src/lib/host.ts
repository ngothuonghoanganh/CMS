import { subdomainSchema } from '@plp/contracts';
import type { RendererEnv } from '../env';

/** The part of `Headers` the host lookup needs; `headers()` and `Request.headers` both fit. */
export interface HeaderSource {
  get(name: string): string | null;
}

interface HostParts {
  hostname: string;
  port: string | null;
}

const HOST_PARTS = /^([a-z0-9.-]+)(?::(\d{1,5}))?$/;
/** Ports a proxy may leave in the Host header when BASE_DOMAIN names none. */
const DEFAULT_PORTS: readonly string[] = ['80', '443'];

function splitHost(value: string): HostParts | null {
  const match = HOST_PARTS.exec(value);
  const hostname = match?.[1];
  if (hostname === undefined) {
    return null;
  }
  return { hostname, port: match?.[2] ?? null };
}

function portMatches(requested: string | null, expected: string | null): boolean {
  if (expected !== null) {
    return requested === expected;
  }
  return requested === null || DEFAULT_PORTS.includes(requested);
}

/**
 * The site subdomain a host addresses, or null when the host is not exactly one valid label under
 * BASE_DOMAIN. Nothing else (apex, nested labels, foreign hosts, reserved names) is a site.
 */
export function subdomainFromHost(host: string | null, baseDomain: string): string | null {
  if (host === null) {
    return null;
  }
  const requested = splitHost(host.trim().toLowerCase());
  const base = splitHost(baseDomain.trim().toLowerCase());
  if (requested === null || base === null || !portMatches(requested.port, base.port)) {
    return null;
  }
  const suffix = `.${base.hostname}`;
  if (!requested.hostname.endsWith(suffix)) {
    return null;
  }
  const label = requested.hostname.slice(0, -suffix.length);
  if (label.includes('.')) {
    return null;
  }
  const parsed = subdomainSchema.safeParse(label);
  return parsed.success && parsed.data === label ? label : null;
}

/** What a host addresses: a site's default address, or a custom domain to look up (ADR-022). */
export type HostTarget =
  { kind: 'default'; subdomain: string } | { kind: 'custom'; hostname: string };

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/**
 * The site a host addresses: one label under BASE_DOMAIN is a default address; any other domain
 * on the same port, not under BASE_DOMAIN, may be a site's custom domain. Null for anything else.
 */
export function hostTarget(host: string | null, baseDomain: string): HostTarget | null {
  const subdomain = subdomainFromHost(host, baseDomain);
  if (subdomain !== null) {
    return { kind: 'default', subdomain };
  }
  if (host === null) {
    return null;
  }
  const requested = splitHost(
    host
      .trim()
      .toLowerCase()
      .replace(/\.(?=:|$)/, ''),
  );
  const base = splitHost(baseDomain.trim().toLowerCase());
  if (requested === null || base === null || !portMatches(requested.port, base.port)) {
    return null;
  }
  const { hostname } = requested;
  const labels = hostname.split('.');
  if (
    hostname === base.hostname ||
    hostname.endsWith(`.${base.hostname}`) ||
    labels.length < 2 ||
    !labels.every((label) => LABEL.test(label))
  ) {
    return null;
  }
  return { kind: 'custom', hostname };
}

/** The host name without its port, as the API names a custom domain. */
export function hostnameOf(host: string | null): string | null {
  return host === null ? null : (splitHost(host.trim().toLowerCase())?.hostname ?? null);
}

/** The host the visitor asked for; `x-forwarded-host` counts only behind a trusted proxy. */
export function requestHost(headers: HeaderSource, trustProxy: boolean): string | null {
  if (trustProxy) {
    // A chain of proxies appends values; the first one is the host the visitor used.
    const forwarded = headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    if (forwarded !== undefined && forwarded !== '') {
      return forwarded;
    }
  }
  return headers.get('host');
}

export function subdomainFromHeaders(
  headers: HeaderSource,
  env: Pick<RendererEnv, 'BASE_DOMAIN' | 'TRUST_PROXY'>,
): string | null {
  return subdomainFromHost(requestHost(headers, env.TRUST_PROXY), env.BASE_DOMAIN);
}
