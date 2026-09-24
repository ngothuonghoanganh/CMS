import type { TenantPermission } from '@payload/contracts';

import type { CmsView } from './cms-routes';
import type { CmsIconName } from './ui/icons';

export type NavigationItem = { key: CmsView; label: string; icon: CmsIconName };

export type NavigationSection = {
  collapsible?: boolean;
  items: NavigationItem[];
  label?: string;
  open?: boolean;
};

function permittedItem(
  can: (permission: TenantPermission) => boolean,
  permission: TenantPermission,
  item: NavigationItem,
): NavigationItem[] {
  return can(permission) ? [item] : [];
}

function permittedAny(
  can: (permission: TenantPermission) => boolean,
  permissions: readonly TenantPermission[],
  item: NavigationItem,
): NavigationItem[] {
  return permissions.some(can) ? [item] : [];
}

const settingsPermissions: readonly TenantPermission[] = [
  'workspace.read',
  'member.read',
  'user.read',
  'role.read',
  'billing.read',
  'audit.read',
  'collection.read',
  'analytics.read',
  'integration.read',
  'domain.read',
  'seo.read',
  'workflow.read',
  'extensions.read',
  'template.read',
];

/**
 * The primary navigation is intentionally task-based. Technical modules remain
 * routable, but they are reached from Settings so the first-run website journey
 * is not competing with administration and platform configuration.
 */
export function navigationSections(
  can: (permission: TenantPermission) => boolean,
  _activeNavigationKey?: CmsView,
): NavigationSection[] {
  const primary: NavigationItem[] = [
    { icon: 'dashboard', key: 'dashboard', label: 'Home' },
    ...permittedItem(can, 'site.read', {
      icon: 'sites',
      key: 'sites',
      label: 'Websites',
    }),
    ...permittedItem(can, 'lead.read', {
      icon: 'submissions',
      key: 'submissions',
      label: 'Responses',
    }),
    ...permittedItem(can, 'asset.read', {
      icon: 'assets',
      key: 'assets',
      label: 'Library',
    }),
    ...permittedAny(can, settingsPermissions, {
      icon: 'settings',
      key: 'settings',
      label: 'Settings',
    }),
  ];

  return primary.length ? [{ items: primary }] : [];
}
