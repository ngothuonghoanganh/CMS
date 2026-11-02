import type { ReactNode } from 'react';
import { AppShell } from '../../../../features/shell/AppShell';
import { loadSiteContext } from '../../../../features/shell/site-context';
import { workspaceAddresses } from '../../../../features/shell/current-address';

/**
 * The workspace frame of a site: sidebar, workspace and site switchers, toasts and the `<main>`
 * landmark. Every page of the site (dashboard, leads, domain, settings, SEO, history) renders inside it.
 */
export default async function SiteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const { me, membership, site, sites, pageCount, memberCount, leadCounts } =
    await loadSiteContext(siteId);
  return (
    <AppShell
      user={me.user}
      memberships={me.memberships}
      membership={membership}
      site={site}
      sites={sites}
      pageCount={pageCount}
      memberCount={memberCount}
      leadCounts={leadCounts}
      addresses={workspaceAddresses()}
    >
      {children}
    </AppShell>
  );
}
