'use client';

import type { Site, TenantPermission } from '@payload/contracts';
import Link from 'next/link';

import { cmsViewPath, pagePath, pagesPath, sitePath, type CmsView } from './cms-routes';
import { StatusBadge } from './status-badge';

export function SiteContextNav({
  activeView,
  can,
  loading,
  site,
  workspaceId,
}: {
  activeView: CmsView;
  can: (permission: TenantPermission) => boolean;
  loading: boolean;
  site: Site | null;
  workspaceId: string;
}) {
  if (loading && !site) {
    return (
      <div aria-busy="true" className="site-context-nav site-context-nav-loading">
        Loading website…
      </div>
    );
  }
  if (!site) return null;

  const base = sitePath(workspaceId, site.id);
  const items = [
    {
      href: base,
      label: 'Overview',
      active: activeView === 'sites',
      visible: can('site.read'),
    },
    {
      href: pagePath(workspaceId, site.id, site.homePageId, 'builder'),
      label: 'Edit website',
      active: false,
      visible: can('page.read'),
    },
    {
      href: pagesPath(workspaceId, site.id),
      label: 'Pages',
      active: activeView === 'pages',
      visible: can('page.read'),
    },
    {
      href: cmsViewPath(workspaceId, 'design-system', site.id),
      label: 'Brand',
      active: activeView === 'design-system',
      visible: can('design-system.read'),
    },
    {
      href: cmsViewPath(workspaceId, 'site-settings', site.id),
      label: 'Settings',
      active: activeView === 'site-settings',
      visible:
        can('site.update') ||
        can('domain.read') ||
        can('seo.read') ||
        can('integration.read') ||
        can('collection.read') ||
        can('workflow.read'),
    },
  ].filter((item) => item.visible);

  return (
    <nav aria-label={`${site.name} website navigation`} className="site-context-nav">
      <div className="site-context-identity">
        <Link className="site-context-back" href={cmsViewPath(workspaceId, 'sites')}>
          ← All websites
        </Link>
        <div className="site-context-name">
          <strong title={site.name}>{site.name}</strong>
          <StatusBadge
            label={site.status === 'published' ? 'Live' : 'Draft'}
            status={site.status}
          />
        </div>
      </div>
      <div className="site-context-links">
        {items.map((item) => (
          <Link
            aria-current={item.active ? 'page' : undefined}
            className={item.active ? 'site-context-link active' : 'site-context-link'}
            href={item.href}
            key={item.label}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
