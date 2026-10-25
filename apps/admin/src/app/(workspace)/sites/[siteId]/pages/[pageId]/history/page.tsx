import { endpoints, type HistoryResponse, idSchema } from '@plp/contracts';
import type { Metadata } from 'next';
import { HistoryScreen } from '../../../../../../../features/history/HistoryScreen';
import { HISTORY_PAGE_SIZE } from '../../../../../../../features/history/queries';
import { loadPageDetail } from '../../../../../../../features/page-header/load-page-detail';
import { loadSiteContext } from '../../../../../../../features/shell/site-context';
import { serverApi } from '../../../../../../../lib/server-api';

interface HistoryPageProps {
  params: Promise<{ siteId: string; pageId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function loadHistory(
  pageId: string,
): Promise<{ history: HistoryResponse; loadedAt: number }> {
  const history = await serverApi(endpoints.history, [pageId], {
    query: { limit: HISTORY_PAGE_SIZE },
  });
  return { history, loadedAt: Date.now() };
}

export async function generateMetadata({ params }: HistoryPageProps): Promise<Metadata> {
  const { siteId, pageId } = await params;
  await loadSiteContext(siteId);
  const { page } = await loadPageDetail(siteId, pageId);
  return { title: `Lịch sử phiên bản — ${page.title}` };
}

/** Screen 06: published versions, rollback and undo. `?restore=` preselects a release. */
export default async function HistoryPage({ params, searchParams }: HistoryPageProps) {
  const { siteId, pageId } = await params;
  const { site } = await loadSiteContext(siteId);
  // The page check comes first: a page of another site or workspace is a 404.
  const { page } = await loadPageDetail(siteId, pageId);
  const { history, loadedAt } = await loadHistory(pageId);
  const restore = idSchema.safeParse((await searchParams).restore);
  return (
    <HistoryScreen
      site={site}
      initialPage={page}
      initialHistory={history}
      loadedAt={loadedAt}
      restoreReleaseId={restore.success ? restore.data : null}
    />
  );
}
