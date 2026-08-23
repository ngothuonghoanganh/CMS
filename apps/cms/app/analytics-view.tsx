'use client';

import {
  AnalyticsOverviewResponseSchema,
  AnalyticsPageResponseSchema,
  type AnalyticsBreakdownItem,
  type AnalyticsOverviewResponse,
  type AnalyticsPageResponse,
} from '@payload/contracts';
import { useEffect, useMemo, useState } from 'react';

import { api } from './lib/api';

type RangePreset = 'today' | '7' | '30' | 'custom';

export function AnalyticsView({ workspaceId }: { workspaceId: string }) {
  const [preset, setPreset] = useState<RangePreset>('30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [overview, setOverview] = useState<AnalyticsOverviewResponse | null>(null);
  const [pageReport, setPageReport] = useState<AnalyticsPageResponse | null>(null);
  const [selectedPageId, setSelectedPageId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(
    () => resolveRange(preset, customFrom, customTo),
    [customFrom, customTo, preset],
  );

  useEffect(() => {
    if (!range) {
      setLoading(false);
      return;
    }
    void refresh(range.from, range.to);
  }, [range, selectedPageId, workspaceId]);

  async function refresh(from: string, to: string) {
    setLoading(true);
    setError(null);
    try {
      const query = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      const overviewResponse = await api.get(`/analytics/overview${query}`);
      const nextOverview = AnalyticsOverviewResponseSchema.parse(overviewResponse);
      setOverview(nextOverview);
      if (selectedPageId) {
        const pageResponse = await api.get(`/analytics/pages/${selectedPageId}${query}`);
        setPageReport(AnalyticsPageResponseSchema.parse(pageResponse));
      } else {
        setPageReport(null);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Analytics failed to load.',
      );
    } finally {
      setLoading(false);
    }
  }

  const report = pageReport ?? overview;
  const hasData = report
    ? report.metrics.pageViews > 0 ||
      report.metrics.submissions > 0 ||
      report.metrics.ctaClicks > 0
    : false;

  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">First-party analytics</span>
        <h1>Analytics</h1>
        <p className="muted">
          Lightweight page, session and conversion reporting. Sessions are anonymous
          browser sessions, not a count of unique people.
        </p>
      </div>
      <section className="panel analytics-toolbar" aria-label="Analytics filters">
        <label className="inline-field">
          Date range
          <select
            aria-label="Analytics date range"
            onChange={(event) => setPreset(event.target.value as RangePreset)}
            value={preset}
          >
            <option value="today">Today</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="custom">Custom range</option>
          </select>
        </label>
        {preset === 'custom' ? (
          <>
            <label className="inline-field">
              From
              <input
                aria-label="Analytics from date"
                onChange={(event) => setCustomFrom(event.target.value)}
                type="date"
                value={customFrom}
              />
            </label>
            <label className="inline-field">
              To
              <input
                aria-label="Analytics to date"
                onChange={(event) => setCustomTo(event.target.value)}
                type="date"
                value={customTo}
              />
            </label>
          </>
        ) : null}
        <button
          className="button button-ghost button-small"
          disabled={loading || !range}
          onClick={() => (range ? void refresh(range.from, range.to) : undefined)}
          type="button"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </section>
      {error ? (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
          <button
            className="button button-small button-ghost"
            onClick={() => (range ? void refresh(range.from, range.to) : undefined)}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : null}
      {loading && !report ? (
        <div className="analytics-skeleton" aria-busy="true">
          Loading analytics…
        </div>
      ) : report ? (
        <AnalyticsReport
          overview={overview}
          pageReport={pageReport}
          selectedPageId={selectedPageId}
          onSelectPage={setSelectedPageId}
          hasData={hasData}
        />
      ) : (
        <div className="panel empty-state" role="status">
          <strong>Select a complete date range</strong>
          <span className="muted">
            Choose both dates to load a custom analytics report.
          </span>
        </div>
      )}
    </>
  );
}

function AnalyticsReport({
  overview,
  pageReport,
  selectedPageId,
  onSelectPage,
  hasData,
}: {
  overview: AnalyticsOverviewResponse | null;
  pageReport: AnalyticsPageResponse | null;
  selectedPageId: string;
  onSelectPage: (value: string) => void;
  hasData: boolean;
}) {
  const report = pageReport ?? overview;
  if (!report) return null;
  return (
    <>
      <div className="panel-heading analytics-report-heading">
        <div>
          <span className="muted small">
            {formatDate(report.range.from)} – {formatDate(report.range.to)} · UTC
          </span>
          <h2>{pageReport ? pageReport.page.name : 'Workspace overview'}</h2>
        </div>
        {overview?.topPages.length ? (
          <label className="inline-field">
            Landing page
            <select
              aria-label="Analytics landing page"
              onChange={(event) => onSelectPage(event.target.value)}
              value={selectedPageId}
            >
              <option value="">All landing pages</option>
              {overview.topPages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.name} · {page.siteName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="metric-grid analytics-metric-grid">
        <AnalyticsMetric label="Page views" value={report.metrics.pageViews} />
        <AnalyticsMetric label="Sessions" value={report.metrics.sessions} />
        <AnalyticsMetric label="Form submissions" value={report.metrics.submissions} />
        <AnalyticsMetric
          label="Conversion rate"
          value={formatPercent(report.metrics.conversionRate)}
        />
        <AnalyticsMetric label="CTA clicks" value={report.metrics.ctaClicks} />
      </div>
      {!hasData ? (
        <div className="panel empty-state" role="status">
          <strong>No analytics data yet</strong>
          <span className="muted">
            Publish a page and share it to see page views, sessions and conversions here.
          </span>
        </div>
      ) : null}
      <section className="panel">
        <div className="panel-heading">
          <h2>Traffic trend</h2>
          <span className="muted small">UTC day buckets</span>
        </div>
        <div className="analytics-table-wrap">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Views</th>
                <th>Sessions</th>
                <th>Submissions</th>
                <th>Conversion</th>
              </tr>
            </thead>
            <tbody>
              {report.timeline.map((point) => (
                <tr key={point.date}>
                  <td>{point.date}</td>
                  <td>{point.pageViews}</td>
                  <td>{point.sessions}</td>
                  <td>{point.submissions}</td>
                  <td>{formatPercent(point.conversionRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {overview && !pageReport ? <TopPages pages={overview.topPages} /> : null}
      <div className="analytics-breakdown-grid">
        <Breakdown
          title="Top referrers"
          items={report.topReferrers}
          empty="No referrer data yet."
        />
        <Breakdown
          title="UTM campaigns"
          items={report.topCampaigns}
          empty="No campaign data yet."
        />
        <Breakdown
          title="Devices"
          items={report.deviceBreakdown}
          empty="No device data yet."
        />
      </div>
    </>
  );
}

function AnalyticsMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric-card analytics-metric-card">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TopPages({ pages }: { pages: AnalyticsOverviewResponse['topPages'] }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Top landing pages</h2>
      </div>
      {pages.length ? (
        <div className="list">
          {pages.map((page) => (
            <div className="list-row" key={page.id}>
              <div>
                <strong>{page.name}</strong>
                <span className="muted">
                  {page.siteName} · /{page.slug ?? 'no-slug'}
                </span>
              </div>
              <span className="pill">{page.metrics.pageViews} views</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span className="muted">No page activity in this range.</span>
        </div>
      )}
    </section>
  );
}

function Breakdown({
  title,
  items,
  empty,
}: {
  title: string;
  items: AnalyticsBreakdownItem[];
  empty: string;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
      </div>
      {items.length ? (
        <div className="list">
          {items.slice(0, 8).map((item) => (
            <div className="list-row" key={item.name}>
              <div>
                <strong>{item.name}</strong>
                <span className="muted">
                  {item.sessions} sessions · {item.submissions} submissions
                </span>
              </div>
              <span className="pill">{item.pageViews} views</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span className="muted">{empty}</span>
        </div>
      )}
    </section>
  );
}

function resolveRange(
  preset: RangePreset,
  customFrom: string,
  customTo: string,
): { from: string; to: string } | null {
  const now = new Date();
  if (preset === 'custom') {
    if (!customFrom || !customTo) return null;
    return {
      from: new Date(`${customFrom}T00:00:00.000Z`).toISOString(),
      to: new Date(`${customTo}T23:59:59.999Z`).toISOString(),
    };
  }
  const from = new Date(now);
  if (preset === 'today') {
    from.setUTCHours(0, 0, 0, 0);
  } else {
    from.setUTCDate(from.getUTCDate() - Number(preset));
  }
  return { from: from.toISOString(), to: now.toISOString() };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  });
}

function formatPercent(value: number): string {
  return value === 0 ? '0%' : `${value.toFixed(1)}%`;
}
