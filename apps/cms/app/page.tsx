'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import CmsShell from './cms-shell';
import OverviewPage from './overview/overview-page';
import { api } from './lib/api';
import {
  collectionPath,
  cmsViewPath,
  pagePath,
  pagesPath,
  type CmsView,
} from './cms-routes';

const cmsViews = new Set<CmsView>([
  'analytics',
  'assets',
  'audit',
  'billing',
  'collections',
  'design-system',
  'domains',
  'extensions',
  'integrations',
  'navigation',
  'organization',
  'pages',
  'roles',
  'seo',
  'sites',
  'submissions',
  'templates',
  'users',
  'workflows',
]);

export default function CmsHomePage() {
  const router = useRouter();
  const [legacyRedirecting, setLegacyRedirecting] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedView = query.get('view');
    if (!requestedView) {
      void api
        .get<{ workspace: { id: string } }>('/auth/me')
        .then(({ workspace }) => setWorkspaceId(workspace.id))
        .catch(() => undefined);
      return;
    }

    let cancelled = false;
    setLegacyRedirecting(true);
    void api
      .get<{ workspace: { id: string } }>('/auth/me')
      .then(({ workspace }) => {
        if (cancelled) return;
        const siteId = query.get('siteId') || undefined;
        const pageId = query.get('pageId') || undefined;
        const normalizedView = requestedView === 'layouts' ? 'extensions' : requestedView;
        if (!cmsViews.has(normalizedView as CmsView)) {
          setLegacyRedirecting(false);
          return;
        }
        const view = normalizedView as CmsView;
        let target: string;

        if (view === 'pages' && siteId && pageId) {
          target = pagePath(workspace.id, siteId, pageId);
        } else if ((view === 'seo' || view === 'workflows') && siteId && pageId) {
          target = pagePath(workspace.id, siteId, pageId, view);
        } else if (view === 'collections' && siteId) {
          const requestedCollectionId = query.get('collectionId') || undefined;
          target = collectionPath(workspace.id, siteId, requestedCollectionId);
        } else if ((view === 'navigation' || view === 'design-system') && siteId) {
          target = cmsViewPath(workspace.id, view, siteId);
        } else if (view === 'pages') {
          target = pagesPath(workspace.id, siteId);
        } else {
          target = cmsViewPath(workspace.id, view, siteId);
          if ((view === 'templates' || view === 'extensions') && siteId) {
            target = `${target}?siteId=${encodeURIComponent(siteId)}`;
          }
        }
        router.replace(target);
      })
      .catch(() => {
        if (!cancelled) setLegacyRedirecting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (legacyRedirecting) {
    return <main className="loading-page">Opening the requested CMS route…</main>;
  }

  if (!workspaceId) return <main className="loading-page">Loading workspace…</main>;
  return (
    <CmsShell workspaceId={workspaceId}>
      <OverviewPage />
    </CmsShell>
  );
}
