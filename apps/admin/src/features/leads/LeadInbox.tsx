'use client';

import {
  endpoints,
  LEAD_EXPORT_MAX_ROWS,
  type LeadDetail,
  type LeadListResponse,
  type LeadPageRef,
  type LeadRange,
  leadRangeSchema,
  leadStatuses,
  leadStatusLabels,
  leadStatusSchema,
  type Site,
} from '@plp/contracts';
import {
  Button,
  Callout,
  Card,
  DownloadIcon,
  EmptyState,
  Field,
  InboxIcon,
  Input,
  SearchIcon,
  SegmentedControl,
  Select,
  useToast,
  VisuallyHidden,
} from '@plp/ui';
import { keepPreviousData, useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, downloadFile } from '../../lib/api';
import { cx } from '../shell/cx';
import { leadsHref } from '../shell/navigation';
import { PageContainer, PageHeader } from '../shell/PageHeader';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { useDebouncedValue } from '../shell/use-debounced-value';
import { useNow } from '../shell/use-now';
import {
  DEFAULT_LEAD_FILTERS,
  isFiltered,
  LEAD_PAGE_SIZE,
  leadFilterQuery,
  type LeadInboxFilters,
  leadInboxSearch,
  normalizeLeadSearch,
} from './filters';
import { cappedCountLabel } from './lead-presentation';
import { LeadDetailPanel } from './LeadDetailPanel';
import { LeadTable } from './LeadTable';
import { leadQueryKeys } from './queries';
import styles from './LeadInbox.module.css';

export const LEAD_SEARCH_DEBOUNCE_MS = 300;

const FIRST_PAGE: string | null = null;

const rangeLabels: Record<LeadRange, string> = {
  '7d': '7 ngày qua',
  '30d': '30 ngày qua',
  all: 'Toàn bộ thời gian',
  custom: 'Tùy chọn…',
};

export interface LeadInboxProps {
  site: Site;
  /** The workspace owner exports leads and deletes a person's data (ADR-017). */
  canManage: boolean;
  /** Filters and lead read from the URL by the server, and what it loaded for them. */
  initialFilters: LeadInboxFilters;
  initialLeadId: string | null;
  /** Null when the URL held a custom range the API would refuse. */
  initialList: LeadListResponse | null;
  initialDetail: LeadDetail | null;
  /** Every page of the site, for the page filter. */
  pageRefs: readonly LeadPageRef[];
  /** When the server loaded the data (epoch ms). */
  loadedAt: number;
}

function sameFilters(a: LeadInboxFilters, b: LeadInboxFilters): boolean {
  return (
    a.folder === b.folder &&
    a.pageId === b.pageId &&
    a.status === b.status &&
    a.range === b.range &&
    a.from === b.from &&
    a.to === b.to &&
    a.q === b.q
  );
}

/** Screen 10 "Leads": every lead from the forms of the site, with filters and the lead's detail. */
export function LeadInbox({
  site,
  canManage,
  initialFilters,
  initialLeadId,
  initialList,
  initialDetail,
  pageRefs,
  loadedAt,
}: LeadInboxProps) {
  const now = useNow(loadedAt);
  const { toast } = useToast();
  const { q: initialSearch, ...initialBase } = initialFilters;
  const [base, setBase] = useState(initialBase);
  const [searchText, setSearchText] = useState(initialSearch);
  const q = normalizeLeadSearch(useDebouncedValue(searchText, LEAD_SEARCH_DEBOUNCE_MS));
  const filters: LeadInboxFilters = { ...base, q };
  const [selectedId, setSelectedId] = useState(initialLeadId);
  const [picked, setPicked] = useState(false);

  // The URL mirrors the filters and the open lead, so a reload or a shared link keeps them.
  // Replacing the entry (rather than navigating) keeps the server from rendering the page again.
  const search = leadInboxSearch(filters, selectedId);
  useEffect(() => {
    const url = `${window.location.pathname}${search}`;
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', url);
    }
  }, [search]);

  const check = leadFilterQuery(filters);
  const listQuery = useInfiniteQuery({
    queryKey: leadQueryKeys.list(site.id, filters),
    queryFn: ({ pageParam, signal }) => {
      if (!check.ok) {
        throw new Error(check.message);
      }
      return api(endpoints.listLeads, [site.id], {
        query: {
          ...check.query,
          limit: LEAD_PAGE_SIZE,
          ...(pageParam === null ? {} : { cursor: pageParam }),
        },
        signal,
      });
    },
    enabled: check.ok,
    initialPageParam: FIRST_PAGE,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialData: () =>
      initialList !== null && sameFilters(filters, initialFilters)
        ? { pages: [initialList], pageParams: [FIRST_PAGE] }
        : undefined,
    initialDataUpdatedAt: loadedAt,
    placeholderData: keepPreviousData,
  });

  const exportCsv = useMutation({
    mutationFn: () => {
      if (!check.ok) {
        throw new Error(check.message);
      }
      return downloadFile(endpoints.exportLeads, [site.id], { body: check.query });
    },
    onSuccess: (file) => {
      toast(
        file.truncated
          ? {
              tone: 'warning',
              title: `File chỉ gồm ${LEAD_EXPORT_MAX_ROWS.toLocaleString('vi-VN')} lead mới nhất`,
              description: 'Thu hẹp khoảng thời gian hoặc bộ lọc để xuất phần còn lại.',
            }
          : { tone: 'success', title: 'Đã xuất file CSV' },
      );
    },
    onError: (error) => {
      reportUnexpected('Lead export failed', error);
      toast({ tone: 'danger', title: 'Chưa xuất được file', description: problemMessage(error) });
    },
  });

  const lists = listQuery.data?.pages ?? [];
  const leads = lists.flatMap((list) => list.items);
  const counts = lists[0]?.counts ?? null;
  const loading = listQuery.isPlaceholderData || (check.ok && listQuery.data === undefined);
  const folderCount = counts === null ? null : counts[filters.folder];
  const filtered = isFiltered(filters);
  const listStatus =
    !loading && counts !== null && leads.length === 0 && filtered ? 'Không có lead nào khớp' : '';

  function update(changes: Partial<Omit<LeadInboxFilters, 'q'>>) {
    setBase((current) => ({ ...current, ...changes }));
  }

  function clearFilters() {
    const { q: _search, ...defaults } = DEFAULT_LEAD_FILTERS;
    setBase({ ...defaults, folder: base.folder });
    setSearchText('');
  }

  function hrefOf(leadId: string): string {
    return leadsHref(site.id, leadInboxSearch(filters, leadId));
  }

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Leads"
        description={`Mọi đăng ký từ form trên các trang của ${site.name}.`}
        actions={
          canManage ? (
            <Button
              variant="secondary"
              leadingIcon={<DownloadIcon size={16} />}
              loading={exportCsv.isPending}
              disabled={!check.ok || folderCount?.count === 0}
              onClick={() => {
                exportCsv.mutate();
              }}
            >
              Xuất Excel / CSV
            </Button>
          ) : null
        }
      />

      <div className={styles.toolbar}>
        <SegmentedControl<LeadInboxFilters['folder']>
          aria-label="Thư mục"
          options={[
            {
              value: 'inbox',
              label: counts === null ? 'Hộp thư' : `Hộp thư · ${cappedCountLabel(counts.inbox)}`,
            },
            {
              value: 'spam',
              label:
                counts === null
                  ? 'Nghi ngờ spam'
                  : `Nghi ngờ spam · ${cappedCountLabel(counts.spam)}`,
            },
          ]}
          value={filters.folder}
          onChange={(folder) => {
            update({ folder });
          }}
        />
        <div className={styles.filters}>
          <Field label="Lọc theo trang" hideLabel className={styles.filter}>
            <Select
              value={filters.pageId ?? ''}
              onChange={(event) => {
                update({ pageId: event.target.value === '' ? null : event.target.value });
              }}
            >
              <option value="">Tất cả trang</option>
              {pageRefs.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Lọc theo trạng thái" hideLabel className={styles.filter}>
            <Select
              value={filters.status ?? ''}
              onChange={(event) => {
                const status = leadStatusSchema.safeParse(event.target.value);
                update({ status: status.success ? status.data : null });
              }}
            >
              <option value="">Mọi trạng thái</option>
              {leadStatuses.map((status) => (
                <option key={status} value={status}>
                  {leadStatusLabels[status]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Khoảng thời gian" hideLabel className={styles.filter}>
            <Select
              value={filters.range}
              onChange={(event) => {
                const range = leadRangeSchema.safeParse(event.target.value);
                if (range.success) {
                  update({ range: range.data });
                }
              }}
            >
              {Object.entries(rangeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tìm lead" hideLabel id="lead-search" className={styles.search}>
            <Input
              type="search"
              leadingIcon={<SearchIcon size={16} />}
              placeholder="Tên, số điện thoại, email"
              autoComplete="off"
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value);
              }}
            />
          </Field>
        </div>
      </div>

      {filters.range === 'custom' ? (
        <div className={styles.customRange}>
          <Field label="Từ ngày" className={styles.dateField}>
            <Input
              type="date"
              value={filters.from}
              onChange={(event) => {
                update({ from: event.target.value });
              }}
            />
          </Field>
          <Field label="Đến ngày" className={styles.dateField}>
            <Input
              type="date"
              value={filters.to}
              onChange={(event) => {
                update({ to: event.target.value });
              }}
            />
          </Field>
          {check.ok ? null : (
            <p className={styles.rangeHint} role="status">
              {check.message}
            </p>
          )}
        </div>
      ) : null}

      <div className={styles.panes}>
        <Card as="section" padding="none" aria-label="Danh sách lead" className={styles.listPane}>
          <VisuallyHidden aria-live="polite">{listStatus}</VisuallyHidden>
          {listQuery.isError ? (
            <Callout
              tone="danger"
              role="alert"
              className={styles.loadError}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void listQuery.refetch();
                  }}
                >
                  Thử lại
                </Button>
              }
            >
              Không tải được danh sách lead. {problemMessage(listQuery.error)}
            </Callout>
          ) : null}

          {leads.length === 0 && !loading && !listQuery.isError ? (
            filtered ? (
              <EmptyState
                headingLevel={2}
                icon={<SearchIcon size={24} />}
                title="Không có lead nào khớp"
                description="Thử bộ lọc khác hoặc xem lại toàn bộ thời gian."
                action={
                  <Button variant="secondary" onClick={clearFilters}>
                    Bỏ bộ lọc
                  </Button>
                }
              />
            ) : (
              <EmptyState
                headingLevel={2}
                icon={<InboxIcon size={24} />}
                title={
                  filters.folder === 'spam'
                    ? 'Không có lead nào bị nghi ngờ spam'
                    : 'Chưa có lead nào trong 7 ngày qua'
                }
                description={
                  filters.folder === 'spam'
                    ? 'Lead điền ô ẩn chống bot hoặc gửi quá nhanh sẽ nằm ở đây, không tính vào số lead.'
                    : 'Lead từ form trên các trang live của site sẽ hiện ở đây.'
                }
                action={
                  filters.folder === 'spam' ? null : (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        update({ range: 'all' });
                      }}
                    >
                      Xem toàn bộ thời gian
                    </Button>
                  )
                }
              />
            )
          ) : (
            <div className={cx(styles.tableScroll, loading && styles.loading)} aria-busy={loading}>
              <LeadTable
                leads={leads}
                selectedId={selectedId}
                now={now}
                hrefOf={hrefOf}
                onSelect={(leadId) => {
                  setPicked(true);
                  setSelectedId(leadId);
                }}
              />
            </div>
          )}

          {leads.length > 0 ? (
            <div className={styles.listFooter}>
              <span>
                {folderCount === null
                  ? `${leads.length} lead`
                  : `${leads.length} / ${cappedCountLabel(folderCount)} lead`}
              </span>
              {listQuery.hasNextPage ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={listQuery.isFetchingNextPage}
                  onClick={() => {
                    void listQuery.fetchNextPage();
                  }}
                >
                  Tải thêm
                </Button>
              ) : null}
            </div>
          ) : null}
        </Card>

        {selectedId === null ? (
          <aside className={cx(styles.detail, styles.detailEmpty)} aria-label="Chi tiết lead">
            <p>Chọn một lead trong danh sách để xem chi tiết, gọi lại và ghi chú.</p>
          </aside>
        ) : (
          <LeadDetailPanel
            key={selectedId}
            siteId={site.id}
            leadId={selectedId}
            initialDetail={initialDetail?.id === selectedId ? initialDetail : undefined}
            canManage={canManage}
            focusOnShow={picked}
            onGone={() => {
              setSelectedId(null);
            }}
          />
        )}
      </div>
    </PageContainer>
  );
}
