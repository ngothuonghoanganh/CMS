'use client';

import {
  type ActivityListResponse,
  endpoints,
  type PageListResponse,
  type Site,
} from '@plp/contracts';
import { themePresets } from '@plp/sections/schema';
import {
  Button,
  ButtonLink,
  Callout,
  Card,
  EmptyState,
  ExternalLinkIcon,
  Field,
  FileIcon,
  Input,
  PlusIcon,
  SearchIcon,
  SegmentedControl,
  VisuallyHidden,
} from '@plp/ui';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { cx } from '../shell/cx';
import { newPageHref, siteHref } from '../shell/navigation';
import { PageContainer, PageHeader } from '../shell/PageHeader';
import { problemMessage } from '../shell/problem-message';
import { useDebouncedValue } from '../shell/use-debounced-value';
import { useNow } from '../shell/use-now';
import {
  type DashboardFilters,
  dashboardSearch,
  normalizeSearch,
  pageListQuery,
  statusFilterOptions,
  type StatusFilterValue,
} from './filters';
import { PageTable } from './PageTable';
import { PAGE_LIST_LIMIT, RECENT_ACTIVITY_QUERY, siteQueryKeys } from './queries';
import { RecentActivity } from './RecentActivity';
import { SetupChecklist, type SetupStep } from './SetupChecklist';
import { SiteSummary } from './SiteSummary';
import { type UnpublishablePage, UnpublishDialog } from './UnpublishDialog';
import styles from './Dashboard.module.css';

export const SEARCH_DEBOUNCE_MS = 300;

const FIRST_PAGE: string | null = null;

export interface DashboardProps {
  site: Site;
  workspaceName: string;
  /** Filters read from the URL by the server, and the data it loaded for them. */
  initialFilters: DashboardFilters;
  initialPages: PageListResponse;
  initialActivity: ActivityListResponse;
  /** When the server loaded the data (epoch ms); hydration uses it for identical relative times. */
  loadedAt: number;
}

function sameFilters(a: DashboardFilters, b: DashboardFilters): boolean {
  return a.status === b.status && a.q === b.q;
}

/** Screen 01 "Trang": site summary, the filterable page list and recent activity. */
export function Dashboard({
  site,
  workspaceName,
  initialFilters,
  initialPages,
  initialActivity,
  loadedAt,
}: DashboardProps) {
  const now = useNow(loadedAt);
  const [status, setStatus] = useState(initialFilters.status);
  const [searchText, setSearchText] = useState(initialFilters.q);
  const q = normalizeSearch(useDebouncedValue(searchText, SEARCH_DEBOUNCE_MS));
  const filters: DashboardFilters = { status, q };

  const [unpublishTarget, setUnpublishTarget] = useState<UnpublishablePage | null>(null);
  const [unpublishOpen, setUnpublishOpen] = useState(false);

  // The URL mirrors the filters so a reload or a shared link keeps them. Replacing the entry
  // (rather than navigating) keeps the server from rendering the page again.
  useEffect(() => {
    const url = `${window.location.pathname}${dashboardSearch({ status, q })}`;
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', url);
    }
  }, [status, q]);

  const pagesQuery = useInfiniteQuery({
    queryKey: siteQueryKeys.pageList(site.id, filters),
    queryFn: ({ pageParam, signal }) =>
      api(endpoints.listPages, [site.id], {
        query: {
          ...pageListQuery(filters),
          limit: PAGE_LIST_LIMIT,
          ...(pageParam === null ? {} : { cursor: pageParam }),
        },
        signal,
      }),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialData: () =>
      sameFilters(filters, initialFilters)
        ? { pages: [initialPages], pageParams: [FIRST_PAGE] }
        : undefined,
    initialDataUpdatedAt: loadedAt,
    placeholderData: keepPreviousData,
  });

  const activityQuery = useQuery({
    queryKey: siteQueryKeys.recentActivity(site.id),
    queryFn: ({ signal }) =>
      api(endpoints.listActivity, [site.id], { query: RECENT_ACTIVITY_QUERY, signal }),
    initialData: initialActivity,
    initialDataUpdatedAt: loadedAt,
  });

  const lists = pagesQuery.data?.pages ?? [];
  const summary = lists[0] ?? initialPages;
  const pages = lists.flatMap((list) => list.items);
  const { counts } = summary;
  const loadingPages = pagesQuery.isPlaceholderData || pagesQuery.data === undefined;
  // `counts.live` already includes the live pages with changes.
  const anyReleased = counts.live + counts.unpublished > 0;
  const thumbnailColor = themePresets[site.themePresetId].schemes.brand.background;

  const setupSteps: SetupStep[] = [
    {
      label: 'Thêm logo & chọn giao diện',
      done: site.logoAssetId !== null,
      action: { href: `${siteHref(site.id)}/settings` },
    },
    {
      label: 'Xuất bản trang đầu tiên',
      done: anyReleased,
      action:
        counts.all === 0
          ? { href: newPageHref(site.id) }
          : {
              onClick: () => {
                setStatus('draft');
              },
            },
    },
  ];

  // The list changes while the user types or filters: an empty result is a status message.
  const filtering = status !== null || q !== '';
  const listStatus =
    filtering && counts.all > 0 && !loadingPages && pages.length === 0
      ? 'Không có trang nào khớp'
      : '';

  function clearFilters() {
    setStatus(null);
    setSearchText('');
  }

  return (
    <PageContainer width="wide">
      <PageHeader
        context={`${workspaceName} / ${site.name}`}
        title="Trang"
        actions={
          <>
            <ButtonLink
              href={site.defaultOrigin}
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
              trailingIcon={<ExternalLinkIcon size={16} />}
            >
              Xem site live
              <VisuallyHidden> (mở trong thẻ mới)</VisuallyHidden>
            </ButtonLink>
            <ButtonLink as={Link} href={newPageHref(site.id)} leadingIcon={<PlusIcon size={16} />}>
              Tạo trang
            </ButtonLink>
          </>
        }
      />

      <SiteSummary site={site} attention={summary.attention} />

      <Card as="section" padding="none" aria-labelledby="pages-heading">
        <h2 id="pages-heading" className={styles.srOnly}>
          Danh sách trang
        </h2>
        <VisuallyHidden aria-live="polite">{listStatus}</VisuallyHidden>
        <div className={styles.toolbar}>
          <SegmentedControl<StatusFilterValue>
            aria-label="Lọc theo trạng thái"
            options={statusFilterOptions(counts)}
            value={status ?? 'all'}
            onChange={(value) => {
              setStatus(value === 'all' ? null : value);
            }}
          />
          <Field label="Tìm trang" hideLabel id="page-search" className={styles.search}>
            <Input
              type="search"
              leadingIcon={<SearchIcon size={16} />}
              placeholder="Tìm theo tên hoặc đường dẫn"
              autoComplete="off"
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value);
              }}
            />
          </Field>
        </div>

        {pagesQuery.isError ? (
          <Callout
            tone="danger"
            role="alert"
            className={styles.loadError}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void pagesQuery.refetch();
                }}
              >
                Thử lại
              </Button>
            }
          >
            Không tải được danh sách trang. {problemMessage(pagesQuery.error)}
          </Callout>
        ) : null}

        {counts.all === 0 ? (
          <EmptyState
            headingLevel={3}
            icon={<FileIcon size={24} />}
            title="Chưa có trang nào"
            description={`Tạo trang đầu tiên cho ${site.name}: chọn mục tiêu, điền vài thông tin chính, rồi chỉnh sửa và xuất bản.`}
            action={
              <ButtonLink
                as={Link}
                href={newPageHref(site.id)}
                leadingIcon={<PlusIcon size={16} />}
              >
                Tạo trang đầu tiên
              </ButtonLink>
            }
          />
        ) : pages.length === 0 && !loadingPages ? (
          <EmptyState
            headingLevel={3}
            icon={<SearchIcon size={24} />}
            title="Không có trang nào khớp"
            description="Thử từ khóa khác hoặc xem tất cả trang của site."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Xem tất cả trang
              </Button>
            }
          />
        ) : (
          <div
            className={cx(styles.tableScroll, loadingPages && styles.loading)}
            aria-busy={loadingPages}
          >
            <PageTable
              siteId={site.id}
              pages={pages}
              now={now}
              thumbnailColor={thumbnailColor}
              onUnpublish={(page) => {
                setUnpublishTarget(page);
                setUnpublishOpen(true);
              }}
            />
          </div>
        )}

        {pagesQuery.hasNextPage ? (
          <div className={styles.more}>
            <Button
              variant="secondary"
              loading={pagesQuery.isFetchingNextPage}
              onClick={() => {
                void pagesQuery.fetchNextPage();
              }}
            >
              Xem thêm trang
            </Button>
          </div>
        ) : null}
      </Card>

      <div className={styles.bottomRow}>
        <RecentActivity siteId={site.id} items={activityQuery.data.items} now={now} />
        <SetupChecklist steps={setupSteps} />
      </div>

      {unpublishTarget === null ? null : (
        <UnpublishDialog
          key={unpublishTarget.id}
          page={unpublishTarget}
          open={unpublishOpen}
          onOpenChange={setUnpublishOpen}
        />
      )}
    </PageContainer>
  );
}
