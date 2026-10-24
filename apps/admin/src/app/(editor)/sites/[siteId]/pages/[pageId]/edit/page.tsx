import { endpoints } from '@plp/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import {
  LIST_LIMIT,
  loadAllPages,
  loadEditorAssets,
  referencedAssetIds,
} from '../../../../../../../features/editor';
import { EditorWithPublish } from '../../../../../../../features/publish/EditorWithPublish';
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
const loadPage = cache((pageId: string) => serverApi(endpoints.getPage, [pageId]));

export async function generateMetadata({ params }: EditPageProps): Promise<Metadata> {
  const { siteId, pageId } = await params;
  await authorize(siteId, pageId);
  const detail = await orNotFound(loadPage(pageId));
  return { title: `Sửa “${detail.page.title}”` };
}

export default async function EditPage({ params }: EditPageProps) {
  const { siteId, pageId } = await params;
  const me = await authorize(siteId, pageId);
  const detail = await orNotFound(loadPage(pageId));
  if (detail.page.siteId !== siteId) {
    notFound();
  }
  const [site, pages] = await Promise.all([
    orNotFound(serverApi(endpoints.getSite, [siteId])),
    loadAllPages((cursor) =>
      serverApi(endpoints.listPages, [siteId], {
        query: { limit: LIST_LIMIT, ...(cursor === null ? {} : { cursor }) },
      }),
    ),
  ]);
  const membership = me.memberships.find((item) => item.workspace.id === site.workspaceId);
  if (!membership) {
    notFound();
  }
  const assets = await loadEditorAssets(
    referencedAssetIds(detail.draft.composition, detail.draft.seo, site),
    (cursor) =>
      serverApi(endpoints.listAssets, [siteId], {
        query: { limit: LIST_LIMIT, ...(cursor === null ? {} : { cursor }) },
      }),
  );

  return <EditorWithPublish initial={{ detail, site, assets, pages, role: membership.role }} />;
}
