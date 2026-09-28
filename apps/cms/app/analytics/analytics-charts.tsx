import type {
  AnalyticsBreakdownItem,
  AnalyticsPageSummary,
  AnalyticsTimeSeriesPoint,
} from '@payload/contracts';
import { useId, useState } from 'react';

type AnalyticsChartsProps = {
  breakdowns: {
    campaigns: AnalyticsBreakdownItem[];
    devices: AnalyticsBreakdownItem[];
    referrers: AnalyticsBreakdownItem[];
  };
  timeline: AnalyticsTimeSeriesPoint[];
  topPages?: AnalyticsPageSummary[] | undefined;
  onSelectPage?: ((value: string) => void) | undefined;
  selectedPageId?: string | undefined;
};

type TrendKey = 'pageViews' | 'sessions' | 'submissions';

type TrendSeries = {
  color: string;
  key: TrendKey;
  label: string;
};

const trendSeries: TrendSeries[] = [
  { color: 'var(--cms-primary)', key: 'pageViews', label: 'Page views' },
  { color: 'var(--cms-info)', key: 'sessions', label: 'Sessions' },
  { color: 'var(--cms-success)', key: 'submissions', label: 'Submissions' },
];

export function AnalyticsCharts({
  breakdowns,
  timeline,
  topPages,
  onSelectPage,
  selectedPageId,
}: AnalyticsChartsProps) {
  const hasTopPages = topPages !== undefined;

  return (
    <div aria-label="Analytics visualizations" className="analytics-chart-stack">
      <div
        className={
          hasTopPages
            ? 'analytics-chart-grid'
            : 'analytics-chart-grid analytics-chart-grid-single'
        }
      >
        <section className="panel analytics-chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Traffic trend</h2>
              <span className="analytics-chart-subtitle">
                Daily activity in the selected range
              </span>
            </div>
            <span className="muted small">UTC</span>
          </div>
          <TrafficTrendChart points={timeline} />
        </section>
        {hasTopPages ? (
          <section className="panel analytics-chart-panel">
            <div className="panel-heading">
              <div>
                <h2>Top pages</h2>
                <span className="analytics-chart-subtitle">
                  Pages with the most views
                </span>
              </div>
            </div>
            <TopPagesChart
              onSelectPage={onSelectPage}
              pages={topPages}
              selectedPageId={selectedPageId}
            />
          </section>
        ) : null}
      </div>
      <div className="analytics-breakdown-chart-grid">
        <BreakdownChart
          empty="No referrer data yet."
          items={breakdowns.referrers}
          title="Top referrers"
        />
        <BreakdownChart
          empty="No campaign data yet."
          items={breakdowns.campaigns}
          title="UTM campaigns"
        />
        <BreakdownChart
          empty="No device data yet."
          items={breakdowns.devices}
          title="Devices"
        />
      </div>
    </div>
  );
}

function TrafficTrendChart({ points }: { points: AnalyticsTimeSeriesPoint[] }) {
  const titleId = useId();
  const [activeSeries, setActiveSeries] = useState<Record<TrendKey, boolean>>({
    pageViews: true,
    sessions: true,
    submissions: true,
  });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  if (!points.length) {
    return (
      <div className="empty-state" role="status">
        <span className="muted">No traffic data in this range.</span>
      </div>
    );
  }

  const chart = { bottom: 214, left: 48, right: 744, top: 18 };
  const chartHeight = chart.bottom - chart.top;
  const visibleSeries = trendSeries.filter((series) => activeSeries[series.key]);
  const maxValue = Math.max(
    1,
    ...points.flatMap((point) => visibleSeries.map((series) => point[series.key])),
  );
  const xFor = (index: number) =>
    chart.left + (index / Math.max(points.length - 1, 1)) * (chart.right - chart.left);
  const yFor = (value: number) => chart.bottom - (value / maxValue) * chartHeight;
  const gridValues = [maxValue, maxValue / 2, 0];
  const labelIndexes = uniqueIndexes([
    0,
    Math.floor((points.length - 1) / 2),
    points.length - 1,
  ]);
  const hoveredPoint = hoveredIndex === null ? undefined : points[hoveredIndex];
  const toggleSeries = (key: TrendKey) => {
    setActiveSeries((current) => {
      const activeCount = Object.values(current).filter(Boolean).length;
      if (current[key] && activeCount === 1) return current;
      return { ...current, [key]: !current[key] };
    });
  };

  return (
    <>
      <svg
        aria-keyshortcuts="ArrowLeft ArrowRight"
        aria-labelledby={titleId}
        className="analytics-line-chart"
        onBlur={() => setHoveredIndex(null)}
        onFocus={() => setHoveredIndex((current) => current ?? 0)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          setHoveredIndex((current) => {
            const nextIndex = current ?? 0;
            return event.key === 'ArrowLeft'
              ? Math.max(0, nextIndex - 1)
              : Math.min(points.length - 1, nextIndex + 1);
          });
        }}
        role="img"
        tabIndex={0}
        viewBox="0 0 760 250"
      >
        <title id={titleId}>Traffic trend by day</title>
        {gridValues.map((value) => {
          const y = yFor(value);
          return (
            <g key={value}>
              <line
                className="analytics-chart-gridline"
                x1={chart.left}
                x2={chart.right}
                y1={y}
                y2={y}
              />
              <text className="analytics-chart-axis-label" x="0" y={y + 4}>
                {formatCompactNumber(value)}
              </text>
            </g>
          );
        })}
        {visibleSeries.map((series) => (
          <path
            className="analytics-chart-line"
            d={buildPath(points, series.key, xFor, yFor)}
            key={series.key}
            stroke={series.color}
          />
        ))}
        {hoveredIndex !== null ? (
          <line
            className="analytics-chart-hover-line"
            x1={xFor(hoveredIndex)}
            x2={xFor(hoveredIndex)}
            y1={chart.top}
            y2={chart.bottom}
          />
        ) : null}
        {visibleSeries.flatMap((series) =>
          points.map((point, index) => (
            <circle
              aria-label={`${series.label} on ${formatTooltipDate(point.date)}: ${point[series.key]}`}
              className="analytics-chart-point"
              cx={xFor(index)}
              cy={yFor(point[series.key])}
              fill={series.color}
              key={`${series.key}-${point.date}`}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              r={hoveredIndex === index ? 5 : 3}
            />
          )),
        )}
        {labelIndexes.map((index) => (
          <text
            className="analytics-chart-axis-label"
            key={`${points[index]?.date ?? 'date'}-${index}`}
            textAnchor={getTextAnchor(index, points.length)}
            x={xFor(index)}
            y="242"
          >
            {formatChartDate(points[index]?.date ?? '')}
          </text>
        ))}
      </svg>
      <div aria-live="polite" className="analytics-chart-tooltip">
        {hoveredPoint ? (
          <>
            <strong>{formatTooltipDate(hoveredPoint.date)}</strong>
            <span>
              {trendSeries
                .map((series) => `${series.label}: ${hoveredPoint[series.key]}`)
                .join(' · ')}
            </span>
          </>
        ) : (
          <span>Hover or focus a point to inspect the daily totals.</span>
        )}
      </div>
      <div className="analytics-chart-legend" aria-label="Traffic trend legend">
        {trendSeries.map((series) => (
          <button
            aria-pressed={activeSeries[series.key]}
            className={
              activeSeries[series.key]
                ? 'analytics-chart-legend-item is-active'
                : 'analytics-chart-legend-item'
            }
            disabled={activeSeries[series.key] && visibleSeries.length === 1}
            key={series.key}
            onClick={() => toggleSeries(series.key)}
            type="button"
          >
            <span
              aria-hidden="true"
              className={`analytics-chart-legend-dot analytics-chart-legend-dot-${series.key}`}
            />
            {series.label}
          </button>
        ))}
      </div>
    </>
  );
}

function TopPagesChart({
  onSelectPage,
  pages,
  selectedPageId,
}: {
  onSelectPage: ((value: string) => void) | undefined;
  pages: AnalyticsPageSummary[];
  selectedPageId: string | undefined;
}) {
  if (!pages.length) {
    return (
      <div className="empty-state" role="status">
        <span className="muted">No page activity in this range.</span>
      </div>
    );
  }

  const visiblePages = pages.slice(0, 8);
  const maxViews = Math.max(1, ...visiblePages.map((page) => page.metrics.pageViews));

  return (
    <div className="analytics-ranking-chart" role="list">
      {visiblePages.map((page) => (
        <div className="analytics-ranking-item" key={page.id} role="listitem">
          <button
            aria-pressed={selectedPageId === page.id}
            className={
              selectedPageId === page.id
                ? 'analytics-ranking-button is-selected'
                : 'analytics-ranking-button'
            }
            disabled={!onSelectPage}
            onClick={() => onSelectPage?.(page.id)}
            type="button"
          >
            <div className="analytics-ranking-heading">
              <div
                className="analytics-ranking-copy"
                title={`${page.name} · ${page.siteName}`}
              >
                <strong>{page.name}</strong>
                <span className="muted">
                  {page.siteName} · {page.pagePath ?? (page.slug ? `/${page.slug}` : '/')}
                </span>
              </div>
              <strong className="analytics-chart-value">
                {formatCompactNumber(page.metrics.pageViews)}
              </strong>
            </div>
            <div
              aria-label={`${page.name} page views`}
              aria-valuemax={maxViews}
              aria-valuemin={0}
              aria-valuenow={page.metrics.pageViews}
              className="analytics-ranking-bar"
              role="progressbar"
            >
              <span style={{ width: `${(page.metrics.pageViews / maxViews) * 100}%` }} />
            </div>
          </button>
        </div>
      ))}
    </div>
  );
}

function BreakdownChart({
  empty,
  items,
  title,
}: {
  empty: string;
  items: AnalyticsBreakdownItem[];
  title: string;
}) {
  const visibleItems = items.slice(0, 8);
  const maxViews = Math.max(1, ...visibleItems.map((item) => item.pageViews));

  return (
    <section className="panel analytics-chart-panel">
      <div className="panel-heading">
        <h2>{title}</h2>
      </div>
      {visibleItems.length ? (
        <div className="analytics-ranking-chart" role="list">
          {visibleItems.map((item) => (
            <div className="analytics-ranking-item" key={item.name} role="listitem">
              <div className="analytics-ranking-heading">
                <div className="analytics-ranking-copy" title={item.name}>
                  <strong>{item.name}</strong>
                  <span className="muted">
                    {item.sessions} sessions · {item.submissions} submissions
                  </span>
                </div>
                <strong className="analytics-chart-value">
                  {formatCompactNumber(item.pageViews)}
                </strong>
              </div>
              <div
                aria-label={`${item.name} page views`}
                aria-valuemax={maxViews}
                aria-valuemin={0}
                aria-valuenow={item.pageViews}
                className="analytics-ranking-bar"
                role="progressbar"
                tabIndex={0}
                title={`${item.name}: ${item.pageViews} views, ${item.sessions} sessions, ${item.submissions} submissions`}
              >
                <span style={{ width: `${(item.pageViews / maxViews) * 100}%` }} />
              </div>
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

function buildPath(
  points: AnalyticsTimeSeriesPoint[],
  key: TrendSeries['key'],
  xFor: (index: number) => number,
  yFor: (value: number) => number,
): string {
  return points
    .map(
      (point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yFor(point[key])}`,
    )
    .join(' ');
}

function uniqueIndexes(indexes: number[]): number[] {
  return [...new Set(indexes)];
}

function getTextAnchor(index: number, count: number): 'end' | 'middle' | 'start' {
  if (index === 0) return 'start';
  if (index === count - 1) return 'end';
  return 'middle';
}

function formatChartDate(value: string): string {
  return value ? value.slice(5).replace('-', '/') : '';
}

function formatTooltipDate(value: string): string {
  return value ? `${value} UTC` : 'Unknown date';
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}m`;
  if (value >= 1_000) return `${Math.round(value / 100) / 10}k`;
  return String(Math.round(value));
}
