import {
  type ChargeOutcome,
  type InvoiceStatus,
  type SubscriptionFacts,
  trialEndAwaitsTransfer,
  trialEndCharges,
} from '@plp/contracts';
import { DAY_MS } from './billing-period.js';
import {
  type BillingPolicy,
  currentEndOf,
  paymentUnderWay,
  renewalBlockerOf,
  transferInvoiceAtOf,
} from './renewal.js';

/*
 * What the subscription's job does next, and when (ADR-035, T3): the timeline that follows from
 * the subscription's facts and its unpaid invoices. `nextActionAt` is the earliest time on it, so
 * the job wakes for nothing else and no state is stored but the facts.
 */

/** How long after a charge with an unknown outcome the gateway is asked again, doubling each time. */
export const SETTLE_FIRST_MS = 15 * 60_000;
/** The longest wait between two questions about one charge. */
export const SETTLE_MAX_MS = 6 * 3_600_000;

export type AgendaKind =
  | 'trial_reminder'
  | 'trial_end'
  | 'expiring_notice'
  | 'renewal'
  | 'retry'
  | 'settle'
  | 'read_only_notice'
  | 'transfer_invoice';

export interface AgendaItem {
  kind: AgendaKind;
  at: Date;
  /**
   * For work still owed once its time passed (`OUTSTANDING_KINDS`): when it stops being owed. The
   * transfer invoice of a trial whose transfer was chosen once it was over is owed until it ended,
   * so never.
   */
  until?: Date;
}

/**
 * Work that is on the timeline only while it is not done (T4): the transfer invoice to make or to
 * complete with the gateway's details. A write that finds its time passed wakes the job at once
 * (`outstandingAt`), where any other past time was done by the run it woke.
 */
export const OUTSTANDING_KINDS: readonly AgendaKind[] = ['transfer_invoice'];

/** An unpaid invoice, as far as the timeline needs it. */
export interface AgendaInvoice {
  status: InvoiceStatus;
  createdAt: Date;
  attempts: readonly { at: Date; outcome: ChargeOutcome }[];
}

export interface AgendaInput {
  facts: Pick<
    SubscriptionFacts,
    | 'trialEndsAt'
    | 'periodEnd'
    | 'cancelAtPeriodEnd'
    | 'openInvoiceId'
    | 'failedSince'
    | 'paymentMethod'
    | 'cardAfterTrial'
    | 'renewalMethod'
    | 'renewalMethodChosenAt'
    | 'renewalInvoiceId'
    | 'prepaid'
  >;
  policy: BillingPolicy;
  /** The invoice the subscription waits for (`openInvoiceId`); null without one. */
  due: AgendaInvoice | null;
  /** The workspace's other invoices whose charge has an unknown outcome (`open`). */
  undecided: readonly AgendaInvoice[];
  /**
   * When the invoice of a renewal by transfer that still lacks the gateway's details was made
   * (T4): the early one, or the one the ended period waits for. Null when none lacks them.
   */
  transferDetailsLacking?: Date | null;
}

/** When the job charges again after the first failure of a period, in order. */
export function retryTimesOf(failedSince: Date, retryDays: readonly number[]): Date[] {
  return retryDays.map((days) => new Date(failedSince.getTime() + days * DAY_MS));
}

function lastAttemptAt(attempts: AgendaInvoice['attempts']): number {
  return attempts.at(-1)?.at.getTime() ?? Number.NEGATIVE_INFINITY;
}

/**
 * The first retry not made yet: a retry is made once the invoice has a charge at or after its
 * time, whoever made it. Null when none is left: after the last, only the owner pays.
 */
export function nextRetryOf(
  failedSince: Date,
  retryDays: readonly number[],
  attempts: AgendaInvoice['attempts'],
): Date | null {
  const last = lastAttemptAt(attempts);
  return retryTimesOf(failedSince, retryDays).find((at) => at.getTime() > last) ?? null;
}

/**
 * The retry the job makes at `now`: the latest one due that was not made. A job that ran late
 * makes one charge for every retry it missed, not one each.
 */
export function dueRetryOf(
  failedSince: Date,
  retryDays: readonly number[],
  attempts: AgendaInvoice['attempts'],
  now: Date,
): Date | null {
  const last = lastAttemptAt(attempts);
  const due = retryTimesOf(failedSince, retryDays).filter(
    (at) => at.getTime() > last && at.getTime() <= now.getTime(),
  );
  return due.at(-1) ?? null;
}

/** How many charges in a row at the end of the attempts had an unknown outcome. */
function unknownStreakOf(attempts: AgendaInvoice['attempts']): number {
  let streak = 0;
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    if (attempts[index]?.outcome !== 'unknown') {
      break;
    }
    streak += 1;
  }
  return streak;
}

/**
 * When the gateway is asked again about an undecided invoice (`open`): 15 minutes after the last
 * unknown outcome, doubling with each one up to 6 hours. An invoice whose charge was never
 * recorded (the API stopped while waiting) is asked about 15 minutes after it was made.
 */
export function settleAtOf(invoice: AgendaInvoice): Date {
  const last = invoice.attempts.at(-1);
  if (last === undefined) {
    return new Date(invoice.createdAt.getTime() + SETTLE_FIRST_MS);
  }
  const streak = Math.max(1, unknownStreakOf(invoice.attempts));
  const wait = Math.min(SETTLE_FIRST_MS * 2 ** (streak - 1), SETTLE_MAX_MS);
  return new Date(last.at.getTime() + wait);
}

/**
 * When an unpaid period turns read-only: the grace from the first failure, or from the end of the
 * period when no charge failed (`subscriptionStatusOf`).
 */
export function graceEndOf(
  facts: Pick<SubscriptionFacts, 'trialEndsAt' | 'periodEnd' | 'failedSince'>,
  policy: Pick<BillingPolicy, 'graceDays'>,
): Date {
  const since = facts.failedSince ?? currentEndOf(facts);
  return new Date(since.getTime() + policy.graceDays * DAY_MS);
}

/**
 * Everything the job will do for the subscription, with its time; some may be due already.
 *
 * - A trial: the reminder `trialReminderDays` before its end, then its end: charging the card saved
 *   while it ran, or the read-only notice without one (a card saved after it is not charged).
 * - A paid period: "Sắp hết hạn" `expiringSoonDays` before its end when the card cannot pay then,
 *   and the renewal at its end.
 * - After "Hủy gói": only the read-only notice at the end.
 * - An unpaid period: the retries of a failed charge, asking the gateway again about an unknown
 *   outcome, and the read-only notice when the grace ends.
 * - Renewed by bank transfer (T4): the next period's invoice `transferLeadDays` before the end,
 *   instead of the trial's reminder and "Sắp hết hạn" (its email replaces them), and the end,
 *   which waits for the transfer, or starts the period paid before it. Getting the gateway's
 *   details for that invoice again while it lacks them.
 */
export function billingAgendaOf(input: AgendaInput): AgendaItem[] {
  const { facts, policy, due } = input;
  const end = currentEndOf(facts);
  const items: AgendaItem[] = [];
  const at = (kind: AgendaKind, time: Date) => items.push({ kind, at: time });

  if (facts.cancelAtPeriodEnd) {
    at('read_only_notice', end);
  } else if (!paymentUnderWay(facts)) {
    const byCard = facts.renewalMethod === 'card' && facts.prepaid === null;
    // The next period's invoice made before the end, waiting or paid (T4).
    const early = facts.renewalInvoiceId !== null || facts.prepaid !== null;
    // A trial whose transfer was chosen before it ended waits for it, its invoice made late or not.
    const awaited = trialEndAwaitsTransfer(facts);
    if (facts.renewalMethod === 'transfer' && !early) {
      items.push({
        kind: 'transfer_invoice',
        at: transferInvoiceAtOf(facts, policy),
        ...(facts.trialEndsAt === null || awaited ? {} : { until: end }),
      });
    }
    if (facts.trialEndsAt !== null) {
      if (byCard) {
        at('trial_reminder', new Date(end.getTime() - policy.trialReminderDays * DAY_MS));
      }
      // Without a card, an invoice made before it or a transfer chosen in time, the trial's end is
      // read-only at once.
      at(trialEndCharges(facts) || early || awaited ? 'trial_end' : 'read_only_notice', end);
    } else {
      if (byCard && renewalBlockerOf(facts.paymentMethod, end) !== null) {
        at('expiring_notice', new Date(end.getTime() - policy.expiringSoonDays * DAY_MS));
      }
      at('renewal', end);
    }
  }
  if (input.transferDetailsLacking != null) {
    at('transfer_invoice', input.transferDetailsLacking);
  }
  if (paymentUnderWay(facts)) {
    at('read_only_notice', graceEndOf(facts, policy));
    if (facts.failedSince !== null && due?.status === 'failed') {
      const retry = nextRetryOf(facts.failedSince, policy.retryDays, due.attempts);
      if (retry !== null) {
        at('retry', retry);
      }
    }
    if (due?.status === 'open') {
      at('settle', settleAtOf(due));
    }
  }
  for (const invoice of input.undecided) {
    at('settle', settleAtOf(invoice));
  }
  return items;
}

/**
 * `now` when work still owed is past its time (`OUTSTANDING_KINDS`), so a write that finds it
 * wakes the job at once; null otherwise.
 */
export function outstandingAt(items: readonly AgendaItem[], now: Date): Date | null {
  const time = now.getTime();
  const owed = items.some(
    (item) =>
      OUTSTANDING_KINDS.includes(item.kind) &&
      item.at.getTime() <= time &&
      (item.until === undefined || time < item.until.getTime()),
  );
  return owed ? now : null;
}

/** The earliest time after `now` the job has something to do; null when it has nothing. */
export function nextActionAfter(items: readonly AgendaItem[], now: Date): Date | null {
  let next: number | null = null;
  for (const item of items) {
    const time = item.at.getTime();
    if (time > now.getTime() && (next === null || time < next)) {
      next = time;
    }
  }
  return next === null ? null : new Date(next);
}
