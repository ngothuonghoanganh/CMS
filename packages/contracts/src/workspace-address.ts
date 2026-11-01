import { z } from 'zod';

/**
 * A workspace's admin address (ADR-025): 3–40 characters of a–z, 0–9 and dashes, neither first
 * nor last a dash.
 */
export const workspaceSlugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, 'Địa chỉ workspace không hợp lệ');

/** Where the slug goes in `ADMIN_WORKSPACE_ORIGIN_TEMPLATE`, e.g. "https://{slug}.app.example.vn". */
export const WORKSPACE_SLUG_PLACEHOLDER = '{slug}';

/** The origin of a workspace's admin address. */
export function workspaceOrigin(template: string, slug: string): string {
  return new URL(template.replace(WORKSPACE_SLUG_PLACEHOLDER, workspaceSlugSchema.parse(slug)))
    .origin;
}

/** The parts of the template's host around the slug, and its protocol. */
function hostPattern(template: string): { protocol: string; prefix: string; suffix: string } {
  const probe = 'slug-probe';
  const url = new URL(template.replace(WORKSPACE_SLUG_PLACEHOLDER, probe));
  const at = url.host.indexOf(probe);
  if (at < 0) {
    throw new Error(
      `The workspace address template puts ${WORKSPACE_SLUG_PLACEHOLDER} outside the host`,
    );
  }
  return {
    protocol: url.protocol,
    prefix: url.host.slice(0, at),
    suffix: url.host.slice(at + probe.length),
  };
}

/** The slug a host (with its port, as in the `Host` header) addresses; null for any other host. */
export function slugOfHost(template: string, host: string): string | null {
  const { prefix, suffix } = hostPattern(template);
  const lower = host.toLowerCase();
  if (!lower.startsWith(prefix) || !lower.endsWith(suffix)) {
    return null;
  }
  const slug = lower.slice(prefix.length, lower.length - suffix.length);
  return workspaceSlugSchema.safeParse(slug).success ? slug : null;
}

/** The slug an origin addresses, protocol included; null for any other origin. */
export function slugOfOrigin(template: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  return url.protocol === hostPattern(template).protocol && url.origin === origin
    ? slugOfHost(template, url.host)
    : null;
}
