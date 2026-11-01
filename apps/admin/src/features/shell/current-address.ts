import type { Membership } from '@plp/contracts';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { parseAdminEnv } from '../../env';
import {
  type AdminAddress,
  addressOf,
  addressRedirect,
  type WorkspaceAddresses,
} from './admin-address';
import { REQUEST_PATH_HEADER } from './request-path';

/** How addresses are made, or null without workspace addresses (ADR-025). */
export function workspaceAddresses(): WorkspaceAddresses | null {
  const env = parseAdminEnv(process.env);
  const template = env.ADMIN_WORKSPACE_ORIGIN_TEMPLATE;
  return template === undefined || env.ADMIN_ORIGIN === undefined
    ? null
    : { template, commonOrigin: new URL(env.ADMIN_ORIGIN).origin };
}

/** The address this request came to. */
export async function currentAddress(): Promise<AdminAddress> {
  return addressOf(workspaceAddresses(), (await headers()).get('host') ?? '');
}

/**
 * A workspace's screens open at its own address (ADR-025): at any other, the same path opens
 * there instead.
 */
export async function requireWorkspaceAddress(workspace: Membership['workspace']): Promise<void> {
  const target = addressRedirect(
    await currentAddress(),
    workspace.slug,
    (await headers()).get(REQUEST_PATH_HEADER) ?? '/',
  );
  if (target !== null) {
    redirect(target);
  }
}
