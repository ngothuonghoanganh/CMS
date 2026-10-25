'use client';

import type { AnalyticsReport, VnDay } from '@plp/contracts';
import { Button, Card, VisuallyHidden } from '@plp/ui';
import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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
 * keyboard alike (arrow keys move between days); the table view holds the same numbers. The chart
 * stays mounted as reports change, so focus on its controls survives a new range.
 */
export function DailyVisitorsChart({ daily, asTable, onAsTableChange }: DailyVisitorsChartProps) {
  const headingId = useId();
  // Days rather than positions: another report may bring other days.
  const [activeDay, setActiveDay] = useState<VnDay | null>(null);
  // Roving focus: one bar is in the tab order. Today's until a bar takes focus; a report without
  // that day gives the tab stop back to today.
  const [focusDay, setFocusDay] = useState<VnDay | null>(null);
  const slots = useRef<Array<HTMLButtonElement | null>>([]);
  // The bar that has focus; kept when a new report removes it, so focus can move to today's bar.
  const focusedBar = useRef<HTMLButtonElement | null>(null);
  // A finger or pen that lifted from a tap and has not entered another day since: its leaving
  // keeps the tapped day shown.
  const lifted = useRef<number | null>(null);
  const ticks = niceTicks(Math.max(0, ...daily.map((day) => day.visitors)));
  const top = ticks.at(-1) ?? 1;
  // Beyond a week only some days carry a label, and each label is wider than its day.
  const sparse = labelEvery(daily.length) > 1;
  const focused = daily.findIndex((day) => day.day === focusDay);
  const focusIndex = focused === -1 ? daily.length - 1 : focused;
  const active = daily.findIndex((day) => day.day === activeDay);
  const shownDay = daily[active];
  const empty = daily.every((day) => day.visitors === 0);

  // A report without the focused day removed its bar and focus fell to the page: today's bar
  // takes it, so a keyboard user keeps their place in the chart.
  useLayoutEffect(() => {
    const bar = focusedBar.current;
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (bar !== null && !bar.isConnected && lost) {
      slots.current[daily.length - 1]?.focus();
    }
  });

  // The tooltip covers its neighbours: Escape hides it however it opened, hover included, and
  // leaves focus where it is (WCAG 1.4.13).
  useEffect(() => {
    if (activeDay === null) {
      return undefined;
    }
    function onEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setActiveDay(null);
      }
    }
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('keydown', onEscape);
    };
  }, [activeDay]);

  function moveTo(index: number) {
    slots.current[Math.min(Math.max(index, 0), daily.length - 1)]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
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
              onPointerUp={(event) => {
                lifted.current = event.pointerType === 'mouse' ? null : event.pointerId;
              }}
              onPointerLeave={(event) => {
                // A finger or pen lifting after a tap leaves too, and the tapped day stays shown.
                // Any other leave hides it: a mouse moving away, a touch that became a scroll.
                if (lifted.current !== event.pointerId) {
                  setActiveDay(null);
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
                  onPointerEnter={(event) => {
                    // A pen that hovers on after its tap has moved on from the tapped day.
                    if (lifted.current === event.pointerId) {
                      lifted.current = null;
                    }
                    setActiveDay(day.day);
                  }}
                  onFocus={(event) => {
                    focusedBar.current = event.currentTarget;
                    setActiveDay(day.day);
                    setFocusDay(day.day);
                  }}
                  onBlur={(event) => {
                    setActiveDay(null);
                    // Focus moved elsewhere on the page; a bar that a new report removed keeps it.
                    if (event.currentTarget.isConnected) {
                      focusedBar.current = null;
                    }
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
            {shownDay === undefined ? null : (
              // The focused bar's name already says this; the tooltip is for the eyes.
              <div
                className={styles.tooltip}
                aria-hidden="true"
                style={{
                  ...tooltipHeight(shownDay.visitors / top),
                  ...tooltipPlacement(active, daily.length),
                }}
              >
                <span className={styles.tooltipDay}>{tooltipDayLabel(shownDay.day)}</span>
                {dayDetails(shownDay)}
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
