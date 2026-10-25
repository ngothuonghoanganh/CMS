import type { AnalyticsRange, AnalyticsReport } from '@plp/contracts';
import { conversionRate, formatCount, previousLabel } from './analytics-presentation';
import styles from './Analytics.module.css';

export interface KpiTilesProps {
  report: AnalyticsReport;
  range: AnalyticsRange;
}

/** The four numbers of board 11, each against the same number of days just before. */
export function KpiTiles({ report, range }: KpiTilesProps) {
  const { totals, previousTotals } = report;
  const tiles = [
    {
      label: 'Lượt xem',
      value: formatCount(totals.views),
      note: previousLabel(range, previousTotals.views),
    },
    {
      label: 'Khách duy nhất',
      value: formatCount(totals.visitors),
      note: previousLabel(range, previousTotals.visitors),
    },
    {
      label: 'Lead',
      value: formatCount(totals.leads),
      note: `${previousLabel(range, previousTotals.leads)} · không tính spam`,
    },
    {
      label: 'Tỷ lệ chuyển đổi',
      value: conversionRate(totals.leads, totals.visitors),
      note: 'Lead ÷ khách duy nhất',
    },
  ];
  return (
    <dl className={styles.kpis}>
      {tiles.map((tile) => (
        <div key={tile.label} className={styles.kpi}>
          <dt>{tile.label}</dt>
          <dd className={styles.kpiValue}>{tile.value}</dd>
          <dd className={styles.kpiNote}>{tile.note}</dd>
        </div>
      ))}
    </dl>
  );
}
