'use client';

import {
  endpoints,
  type HistoryResponse,
  type PageSummary,
  type PointerMoveResponse,
  type ReleaseSummary,
  type Site,
} from '@plp/contracts';
import {
  Button,
  ButtonLink,
  Callout,
  CheckCircleIcon,
  EmptyState,
  ExternalLinkIcon,
  HistoryIcon,
  SegmentedControl,
  useToast,
  VisuallyHidden,
} from '@plp/ui';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { displayUrl } from '../../lib/site-url';
import { siteQueryKeys } from '../dashboard/queries';
import { PageDetailHeader } from '../page-header/PageDetailHeader';
import { pageHref } from '../shell/navigation';
import { PageContainer } from '../shell/PageHeader';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { useNow } from '../shell/use-now';
import {
  latestRollback,
  loadedReleaseCount,
  olderEntriesLabel,
  type PointerEntry,
  restorableRelease,
  timeOfDayLabel,
} from './history-presentation';
import { HistoryTimeline } from './HistoryTimeline';
import { HISTORY_PAGE_SIZE, pageQueryKeys } from './queries';
import { RestoreDraftDialog } from './RestoreDraftDialog';
import { RollbackPanel } from './RollbackPanel';
import { useReleasePreview } from './use-release-preview';
import styles from './HistoryScreen.module.css';

const FIRST_PAGE: string | null = null;

export interface HistoryScreenProps {
  site: Site;
  initialPage: PageSummary;
  initialHistory: HistoryResponse;
  /** When the server loaded the data (epoch ms). */
  loadedAt: number;
  /** `?restore={releaseId}` from "Có vấn đề? Khôi phục v12": opens the rollback panel for it. */
  restoreReleaseId: string | null;
}

/** Drops `?restore=` once the panel it opened is closed, so a reload does not reopen it. */
function clearRestoreParam() {
  const url = new URL(window.location.href);
  if (url.searchParams.has('restore')) {
    url.searchParams.delete('restore');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }
}

function RollbackBanner({
  entry,
  page,
  now,
  undoPending,
  onUndo,
}: {
  entry: PointerEntry;
  page: PageSummary;
  now: number;
  undoPending: boolean;
  onUndo: () => void;
}) {
  const liveUrl = page.liveUrl;
  return (
    <div role="status" className={styles.banner}>
      <span className={styles.bannerText}>
        <CheckCircleIcon size={20} className={styles.bannerIcon} />
        <span>
          <strong>v{entry.toVersion} đang live</strong>
          {liveUrl === null ? null : (
            <>
              {' '}
              tại <span className={styles.mono}>{displayUrl(liveUrl)}</span>
            </>
          )}
          {` · khôi phục lúc ${timeOfDayLabel(entry.at, now)} bởi ${entry.by.name}`}
        </span>
      </span>
      <span className={styles.bannerActions}>
        {entry.undoable ? (
          <Button variant="secondary" size="sm" loading={undoPending} onClick={onUndo}>
            Hoàn tác khôi phục
          </Button>
        ) : null}
        {liveUrl === null ? null : (
          <ButtonLink
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            trailingIcon={<ExternalLinkIcon size={14} />}
          >
            Xem trang live
            <VisuallyHidden> (mở trong thẻ mới)</VisuallyHidden>
          </ButtonLink>
        )}
      </span>
    </div>
  );
}

/**
 * Screen 06 "Lịch sử phiên bản": published releases and pointer moves, preview of an old
 * release, copy into the draft, rollback with a reason and undo of the last rollback.
 */
export function HistoryScreen({
  site,
  initialPage,
  initialHistory,
  loadedAt,
  restoreReleaseId,
}: HistoryScreenProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const now = useNow(loadedAt);
  const pageId = initialPage.id;
  const preview = useReleasePreview(pageId);
  const [selectedId, setSelectedId] = useState<string | null>(restoreReleaseId);
  const [copyTarget, setCopyTarget] = useState<ReleaseSummary | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);

  const pageQuery = useQuery({
    queryKey: pageQueryKeys.summary(site.id, pageId),
    queryFn: async ({ signal }) => (await api(endpoints.getPage, [pageId], { signal })).page,
    initialData: initialPage,
    initialDataUpdatedAt: loadedAt,
  });
  const page = pageQuery.data;

  const historyQuery = useInfiniteQuery({
    queryKey: pageQueryKeys.history(site.id, pageId),
    queryFn: ({ pageParam, signal }) =>
      api(endpoints.history, [pageId], {
        query: {
          limit: HISTORY_PAGE_SIZE,
          ...(pageParam === null ? {} : { cursor: pageParam }),
        },
        signal,
      }),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: (last) => last.nextCursor,
    initialData: { pages: [initialHistory], pageParams: [FIRST_PAGE] },
    initialDataUpdatedAt: loadedAt,
  });
  const lists = historyQuery.data.pages;
  const newest = lists[0] ?? initialHistory;
  const items = lists.flatMap((list) => list.items);
  const { liveReleaseId, releaseCount } = newest;
  const selected = restorableRelease(items, selectedId, liveReleaseId);
  const rollback = latestRollback(items);

  function setPage(next: PageSummary) {
    queryClient.setQueryData(pageQueryKeys.summary(site.id, pageId), next);
  }

  /** After anything that moved the pointer or changed the draft: history, page and dashboard. */
  function refreshSite(): Promise<void> {
    return queryClient.invalidateQueries({ queryKey: siteQueryKeys.site(site.id) });
  }

  function closePanel() {
    setSelectedId(null);
    clearRestoreParam();
  }

  const undo = useMutation({
    mutationFn: (activityId: string) => api(endpoints.undoActivity, [activityId]),
    onSuccess: async (result) => {
      setPage(result.page);
      await refreshSite();
      const version = result.page.liveRelease?.version;
      toast({
        tone: result.revalidation === 'failed' ? 'warning' : 'success',
        title: 'Đã hoàn tác khôi phục',
        description:
          result.revalidation === 'failed'
            ? 'Trang live có thể mất tới 5 phút để cập nhật.'
            : version === undefined
              ? 'Trang live đã trở lại như trước khi khôi phục.'
              : `v${version} đang live trở lại.`,
      });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        void refreshSite();
        toast({
          tone: 'warning',
          title: 'Chưa hoàn tác được',
          description: `${problemMessage(error)}. Lịch sử đã được tải lại.`,
        });
        return;
      }
      reportUnexpected('Undoing the rollback failed', error);
      toast({ tone: 'danger', title: 'Chưa hoàn tác được', description: problemMessage(error) });
    },
  });

  async function onRolledBack(result: PointerMoveResponse) {
    setPage(result.page);
    await refreshSite();
    closePanel();
    if (result.revalidation === 'failed') {
      toast({
        tone: 'warning',
        title: 'Đã khôi phục',
        description: 'Trang live có thể mất tới 5 phút để cập nhật.',
      });
    }
  }

  return (
    <PageContainer width="wide">
      <PageDetailHeader
        siteId={site.id}
        page={page}
        current="history"
        now={now}
        onUnpublished={(result) => {
          setPage(result.page);
        }}
      />

      {rollback === null ? null : (
        <RollbackBanner
          entry={rollback}
          page={page}
          now={now}
          undoPending={undo.isPending}
          onUndo={() => {
            undo.mutate(rollback.activityId);
          }}
        />
      )}

      <div className={styles.columns}>
        <section aria-labelledby="releases-heading" className={styles.list}>
          <div className={styles.listHeading}>
            <h2 id="releases-heading" className={styles.heading}>
              Phiên bản đã xuất bản
            </h2>
            <SegmentedControl
              aria-label="Loại lịch sử"
              options={[{ value: 'releases', label: `Đã xuất bản · ${releaseCount}` }]}
              value="releases"
              onChange={() => undefined}
            />
          </div>
          <p className={styles.explainer}>
            Mỗi lần xuất bản tạo một phiên bản cố định, không bị sửa sau đó. Khôi phục là chuyển
            trang live sang phiên bản cũ, bản nháp của bạn không bị ảnh hưởng.
          </p>

          {historyQuery.isRefetchError ? (
            <Callout
              tone="danger"
              role="alert"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void historyQuery.refetch();
                  }}
                >
                  Thử lại
                </Button>
              }
            >
              Không tải lại được lịch sử. {problemMessage(historyQuery.error)}
            </Callout>
          ) : null}

          {items.length === 0 ? (
            <EmptyState
              headingLevel={3}
              icon={<HistoryIcon size={24} />}
              title="Chưa có phiên bản nào"
              description="Mỗi lần xuất bản sẽ tạo một phiên bản ở đây. Bạn có thể xem lại, sao chép vào bản nháp hoặc khôi phục bất cứ lúc nào."
              action={
                <ButtonLink as={Link} href={pageHref(site.id, pageId, 'edit')}>
                  Mở editor
                </ButtonLink>
              }
            />
          ) : (
            <HistoryTimeline
              items={items}
              liveReleaseId={liveReleaseId}
              selectedReleaseId={selected?.id ?? null}
              previewPendingId={preview.pendingId}
              onPreview={(release) => {
                void preview.openPreview(release.id, release.version);
              }}
              onCopyToDraft={(release) => {
                setCopyTarget(release);
                setCopyOpen(true);
              }}
              onRestore={(release) => {
                setSelectedId(release.id);
              }}
            />
          )}

          {historyQuery.hasNextPage ? (
            <Button
              variant="ghost"
              className={styles.more}
              loading={historyQuery.isFetchingNextPage}
              onClick={() => {
                void historyQuery.fetchNextPage();
              }}
            >
              {olderEntriesLabel(releaseCount, loadedReleaseCount(items))}
            </Button>
          ) : null}
        </section>

        {selected === null ? null : (
          <RollbackPanel
            key={selected.id}
            site={site}
            page={page}
            release={selected}
            liveReleaseId={liveReleaseId}
            onCancel={closePanel}
            onRolledBack={onRolledBack}
            onConflict={() => {
              void refreshSite();
            }}
          />
        )}
      </div>

      {copyTarget === null ? null : (
        <RestoreDraftDialog
          key={copyTarget.id}
          page={page}
          release={copyTarget}
          open={copyOpen}
          onOpenChange={setCopyOpen}
          onRestored={(detail) => {
            setPage(detail.page);
            void refreshSite();
          }}
        />
      )}
    </PageContainer>
  );
}
