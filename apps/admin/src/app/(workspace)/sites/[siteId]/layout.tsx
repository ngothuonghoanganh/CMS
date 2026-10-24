import type { ReactNode } from 'react';
import { AppShell } from '../../../../features/shell/AppShell';
import { loadSiteContext } from '../../../../features/shell/site-context';

/**
 * The workspace frame of a site: sidebar, workspace and site switchers, toasts and the `<main>`
 * landmark. Every page of the site (dashboard, domain, settings, SEO, history) renders inside it.
 */
export default async function SiteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const { me, membership, site, sites, pageCount } = await loadSiteContext(siteId);
  return (
    <AppShell
      user={me.user}
      memberships={me.memberships}
      membership={membership}
      site={site}
      sites={sites}
      pageCount={pageCount}
    >
      {children}
    </AppShell>
  );
}
