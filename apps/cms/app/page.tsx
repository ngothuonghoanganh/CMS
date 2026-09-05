'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { api } from './lib/api';
import {
  collectionPath,
  cmsViewPath,
  pagePath,
  pagesPath,
  workspacePath,
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
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedView = query.get('view');
    let cancelled = false;
    void api
      .get<{ workspace: { id: string } }>('/auth/me')
      .then(({ workspace }) => {
        if (cancelled) return;
        if (!requestedView) {
          router.replace(workspacePath(workspace.id));
          return;
        }
        const siteId = query.get('siteId') || undefined;
        const pageId = query.get('pageId') || undefined;
        const normalizedView = requestedView === 'layouts' ? 'extensions' : requestedView;
        if (!cmsViews.has(normalizedView as CmsView)) {
          router.replace(workspacePath(workspace.id));
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
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [router]);

  return <main className="loading-page">Opening your workspace…</main>;
}
