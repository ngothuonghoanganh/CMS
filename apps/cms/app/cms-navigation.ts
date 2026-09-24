import type { TenantPermission } from '@payload/contracts';

import type { CmsView } from './cms-routes';
import type { CmsIconName } from './ui/icons';

export type NavigationItem = { key: CmsView; label: string; icon: CmsIconName };

export type NavigationSection = {
  collapsible?: boolean;
  items: NavigationItem[];
  label: string;
  open?: boolean;
};

function permittedItem(
  can: (permission: TenantPermission) => boolean,
  permission: TenantPermission,
  item: NavigationItem,
): NavigationItem[] {
  return can(permission) ? [item] : [];
}

/**
 * Keep the first-run navigation focused on the Create → Publish journey.
 * Less common administration and platform tools remain available without
 * competing with the primary website workflow.
 */
export function navigationSections(
  can: (permission: TenantPermission) => boolean,
  activeNavigationKey?: CmsView,
): NavigationSection[] {
  const home: NavigationItem[] = [{ icon: 'dashboard', key: 'dashboard', label: 'Home' }];
  const website: NavigationItem[] = [
    ...permittedItem(can, 'site.read', {
      icon: 'sites',
      key: 'sites',
      label: 'Websites',
    }),
    ...permittedItem(can, 'page.read', { icon: 'pages', key: 'pages', label: 'Pages' }),
    ...permittedItem(can, 'design-system.read', {
      icon: 'designSystem',
      key: 'design-system',
      label: 'Brand & styles',
    }),
    ...permittedItem(can, 'asset.read', {
      icon: 'assets',
      key: 'assets',
      label: 'Media',
    }),
    ...permittedItem(can, 'template.read', {
      icon: 'templates',
      key: 'templates',
      label: 'Templates',
    }),
  ];
  const results: NavigationItem[] = [
    ...permittedItem(can, 'lead.read', {
      icon: 'submissions',
      key: 'submissions',
      label: 'Form responses',
    }),
  ];
  const moreTools: NavigationItem[] = [
    ...permittedItem(can, 'collection.read', {
      icon: 'collections',
      key: 'collections',
      label: 'Content',
    }),
    ...permittedItem(can, 'analytics.read', {
      icon: 'analytics',
      key: 'analytics',
      label: 'Analytics',
    }),
    ...permittedItem(can, 'integration.read', {
      icon: 'integrations',
      key: 'integrations',
      label: 'Integrations',
    }),
    ...permittedItem(can, 'domain.read', {
      icon: 'domains',
      key: 'domains',
      label: 'Domains',
    }),
    ...permittedItem(can, 'seo.read', { icon: 'seo', key: 'seo', label: 'SEO' }),
    ...permittedItem(can, 'workspace.read', {
      icon: 'organization',
      key: 'organization',
      label: 'Organization',
    }),
    ...permittedItem(can, 'workflow.read', {
      icon: 'workflows',
      key: 'workflows',
      label: 'Workflows',
    }),
    ...permittedItem(can, 'billing.read', {
      icon: 'billing',
      key: 'billing',
      label: 'Billing & Usage',
    }),
    ...permittedItem(can, 'user.read', { icon: 'users', key: 'users', label: 'Users' }),
    ...permittedItem(can, 'role.read', { icon: 'roles', key: 'roles', label: 'Roles' }),
    ...permittedItem(can, 'audit.read', {
      icon: 'audit',
      key: 'audit',
      label: 'Audit Log',
    }),
    ...(can('extensions.read') || can('layout.read')
      ? [
          {
            icon: 'extensions',
            key: 'extensions',
            label: 'Extensions',
          } satisfies NavigationItem,
        ]
      : []),
  ];

  return [
    { label: 'Home', items: home },
    { label: 'Website', items: website },
    { label: 'Results', items: results },
    {
      collapsible: true,
      items: moreTools,
      label: 'More tools',
      open: moreTools.some((item) => item.key === activeNavigationKey),
    },
  ].filter((section) => section.items.length > 0);
}
