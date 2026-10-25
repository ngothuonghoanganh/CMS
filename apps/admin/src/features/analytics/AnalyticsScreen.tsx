'use client';

import {
  type AnalyticsRange,
  analyticsRanges,
  endpoints,
  type LeadPageRef,
  type AnalyticsReport,
  type Site,
} from '@plp/contracts';
import { Button, Callout, Field, SegmentedControl, Select, Spinner } from '@plp/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { PageContainer, PageHeader } from '../shell/PageHeader';
import { problemMessage } from '../shell/problem-message';
import { periodLabel } from './analytics-presentation';
import { DeviceSplit, PageBreakdown, SourceTable } from './Breakdowns';
import { DailyVisitorsChart } from './DailyVisitorsChart';
import {
  analyticsQuery,
  analyticsSearch,
  type AnalyticsFilters,
  sameAnalyticsFilters,
} from './filters';
import { KpiTiles } from './KpiTiles';
import { analyticsQueryKeys } from './queries';
import styles from './Analytics.module.css';

const RANGE_OPTIONS = analyticsRanges.map((range) => ({
  value: range,
  label: `${range.slice(0, -1)} ngày`,
}));

export interface AnalyticsScreenProps {
  site: Site;
  /** Every page of the site, for "Tất cả trang" and its pages. */
  pageRefs: readonly LeadPageRef[];
  initialFilters: AnalyticsFilters;
  initialReport: AnalyticsReport;
  loadedAt: number;
}

/**
 * "Hiệu quả" (board 11, ADR-019): views, unique visitors, leads and their rate for 7, 30 or 90 days
 * against the days just before, of the whole site or one page. Views of drafts and of the
 * workspace's members (through the admin's links) are not counted.
 */
export function AnalyticsScreen({
  site,
  pageRefs,
  initialFilters,
  initialReport,
  loadedAt,
}: AnalyticsScreenProps) {
  const [filters, setFilters] = useState(initialFilters);

  // The URL mirrors the filters so a reload or a shared link keeps them; replacing the entry keeps
  // the server from rendering the page again.
  const search = analyticsSearch(filters);
  useEffect(() => {
    const url = `${window.location.pathname}${search}`;
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', url);
    }
  }, [search]);

  const report = useQuery({
    queryKey: analyticsQueryKeys.report(site.id, filters),
    queryFn: ({ signal }) =>
      api(endpoints.analyticsReport, [site.id], { query: analyticsQuery(filters), signal }),
    initialData: () => (sameAnalyticsFilters(filters, initialFilters) ? initialReport : undefined),
    initialDataUpdatedAt: loadedAt,
    placeholderData: keepPreviousData,
  });
  const data = report.data;

  return (
    <PageContainer>
      <PageHeader
        title="Hiệu quả"
        description={
          data === undefined
            ? 'Không tính lượt xem bản nháp và người trong workspace'
            : `${periodLabel(data.period)} · không tính lượt xem bản nháp và người trong workspace`
        }
        actions={
          <div className={styles.filters}>
            <Field label="Xem trang" hideLabel className={styles.pageFilter}>
              <Select
                value={filters.pageId ?? ''}
                onChange={(event) => {
                  const pageId = event.target.value;
                  setFilters((value) => ({ ...value, pageId: pageId === '' ? null : pageId }));
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
            <SegmentedControl<AnalyticsRange>
              aria-label="Khoảng thời gian"
              options={RANGE_OPTIONS}
              value={filters.range}
              onChange={(range) => {
                setFilters((value) => ({ ...value, range }));
              }}
            />
          </div>
        }
      />

      {report.isError ? (
        <Callout
          tone="danger"
          role="alert"
          title="Chưa tải được số liệu"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void report.refetch();
              }}
            >
              Thử lại
            </Button>
          }
        >
          {problemMessage(report.error)}
        </Callout>
      ) : null}

      {data === undefined ? (
        report.isError ? null : (
          <Spinner label="Đang tải số liệu" />
        )
      ) : (
        <div
          className={styles.content}
          data-refreshing={report.isPlaceholderData}
          aria-busy={report.isPlaceholderData}
        >
          <KpiTiles report={data} range={filters.range} />
          <DailyVisitorsChart key={`${filters.range}-${filters.pageId ?? ''}`} daily={data.daily} />
          <div className={styles.columns}>
            <SourceTable sources={data.sources} />
            <div className={styles.side}>
              {filters.pageId === null ? <PageBreakdown pages={data.pages} /> : null}
              <DeviceSplit devices={data.devices} />
            </div>
          </div>
          <p className={styles.method}>
            Khách duy nhất được đếm theo từng ngày, không dùng cookie: một người quay lại vào ngày
            khác được tính là khách mới. Lượt xem từ nút &ldquo;Xem trang live&rdquo; trong admin
            không được tính; lượt xem của thành viên từ trình duyệt khác vẫn được tính.
          </p>
        </div>
      )}
    </PageContainer>
  );
}
