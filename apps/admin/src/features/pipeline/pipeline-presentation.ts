import {
  lostReasonLabels,
  type Opportunity,
  type OpportunityStage,
  type PipelineResponse,
} from '@plp/contracts';
import { formatDayMonth, formatVnd } from '../../lib/format';
import { dueMoment, span } from '../contacts/profile/profile-presentation';

export { formatVnd, parseVnd } from '../../lib/format';

/** "23 cơ hội đang mở · giá trị dự kiến 412.000.000 ₫ · tháng này thắng 6, thua 4" */
export function summaryLine(summary: PipelineResponse['summary']): string {
  return [
    `${summary.open} cơ hội đang mở`,
    `giá trị dự kiến ${formatVnd(summary.openValue)}`,
    `tháng này thắng ${summary.wonThisMonth}, thua ${summary.lostThisMonth}`,
  ].join(' · ');
}

export function isLate(opportunity: Opportunity, now: number): boolean {
  return opportunity.next !== null && Date.parse(opportunity.next.dueAt) < now;
}

/** The last line of a card: what happens next, or how it closed. */
export function nextLine(opportunity: Opportunity, now: number): string {
  if (opportunity.won !== null) {
    return `Thắng ${formatDayMonth(`${opportunity.won.on}T12:00:00.000Z`)}`;
  }
  if (opportunity.lost !== null) {
    return `Thua · ${lostReasonLabels[opportunity.lost.reason]}`;
  }
  const next = opportunity.next;
  if (next === null) {
    return 'Chưa có việc tiếp theo';
  }
  return isLate(opportunity, now)
    ? `${next.title} · quá hạn ${span(now - Date.parse(next.dueAt))}`
    : `${next.title} · ${dueMoment(next.dueAt, now)}`;
}

/** The value a card shows: the actual one once won, the expected one otherwise. */
export function cardValue(opportunity: Opportunity): number | null {
  return opportunity.won === null ? opportunity.value : opportunity.won.value;
}

/** Stages a card can move to from its own, in board order. */
export function movesFrom(stage: OpportunityStage): OpportunityStage[] {
  if (stage === 'won' || stage === 'lost') {
    return [];
  }
  return (['new', 'contacted', 'scheduled', 'visited', 'won', 'lost'] as const).filter(
    (item) => item !== stage,
  );
}
