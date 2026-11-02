'use client';

import {
  type ActivityListResponse,
  can,
  endpoints,
  holdersOf,
  type LeadCounts,
  type PageListResponse,
  type Site,
  type SiteAddressStatus,
  type Access,
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
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import Link from 'next/link';
import { internalVisitUrl } from '../../lib/site-url';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { cx } from '../shell/cx';
import {
  domainsHref,
  leadRecipientsHref,
  newPageHref,
  privacyHref,
  siteHref,
} from '../shell/navigation';
import { PageContainer, PageHeader } from '../shell/PageHeader';
import { problemMessage } from '../shell/problem-message';
import {
  adoptServerRender,
  adoptServerRenderKeepingPages,
  serverFirstPage,
} from '../shell/server-render';
import { useDebouncedValue } from '../shell/use-debounced-value';
import { useFocusNewItems } from '../shell/use-focus-new-items';
import { useNow } from '../shell/use-now';
import {
  type DashboardFilters,
  dashboardSearch,
  normalizeSearch,
  pageListQuery,
  statusFilterOptions,
  type StatusFilterValue,
} from './filters';
import { type DeletablePage, DeletePageDialog } from './DeletePageDialog';
import { PageTable } from './PageTable';
import { PAGE_LIST_LIMIT, RECENT_ACTIVITY_QUERY, siteQueryKeys } from './queries';
import { RecentActivity } from './RecentActivity';
import { SetupChecklist, type SetupStep } from './SetupChecklist';
import { SiteSummary } from './SiteSummary';
import { type UnpublishablePage, UnpublishDialog } from './UnpublishDialog';
import styles from './Dashboard.module.css';

const SEARCH_DEBOUNCE_MS = 300;

const FIRST_PAGE: string | null = null;

export interface DashboardProps {
  site: Site;
  workspaceName: string;
  /** Filters read from the URL by the server, and the data it loaded for them. */
  initialFilters: DashboardFilters;
  initialPages: PageListResponse;
  initialActivity: ActivityListResponse;
  /** The primary address and whether a custom domain is connected (ADR-022). */
  address: SiteAddressStatus;
  /** Null for roles that do not see leads (ADR-020). */
  initialLeadCounts: LeadCounts | null;
  /** When the server loaded the data (epoch ms); hydration uses it for identical relative times. */
  loadedAt: number;
  /** The user's role: what they may do on the site follows it (ADR-020). */
  role: Access;
}

function sameFilters(a: DashboardFilters, b: DashboardFilters): boolean {
  return a.status === b.status && a.q === b.q;
}

/** Screen 01 "Trang": site summary, the filterable page list and recent activity. */
export function Dashboard(props: DashboardProps) {
  // The filters on screen, as the URL holds them: the search once typing stops.
  const [shown, setShown] = useState(props.initialFilters);
  const [render, setRender] = useState({ loadedAt: props.loadedAt, screen: 0 });
  if (render.loadedAt !== props.loadedAt) {
    // A server render for other filters than the ones on screen comes from a navigation (the
    // sidebar's "Trang" while filtering): the screen starts again from its filters, as on a visit.
    // A refresh renders the URL the screen wrote (the sidebar's "Trang N" after "Xóa trang"): the
    // screen stays, with its focus, the search being typed and the pages "Xem thêm trang" loaded.
    const navigated = !sameFilters(props.initialFilters, shown);
    setRender({ loadedAt: props.loadedAt, screen: render.screen + (navigated ? 1 : 0) });
    if (navigated) {
      setShown(props.initialFilters);
    }
  }
  return <DashboardScreen key={render.screen} {...props} onFiltersShown={setShown} />;
}

function DashboardScreen({
  site,
  workspaceName,
  initialFilters,
  initialPages,
  initialActivity,
  address,
  initialLeadCounts,
  loadedAt,
  role,
  onFiltersShown,
}: DashboardProps & { onFiltersShown: (filters: DashboardFilters) => void }) {
  const queryClient = useQueryClient();
  const now = useNow(loadedAt);
  const canEditPages = can(role, 'pages.edit');
  const [status, setStatus] = useState(initialFilters.status);
  const [searchText, setSearchText] = useState(initialFilters.q);
  const q = normalizeSearch(useDebouncedValue(searchText, SEARCH_DEBOUNCE_MS));
  const filters: DashboardFilters = { status, q };

  const [unpublishTarget, setUnpublishTarget] = useState<UnpublishablePage | null>(null);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeletablePage | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // A deleted page's row, and the menu that opened the dialog, go: focus lands on the search.
  const searchRef = useRef<HTMLInputElement>(null);

  // The URL mirrors the filters so a reload or a shared link keeps them. Replacing the entry
  // (rather than navigating) keeps the server from rendering the page again.
  useEffect(() => {
    onFiltersShown({ status, q });
    const url = `${window.location.pathname}${dashboardSearch({ status, q })}`;
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', url);
    }
  }, [status, q, onFiltersShown]);

  // Coming back renders the dashboard again on the server: its pages and activity are newer than
  // what the cache kept from an earlier visit, which autosave or another member does not refresh.
  // The list then starts again from its first page; rendered again while on screen, it keeps the
  // pages "Xem thêm trang" loaded.
  const adopted = useRef(false);
  useEffect(() => {
    const listKey = siteQueryKeys.pageList(site.id, initialFilters);
    if (adopted.current) {
      adoptServerRenderKeepingPages(queryClient, listKey, initialPages, loadedAt);
    } else {
      adoptServerRender(queryClient, listKey, serverFirstPage(initialPages), loadedAt);
    }
    adopted.current = true;
    adoptServerRender(
      queryClient,
      siteQueryKeys.recentActivity(site.id),
      initialActivity,
      loadedAt,
    );
  }, [queryClient, site.id, initialFilters, initialPages, initialActivity, loadedAt]);

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
      sameFilters(filters, initialFilters) ? serverFirstPage(initialPages) : undefined,
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
  const { listRef: newItemsRef, expectMore } = useFocusNewItems<HTMLDivElement>(
    pages.length,
    'tbody tr',
    'a[href]',
  );
  // `liveSiteUrl`: the home page when it is live, else the page published last; null while none is.
  const { counts, liveSiteUrl } = summary;
  const loadingPages = pagesQuery.isPlaceholderData || pagesQuery.data === undefined;
  // `counts.live` already includes the live pages with changes.
  const anyReleased = counts.live + counts.unpublished > 0;
  const thumbnailColor = themePresets[site.themePresetId].schemes.brand.background;

  const canChangeSite = can(role, 'sites.manage');
  const canChangePrivacy = can(role, 'privacy.manage');
  const canManageDomains = can(role, 'domains.manage');
  const setupSteps: SetupStep[] = [
    {
      label: 'Thêm logo & chọn giao diện',
      done: site.logoAssetId !== null,
      action: canChangeSite ? { href: `${siteHref(site.id)}/settings` } : null,
      holders: holdersOf('sites.manage'),
    },
    {
      label: 'Xuất bản trang đầu tiên',
      done: anyReleased,
      action:
        counts.all === 0
          ? canEditPages
            ? { href: newPageHref(site.id) }
            : null
          : {
              onClick: () => {
                setStatus('draft');
              },
            },
      holders: holdersOf('pages.publish'),
    },
    // Done once a custom domain works, primary or not: it then serves the pages (ADR-022).
    {
      label: 'Kết nối tên miền riêng',
      done: address.customDomainActive,
      action: canManageDomains ? { href: domainsHref(site.id) } : null,
      holders: holdersOf('domains.manage'),
    },
    {
      label: 'Thêm chính sách quyền riêng tư',
      done: site.privacyConfigured,
      action: canChangePrivacy ? { href: privacyHref(site.id) } : null,
      holders: holdersOf('privacy.manage'),
    },
    {
      label: 'Chọn nơi nhận lead (email)',
      done: site.confirmedLeadRecipients > 0,
      action: canChangePrivacy ? { href: leadRecipientsHref(site.id) } : null,
      holders: holdersOf('privacy.manage'),
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
            {liveSiteUrl === null ? null : (
              <ButtonLink
                href={internalVisitUrl(liveSiteUrl)}
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
                trailingIcon={<ExternalLinkIcon size={16} />}
              >
                Xem site live
                <VisuallyHidden> (mở trong thẻ mới)</VisuallyHidden>
              </ButtonLink>
            )}
            {canEditPages ? (
              <ButtonLink
                as={Link}
                href={newPageHref(site.id)}
                leadingIcon={<PlusIcon size={16} />}
              >
                Tạo trang
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <SiteSummary
        site={site}
        attention={summary.attention}
        address={address}
        initialLeadCounts={initialLeadCounts}
        loadedAt={loadedAt}
        canEditPages={canEditPages}
        canManageDomains={canManageDomains}
      />

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
              ref={searchRef}
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
            description={
              canEditPages
                ? `Tạo trang đầu tiên cho ${site.name}: chọn mục tiêu, điền vài thông tin chính, rồi chỉnh sửa và xuất bản.`
                : `${site.name} chưa có trang nào. Trang sẽ hiện ở đây khi ${holdersOf('pages.edit')} tạo trang.`
            }
            action={
              canEditPages ? (
                <ButtonLink
                  as={Link}
                  href={newPageHref(site.id)}
                  leadingIcon={<PlusIcon size={16} />}
                >
                  Tạo trang đầu tiên
                </ButtonLink>
              ) : undefined
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
            ref={newItemsRef}
            className={cx(styles.tableScroll, loadingPages && styles.loading)}
            aria-busy={loadingPages}
          >
            <PageTable
              siteId={site.id}
              pages={pages}
              now={now}
              thumbnailColor={thumbnailColor}
              canEdit={canEditPages}
              canManageLive={can(role, 'pages.manageLive')}
              canViewLeads={can(role, 'leads.view')}
              onUnpublish={(page) => {
                setUnpublishTarget(page);
                setUnpublishOpen(true);
              }}
              onDelete={(page) => {
                setDeleteTarget(page);
                setDeleteOpen(true);
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
                expectMore();
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
      {deleteTarget === null ? null : (
        <DeletePageDialog
          key={deleteTarget.id}
          page={deleteTarget}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          fallbackFocusRef={searchRef}
        />
      )}
    </PageContainer>
  );
}
