'use client';

import type { AnalyticsReport } from '@plp/contracts';
import { Button, Card, VisuallyHidden } from '@plp/ui';
import { type KeyboardEvent, useId, useRef, useState } from 'react';
import { cx } from '../shell/cx';
import {
  chartDayParts,
  conversionRate,
  dayLabelKind,
  formatCount,
  labelEvery,
  niceTicks,
  tooltipDayLabel,
} from './analytics-presentation';
import styles from './Analytics.module.css';

export interface DailyVisitorsChartProps {
  daily: AnalyticsReport['daily'];
  /** The same numbers as a table; the screen keeps the choice when the filters change. */
  asTable: boolean;
  onAsTableChange: (asTable: boolean) => void;
}

type Day = AnalyticsReport['daily'][number];

function dayDetails(day: Day): string {
  return `${formatCount(day.visitors)} khách · ${formatCount(day.leads)} lead · ${conversionRate(day.leads, day.visitors)}`;
}

/** Where the tooltip sits over bar `index` of `count`: centred, or held inside the plot's edges. */
function tooltipPlacement(index: number, count: number): { left: string; transform: string } {
  const left = `${((index + 0.5) / count) * 100}%`;
  if (count > 2 && index < count * 0.2) {
    return { left, transform: 'translateX(-16px)' };
  }
  if (count > 2 && index >= count * 0.8) {
    return { left, transform: 'translateX(calc(-100% + 16px))' };
  }
  return { left, transform: 'translateX(-50%)' };
}

/**
 * Above a bar while there is room; over the top of a tall one, so the tooltip never leaves the
 * plot for the card's header and its controls. `share` is the bar's height over the axis.
 */
function tooltipHeight(share: number): { top: string } | { bottom: string } {
  return share > 0.6
    ? { top: `calc(${String((1 - share) * 100)}% + 8px)` }
    : { bottom: `calc(${String(share * 100)}% + 8px)` };
}

/**
 * "Khách duy nhất mỗi ngày" (board 11): one bar per day, one series. Each bar answers pointer and
 * keyboard alike (arrow keys move between days); the table view holds the same numbers.
 */
export function DailyVisitorsChart({ daily, asTable, onAsTableChange }: DailyVisitorsChartProps) {
  const headingId = useId();
  const [active, setActive] = useState<number | null>(null);
  // Roving focus: one bar is in the tab order, today's at first. Another report remounts the chart
  // (its key), so the index always points into the days shown.
  const [focusIndex, setFocusIndex] = useState(daily.length - 1);
  const slots = useRef<Array<HTMLButtonElement | null>>([]);
  const ticks = niceTicks(Math.max(0, ...daily.map((day) => day.visitors)));
  const top = ticks.at(-1) ?? 1;
  // Beyond a week only some days carry a label, and each label is wider than its day.
  const sparse = labelEvery(daily.length) > 1;
  const activeDay = active === null ? undefined : daily[active];
  const empty = daily.every((day) => day.visitors === 0);

  function moveTo(index: number) {
    const next = Math.min(Math.max(index, 0), daily.length - 1);
    setFocusIndex(next);
    slots.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // The tooltip covers its neighbours: Escape hides it and leaves focus where it is (WCAG 1.4.13).
    if (event.key === 'Escape' && active !== null) {
      event.preventDefault();
      setActive(null);
      return;
    }
    const moves: Record<string, number> = {
      ArrowLeft: focusIndex - 1,
      ArrowRight: focusIndex + 1,
      Home: 0,
      End: daily.length - 1,
    };
    const next = moves[event.key];
    if (next !== undefined) {
      event.preventDefault();
      moveTo(next);
    }
  }

  return (
    <Card as="section" padding="lg" aria-labelledby={headingId} className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 id={headingId} className={styles.cardTitle}>
          Khách duy nhất mỗi ngày
        </h2>
        <div className={styles.cardTools}>
          {asTable ? null : (
            <span className={styles.hint}>
              <span className={styles.hintPointer}>Di chuột lên cột để xem chi tiết</span>
              <span className={styles.hintTouch}>Chạm vào cột để xem chi tiết</span>
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onAsTableChange(!asTable);
            }}
          >
            {asTable ? 'Xem biểu đồ' : 'Xem dạng bảng'}
          </Button>
        </div>
      </div>

      {asTable ? (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption>
              <VisuallyHidden>Khách duy nhất mỗi ngày</VisuallyHidden>
            </caption>
            <thead>
              <tr>
                <th scope="col">NGÀY</th>
                <th scope="col" className={styles.number}>
                  LƯỢT XEM
                </th>
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
              {daily.map((day) => (
                <tr key={day.day}>
                  <th scope="row">{tooltipDayLabel(day.day)}</th>
                  <td className={styles.number}>{formatCount(day.views)}</td>
                  <td className={styles.number}>{formatCount(day.visitors)}</td>
                  <td className={styles.number}>{formatCount(day.leads)}</td>
                  <td className={styles.number}>{conversionRate(day.leads, day.visitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.chart}>
          <div className={styles.yAxis} aria-hidden="true">
            {ticks.map((tick) => (
              <span
                key={tick}
                className={styles.yTick}
                style={{ bottom: `${(tick / top) * 100}%` }}
              >
                {formatCount(tick)}
              </span>
            ))}
          </div>
          <div className={styles.plot}>
            {ticks.map((tick) => (
              <span
                key={tick}
                aria-hidden="true"
                className={cx(styles.gridline, tick === 0 && styles.baseline)}
                style={{ bottom: `${(tick / top) * 100}%` }}
              />
            ))}
            <div
              className={styles.bars}
              role="group"
              aria-label="Khách duy nhất mỗi ngày. Dùng phím mũi tên để xem từng ngày."
              onKeyDown={onKeyDown}
              onPointerLeave={(event) => {
                // A lifted finger leaves too: the tapped day stays shown until another is tapped.
                if (event.pointerType !== 'touch') {
                  setActive(null);
                }
              }}
            >
              {daily.map((day, index) => (
                <button
                  key={day.day}
                  ref={(node) => {
                    slots.current[index] = node;
                  }}
                  type="button"
                  tabIndex={index === focusIndex ? 0 : -1}
                  className={cx(styles.slot, index === active && styles.slotActive)}
                  aria-label={`${tooltipDayLabel(day.day)}: ${dayDetails(day)}`}
                  onPointerEnter={() => {
                    setActive(index);
                  }}
                  onFocus={() => {
                    setActive(index);
                    setFocusIndex(index);
                  }}
                  onBlur={() => {
                    setActive(null);
                  }}
                >
                  <span
                    className={styles.bar}
                    style={{ height: `${(day.visitors / top) * 100}%` }}
                  />
                </button>
              ))}
            </div>
            {empty ? <p className={styles.empty}>Chưa có khách nào trong khoảng này.</p> : null}
            {activeDay === undefined || active === null ? null : (
              // The focused bar's name already says this; the tooltip is for the eyes.
              <div
                className={styles.tooltip}
                aria-hidden="true"
                style={{
                  ...tooltipHeight(activeDay.visitors / top),
                  ...tooltipPlacement(active, daily.length),
                }}
              >
                <span className={styles.tooltipDay}>{tooltipDayLabel(activeDay.day)}</span>
                {dayDetails(activeDay)}
              </div>
            )}
          </div>
          <div className={cx(styles.xAxis, sparse && styles.xAxisSparse)} aria-hidden="true">
            {daily.map((day, index) => {
              const kind = dayLabelKind(index, daily.length);
              if (kind === null) {
                return <span key={day.day} className={styles.xLabel} />;
              }
              const parts = chartDayParts(day.day);
              return (
                <span
                  key={day.day}
                  className={cx(styles.xLabel, kind === 'minor' && styles.xLabelMinor)}
                >
                  <span className={styles.xDay}>
                    <span className={styles.xWeekday}>{parts.weekday}</span>{' '}
                    <span className={styles.xDate}>{parts.date}</span>
                  </span>
                  {sparse ? null : (
                    <span className={styles.xLeads}>{`${formatCount(day.leads)} lead`}</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
