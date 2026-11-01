import { slugOfHost, workspaceOrigin } from '@plp/contracts';

/**
 * Where the admin is open (ADR-025): at the one address of a deployment without workspace
 * addresses, at the common address, or at a workspace's address.
 */
export type AdminAddress =
  | { kind: 'single' }
  | { kind: 'common'; addresses: WorkspaceAddresses }
  | { kind: 'workspace'; slug: string; addresses: WorkspaceAddresses };

/** How addresses are made, for the server and for the sidebar's workspace switcher. */
export interface WorkspaceAddresses {
  /** `ADMIN_WORKSPACE_ORIGIN_TEMPLATE`, e.g. "https://{slug}.app.example.vn". */
  template: string;
  /** The common address's origin. */
  commonOrigin: string;
}

/** The address a request's `Host` names; any host that is not a workspace's is the common one. */
export function addressOf(addresses: WorkspaceAddresses | null, host: string): AdminAddress {
  if (addresses === null) {
    return { kind: 'single' };
  }
  const slug = slugOfHost(addresses.template, host);
  return slug === null ? { kind: 'common', addresses } : { kind: 'workspace', slug, addresses };
}

/** The workspace's own origin. */
export function workspaceHome(addresses: WorkspaceAddresses, slug: string): string {
  return workspaceOrigin(addresses.template, slug);
}

/**
 * Where to send a request for a workspace's screen opened at another address: the same path at
 * the workspace's address. Null when it is already there, or there are no addresses. `path` is
 * the proxy's header; anything that is not a plain local path becomes `/`.
 */
export function addressRedirect(address: AdminAddress, slug: string, path: string): string | null {
  if (address.kind === 'single' || (address.kind === 'workspace' && address.slug === slug)) {
    return null;
  }
  const local = /^\/(?![/\\])/.test(path) ? path : '/';
  return `${workspaceHome(address.addresses, slug)}${local}`;
}
