import { can, endpoints } from '@plp/contracts';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { loadAssetsByIds } from '../../../../../../../features/assets';
import { LIST_LIMIT, loadAllPages, referencedAssetIds } from '../../../../../../../features/editor';
import { leadCaptureViewOf } from '../../../../../../../features/privacy/privacy-presentation';
import { EditorWithPublish } from '../../../../../../../features/publish/EditorWithPublish';
import { pageHref } from '../../../../../../../features/shell/navigation';
import { ApiError } from '../../../../../../../lib/api-core';
import { requireMe, serverApi } from '../../../../../../../lib/server-api';

interface EditPageProps {
  params: Promise<{ siteId: string; pageId: string }>;
}

/** A resource of another workspace, or one that does not exist, is a 404 (ADR-003). */
async function orNotFound<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }
}

// Metadata and the page share one request for the session and one for the page.
const authorize = cache((siteId: string, pageId: string) =>
  requireMe(`/sites/${siteId}/pages/${pageId}/edit`),
);
const loadPage = cache((siteId: string, pageId: string) =>
  serverApi(endpoints.getPage, [siteId, pageId]),
);

export async function generateMetadata({ params }: EditPageProps): Promise<Metadata> {
  const { siteId, pageId } = await params;
  await authorize(siteId, pageId);
  const detail = await orNotFound(loadPage(siteId, pageId));
  return { title: `Sửa “${detail.page.title}”` };
}

export default async function EditPage({ params }: EditPageProps) {
  const { siteId, pageId } = await params;
  const me = await authorize(siteId, pageId);
  const detail = await orNotFound(loadPage(siteId, pageId));
  if (detail.page.siteId !== siteId) {
    notFound();
  }
  const [site, pages, privacy] = await Promise.all([
    orNotFound(serverApi(endpoints.getSite, [siteId])),
    loadAllPages((cursor) =>
      serverApi(endpoints.listPages, [siteId], {
        query: { limit: LIST_LIMIT, ...(cursor === null ? {} : { cursor }) },
      }),
    ),
    orNotFound(serverApi(endpoints.getPrivacySettings, [siteId])),
  ]);
  const membership = me.memberships.find((item) => item.workspace.id === site.workspaceId);
  if (!membership) {
    notFound();
  }
  // Roles that do not edit pages read them in their history: versions and previews (ADR-020).
  if (!can(membership.role, 'pages.edit')) {
    redirect(pageHref(siteId, pageId, 'history'));
  }
  const assets = await loadAssetsByIds(
    referencedAssetIds(detail.draft.composition, detail.draft.seo, site),
    (ids) => serverApi(endpoints.listAssets, [siteId], { query: { ids } }),
  );

  return (
    <EditorWithPublish
      initial={{
        detail,
        site,
        assets,
        pages,
        role: membership.role,
        userId: me.user.id,
        leadCapture: leadCaptureViewOf(privacy),
      }}
    />
  );
}
