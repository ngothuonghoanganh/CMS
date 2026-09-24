'use client';

import Link from 'next/link';

import { useCmsShell } from '../cms-shell';
import { cmsViewPath, collectionPath, pagesPath, sitePath } from '../cms-routes';
import { EmptyState, PageHeader } from '../ui/surfaces';

function withSiteQuery(path: string, siteId: string): string {
  return `${path}?siteId=${encodeURIComponent(siteId)}`;
}

export default function SiteSettingsPage({ siteId }: { siteId: string }) {
  const { can, currentSite, currentSiteLoading, workspaceId } = useCmsShell();

  if (currentSiteLoading) {
    return (
      <>
        <PageHeader
          description="Settings for the website you are editing."
          eyebrow="Website"
          title="Website settings"
        />
        <div aria-busy="true" className="analytics-skeleton">
          Loading website settings…
        </div>
      </>
    );
  }

  if (!currentSite || currentSite.id !== siteId) {
    return (
      <>
        <PageHeader
          description="Settings for the website you are editing."
          eyebrow="Website"
          title="Website settings"
        />
        <EmptyState
          description="We could not load this website. Go back to Websites and try again."
          title="Website not found"
        />
      </>
    );
  }

  const base = sitePath(workspaceId, siteId);
  const groups = [
    {
      title: 'Basics',
      items: [
        ...(can('site.update')
          ? [
              {
                description: 'Name, URL slug and logo.',
                href: `${base}/edit`,
                label: 'Website details',
              },
            ]
          : []),
        ...(can('page.read')
          ? [
              {
                description: 'Add pages and manage the website structure.',
                href: pagesPath(workspaceId, siteId),
                label: 'Pages and navigation',
              },
            ]
          : []),
      ],
    },
    {
      title: 'Publishing',
      items: [
        ...(can('domain.read')
          ? [
              {
                description: 'Connect the address people use to visit you.',
                href: cmsViewPath(workspaceId, 'domains', siteId),
                label: 'Domain',
              },
            ]
          : []),
        ...(can('seo.read')
          ? [
              {
                description: 'Set how pages appear in search results.',
                href: cmsViewPath(workspaceId, 'seo', siteId),
                label: 'SEO',
              },
            ]
          : []),
      ],
    },
    {
      title: 'Advanced',
      items: [
        ...(can('integration.read')
          ? [
              {
                description: 'Connect forms to email, CRM or webhooks.',
                href: withSiteQuery(cmsViewPath(workspaceId, 'integrations'), siteId),
                label: 'Integrations',
              },
            ]
          : []),
        ...(can('collection.read')
          ? [
              {
                description: 'Manage structured content for this website.',
                href: collectionPath(workspaceId, siteId),
                label: 'Content',
              },
            ]
          : []),
        ...(can('workflow.read')
          ? [
              {
                description: 'Automate actions across this website.',
                href: cmsViewPath(workspaceId, 'workflows', siteId),
                label: 'Workflows',
              },
            ]
          : []),
      ],
    },
  ].filter((group) => group.items.length > 0);

  return (
    <>
      <PageHeader
        description={`These settings apply to ${currentSite.name}. Company defaults stay in Workspace settings.`}
        eyebrow="Website"
        title="Website settings"
      />
      <div className="settings-groups">
        {groups.map((group) => (
          <section className="settings-group panel" key={group.title}>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Website settings</span>
                <h2>{group.title}</h2>
              </div>
            </div>
            <div className="settings-link-grid">
              {group.items.map((item) => (
                <Link className="settings-link-card" href={item.href} key={item.href}>
                  <span className="settings-link-copy">
                    <strong>{item.label}</strong>
                    <span className="muted">{item.description}</span>
                  </span>
                  <span aria-hidden="true" className="settings-link-arrow">
                    →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
