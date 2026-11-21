import type { SubscriptionFacts } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import {
  type AgendaInvoice,
  billingAgendaOf,
  dueRetryOf,
  graceEndOf,
  nextActionAfter,
  nextRetryOf,
  retryTimesOf,
  settleAtOf,
} from './billing-agenda.js';

const DAY = 86_400_000;
const MINUTE = 60_000;
const START = new Date('2026-11-01T03:00:00.000Z');
const at = (days: number, ms = 0) => new Date(START.getTime() + days * DAY + ms);

/** The temporary numbers of ADR-035 (T1, T3). */
const POLICY = { graceDays: 7, expiringSoonDays: 7, trialReminderDays: 3, retryDays: [2, 5] };
const CARD = { token: 'tok_1', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 };

type Facts = Parameters<typeof billingAgendaOf>[0]['facts'];

/** A paid month from START, renewing with a card valid long after. */
const paid: Facts = {
  trialEndsAt: null,
  periodEnd: at(30),
  cancelAtPeriodEnd: false,
  openInvoiceId: null,
  failedSince: null,
  paymentMethod: CARD,
};
const trial: Facts = { ...paid, trialEndsAt: at(14), periodEnd: at(14), paymentMethod: null };

function invoice(overrides: Partial<AgendaInvoice> = {}): AgendaInvoice {
  return { status: 'failed', createdAt: at(30), attempts: [], ...overrides };
}

function agenda(facts: Facts, due: AgendaInvoice | null = null, undecided: AgendaInvoice[] = []) {
  return billingAgendaOf({ facts, policy: POLICY, due, undecided }).map((item) => [
    item.kind,
    item.at,
  ]);
}

describe('the billing job’s timeline (ADR-035, T3)', () => {
  it('reminds of a trial 3 days before it ends, then ends it', () => {
    expect(agenda(trial)).toEqual([
      ['trial_reminder', at(11)],
      ['trial_end', at(14)],
      ['read_only_notice', at(14)],
    ]);
  });

  it('renews a paid period at its end, telling first when the card cannot pay then', () => {
    expect(agenda(paid)).toEqual([['renewal', at(30)]]);
    expect(agenda({ ...paid, paymentMethod: null })).toEqual([
      ['expiring_notice', at(23)],
      ['renewal', at(30)],
    ]);
    // The card works through the last day of its month: November 2026 ends before at(30).
    const expiring = { ...CARD, expMonth: 11, expYear: 2026 };
    expect(agenda({ ...paid, paymentMethod: expiring })).toEqual([
      ['expiring_notice', at(23)],
      ['renewal', at(30)],
    ]);
  });

  it('only tells of read-only at the end after "Hủy gói", in a trial or a paid period', () => {
    expect(agenda({ ...paid, cancelAtPeriodEnd: true })).toEqual([['read_only_notice', at(30)]]);
    expect(agenda({ ...trial, cancelAtPeriodEnd: true })).toEqual([['read_only_notice', at(14)]]);
  });

  it('retries a refused renewal on the next retry day, and turns read-only after the grace', () => {
    const failed = { ...paid, openInvoiceId: 'inv', failedSince: at(30) };
    const first = invoice({ attempts: [{ at: at(30), outcome: 'failed' }] });
    expect(agenda(failed, first)).toEqual([
      ['read_only_notice', at(37)],
      ['retry', at(32)],
    ]);
    const second = invoice({
      attempts: [
        { at: at(30), outcome: 'failed' },
        { at: at(32, MINUTE), outcome: 'failed' },
      ],
    });
    expect(agenda(failed, second)).toEqual([
      ['read_only_notice', at(37)],
      ['retry', at(35)],
    ]);
    const last = invoice({
      attempts: [...second.attempts, { at: at(35, MINUTE), outcome: 'failed' }],
    });
    expect(agenda(failed, last)).toEqual([['read_only_notice', at(37)]]);
  });

  it('waits for a transfer without retrying the card, the grace from the end', () => {
    const waiting = { ...paid, openInvoiceId: 'inv' };
    expect(agenda(waiting, invoice({ status: 'pending' }))).toEqual([['read_only_notice', at(37)]]);
  });

  it('asks the gateway again about undecided charges, its own and older ones', () => {
    const asked = { at: at(30, 5_000), outcome: 'unknown' as const };
    const waiting = { ...paid, openInvoiceId: 'inv' };
    const upgrade = invoice({ status: 'open', attempts: [{ at: at(10), outcome: 'unknown' }] });
    expect(agenda(waiting, invoice({ status: 'open', attempts: [asked] }), [upgrade])).toEqual([
      ['read_only_notice', at(37)],
      ['settle', at(30, 5_000 + 15 * MINUTE)],
      ['settle', at(10, 15 * MINUTE)],
    ]);
  });
});

describe('retries', () => {
  const failedSince = at(30);

  it('fall 2 and 5 days after the first refusal', () => {
    expect(retryTimesOf(failedSince, [2, 5])).toEqual([at(32), at(35)]);
  });

  it('are made once a charge came at or after their time, whoever made it', () => {
    const first = [{ at: at(30), outcome: 'failed' as const }];
    expect(nextRetryOf(failedSince, [2, 5], first)).toEqual(at(32));
    // The owner paid again on day 3: the retry of day 2 is made, the one of day 5 is not.
    const owner = [...first, { at: at(33), outcome: 'failed' as const }];
    expect(nextRetryOf(failedSince, [2, 5], owner)).toEqual(at(35));
    expect(nextRetryOf(failedSince, [2, 5], [...owner, { at: at(35), outcome: 'failed' }])).toBe(
      null,
    );
  });

  it('due now are the latest one missed: a late job charges once, not once for each', () => {
    const first = [{ at: at(30), outcome: 'failed' as const }];
    expect(dueRetryOf(failedSince, [2, 5], first, at(31))).toBeNull();
    expect(dueRetryOf(failedSince, [2, 5], first, at(32))).toEqual(at(32));
    expect(dueRetryOf(failedSince, [2, 5], first, at(36))).toEqual(at(35));
    const made = [...first, { at: at(36), outcome: 'failed' as const }];
    expect(dueRetryOf(failedSince, [2, 5], made, at(40))).toBeNull();
  });
});

describe('asking the gateway again about an unknown outcome', () => {
  it('waits 15 minutes, doubling with each unknown answer up to 6 hours', () => {
    const unknown = (minutes: number) => ({
      at: at(30, minutes * MINUTE),
      outcome: 'unknown' as const,
    });
    expect(settleAtOf(invoice({ status: 'open', attempts: [unknown(0)] }))).toEqual(
      at(30, 15 * MINUTE),
    );
    expect(settleAtOf(invoice({ status: 'open', attempts: [unknown(0), unknown(15)] }))).toEqual(
      at(30, 45 * MINUTE),
    );
    const many = Array.from({ length: 12 }, (_, index) => unknown(index));
    expect(settleAtOf(invoice({ status: 'open', attempts: many }))).toEqual(
      at(30, 11 * MINUTE + 6 * 60 * MINUTE),
    );
  });

  it('asks about a charge the API never recorded 15 minutes after its invoice was made', () => {
    expect(settleAtOf(invoice({ status: 'open', createdAt: at(10) }))).toEqual(at(10, 15 * MINUTE));
  });
});

describe('the grace', () => {
  it('counts from the first refusal, or from the end when no charge failed', () => {
    const facts: Pick<SubscriptionFacts, 'trialEndsAt' | 'periodEnd' | 'failedSince'> = {
      trialEndsAt: null,
      periodEnd: at(30),
      failedSince: null,
    };
    expect(graceEndOf(facts, POLICY)).toEqual(at(37));
    expect(graceEndOf({ ...facts, failedSince: at(31) }, POLICY)).toEqual(at(38));
    expect(graceEndOf({ ...facts, trialEndsAt: at(14) }, POLICY)).toEqual(at(21));
  });
});

describe('nextActionAfter', () => {
  it('is the earliest time to come, never one already due', () => {
    const items = [
      { kind: 'renewal' as const, at: at(30) },
      { kind: 'expiring_notice' as const, at: at(23) },
    ];
    expect(nextActionAfter(items, at(1))).toEqual(at(23));
    expect(nextActionAfter(items, at(23))).toEqual(at(30));
    expect(nextActionAfter(items, at(30))).toBeNull();
    expect(nextActionAfter([], at(1))).toBeNull();
  });
});
