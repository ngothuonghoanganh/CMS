import { type AnalyticsReport, analyticsSourceLabel } from '@plp/contracts';
import { Card, VisuallyHidden } from '@plp/ui';
import { useId } from 'react';
import { conversionRate, formatCount } from './analytics-presentation';
import styles from './Analytics.module.css';

/** "Theo nguồn truy cập": visitors, leads and their rate per source/medium pair. */
export function SourceTable({ sources }: { sources: AnalyticsReport['sources'] }) {
  const headingId = useId();
  return (
    <Card as="section" padding="lg" aria-labelledby={headingId} className={styles.card}>
      <h2 id={headingId} className={styles.cardTitle}>
        Theo nguồn truy cập
      </h2>
      {sources.length === 0 ? (
        <p className={styles.note}>Chưa có khách nào trong khoảng này.</p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">NGUỒN / KÊNH</th>
                <th scope="col" className={styles.number}>
                  KHÁCH
                </th>
                <th scope="col" className={styles.number}>
                  LEAD
                </th>
                <th scope="col" className={styles.number}>
                  TỶ LỆ
                </th>
              </tr>
            </thead>
            <tbody>
              {sources.map((row) => (
                <tr key={`${row.source}/${row.medium}`}>
                  <th scope="row" className={styles.mono}>
                    {analyticsSourceLabel(row)}
                  </th>
                  <td className={styles.number}>{formatCount(row.visitors)}</td>
                  <td className={styles.number}>{formatCount(row.leads)}</td>
                  <td className={styles.number}>{conversionRate(row.leads, row.visitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** "Theo trang": each page's leads and their rate, most leads first. */
export function PageBreakdown({ pages }: { pages: AnalyticsReport['pages'] }) {
  const headingId = useId();
  return (
    <Card as="section" padding="lg" aria-labelledby={headingId} className={styles.card}>
      <h2 id={headingId} className={styles.cardTitle}>
        Theo trang
      </h2>
      {pages.length === 0 ? (
        <p className={styles.note}>Chưa trang nào có khách hoặc lead trong khoảng này.</p>
      ) : (
        <ul className={styles.pageList}>
          {pages.map((row) => (
            <li key={row.page.id} className={styles.pageRow}>
              <span className={styles.pageTitle} title={row.page.title}>
                {row.page.title}
              </span>
              <span className={styles.pageNumbers}>
                {`${formatCount(row.leads)} lead · `}
                <span className={styles.strong}>{conversionRate(row.leads, row.visitors)}</span>
                <VisuallyHidden>{`, ${formatCount(row.visitors)} khách`}</VisuallyHidden>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function share(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

/** "Thiết bị": the share of unique visitors on phones and computers. */
export function DeviceSplit({ devices }: { devices: AnalyticsReport['devices'] }) {
  const headingId = useId();
  const total = devices.mobile + devices.desktop;
  const mobile = share(devices.mobile, total);
  const desktop = total === 0 ? 0 : 100 - mobile;
  const segments = [
    { key: 'mobile', label: 'Điện thoại', percent: mobile, className: styles.mobile },
    { key: 'desktop', label: 'Máy tính', percent: desktop, className: styles.desktop },
  ];
  return (
    <Card as="section" padding="lg" aria-labelledby={headingId} className={styles.card}>
      <h2 id={headingId} className={styles.cardTitle}>
        Thiết bị
      </h2>
      {total === 0 ? (
        <p className={styles.note}>Chưa có khách nào trong khoảng này.</p>
      ) : (
        <>
          <div className={styles.deviceBar} aria-hidden="true">
            {segments
              .filter((segment) => segment.percent > 0)
              .map((segment) => (
                <span
                  key={segment.key}
                  className={`${styles.deviceSegment} ${segment.className}`}
                  style={{ width: `${segment.percent}%` }}
                />
              ))}
          </div>
          <ul className={styles.legend}>
            {segments.map((segment) => (
              <li key={segment.key} className={styles.legendItem}>
                <span className={`${styles.swatch} ${segment.className}`} aria-hidden="true" />
                {`${segment.label} · `}
                <span className={styles.strong}>{`${String(segment.percent)}%`}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
