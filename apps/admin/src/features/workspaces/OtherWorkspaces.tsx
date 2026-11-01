'use client';

import type { Membership } from '@plp/contracts';
import { Button } from '@plp/ui';
import { loadPage } from '../../lib/page-load';
import { workspacePreferenceCookie } from '../shell/workspace-preference';

/**
 * At the one address, the other workspaces of a member stuck where they can do nothing: each opens
 * as the sidebar's switcher opens it, remembered as chosen.
 */
export function OtherWorkspaces({ memberships }: { memberships: readonly Membership[] }) {
  return memberships.map(({ workspace }) => (
    <Button
      key={workspace.id}
      type="button"
      variant="secondary"
      onClick={() => {
        document.cookie = workspacePreferenceCookie(workspace.id);
        loadPage('/');
      }}
    >
      Mở {workspace.name}
    </Button>
  ));
}
