import type { DueInvoice, SubscriptionRenewal } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { canCancelPlan, canDropSchedule, periodLine, planBanner } from './plan-presentation';
import {
  pendingRenewalInvoice,
  renewalInvoiceTitle,
  renewalMethodStatus,
  renewalTransferNotice,
  replacedInvoiceNote,
  voidedInvoiceNotice,
} from './renewal-presentation';
import { invoiceSummaryFixture, summaryFixture } from './test-fixtures';

const AT = '2026-12-04T03:00:00.000Z';

function invoice(overrides: Partial<DueInvoice> = {}): DueInvoice {
  const { card: _card, ...summary } = invoiceSummaryFixture({
    status: 'pending',
    method: 'transfer',
    paidAt: null,
    payable: true,
    lastAttempt: null,
    amount: 599_000,
    periodStart: AT,
    periodEnd: '2027-01-03T03:00:00.000Z',
    planId: 'agency',
    planName: 'Agency',
  });
  return { ...summary, item: null, ...overrides };
}

function renewal(overrides: Partial<SubscriptionRenewal> = {}): SubscriptionRenewal {
  return {
    at: AT,
    planId: 'agency',
    planName: 'Agency',
    cycle: 'monthly',
    amount: 599_000,
    autoRenews: false,
    blocker: null,
    method: 'transfer',
    invoiceAt: '2026-11-27T03:00:00.000Z',
    invoice: null,
    paid: false,
    ...overrides,
  };
}

const active = (overrides: Parameters<typeof summaryFixture>[0] = {}) =>
  summaryFixture({
    state: 'active',
    renewalMethod: 'transfer',
    periodStart: '2026-11-04T03:00:00.000Z',
    periodEnd: AT,
    trialEndsAt: null,
    trialDaysLeft: null,
    ...overrides,
  });

describe('renewalTransferNotice (T4)', () => {
  it('has nothing for a card renewal or a transfer whose invoice is not made yet', () => {
    expect(renewalTransferNotice(active({ renewalMethod: 'card' }))).toBeNull();
    expect(renewalTransferNotice(active({ renewal: renewal() }))).toBeNull();
  });

  it('reads the early invoice that waits before the period ends, with the card fallback', () => {
    const due = invoice();
    expect(renewalTransferNotice(active({ renewal: renewal({ invoice: due }) }))).toEqual({
      kind: 'issued',
      invoice: due,
      dueAt: AT,
      cardFallback: false,
    });
    expect(
      renewalTransferNotice(
        active({ renewalMethod: 'card', renewal: renewal({ invoice: due, method: 'card' }) }),
      ),
    ).toMatchObject({ kind: 'issued', cardFallback: true });
  });

  it('reads a paid next period, and the wait inside the grace', () => {
    const paid = invoice({ status: 'paid' });
    expect(
      renewalTransferNotice(active({ renewal: renewal({ invoice: paid, paid: true }) })),
    ).toMatchObject({ kind: 'paid', startsAt: AT });
    const due = invoice();
    expect(
      renewalTransferNotice(
        active({
          state: 'pending_payment',
          awaitingTransfer: true,
          dueInvoice: due,
          graceEndsAt: '2026-12-11T03:00:00.000Z',
        }),
      ),
    ).toEqual({
      kind: 'awaiting',
      invoice: due,
      deadline: '2026-12-11T03:00:00.000Z',
      readOnly: false,
    });
  });
});

describe('the words of a transfer renewal (T4)', () => {
  it('titles the early invoice with its number, amount and due day', () => {
    expect(renewalInvoiceTitle(invoice(), AT)).toBe(
      'Hóa đơn gia hạn HD-2026-000001 · 599.000 ₫ · chuyển khoản trước 04/12/2026',
    );
  });

  it('says when the invoice is sent, waits, or the period is paid', () => {
    expect(renewalMethodStatus(null)).toBeNull();
    expect(renewalMethodStatus(renewal())).toBe(
      'Hóa đơn kỳ sau (599.000 ₫) được gửi 27/11/2026, hạn chuyển khoản 04/12/2026.',
    );
    expect(renewalMethodStatus(renewal({ invoice: invoice() }))).toBe(
      'Hóa đơn HD-2026-000001 đã gửi, chuyển khoản trước 04/12/2026.',
    );
    expect(renewalMethodStatus(renewal({ invoice: invoice(), method: 'card' }))).toContain(
      'hệ thống trừ thẻ đã lưu cho hóa đơn này',
    );
    expect(renewalMethodStatus(renewal({ paid: true, invoice: invoice({ status: 'paid' }) }))).toBe(
      'Kỳ sau (Gói Agency) đã thanh toán, bắt đầu 04/12/2026.',
    );
  });

  it('warns that voided transfer details stop working, with or without a new invoice', () => {
    const voided = { invoiceId: 'a', invoiceNumber: 'HD-2026-000001' };
    expect(voidedInvoiceNotice(voided, true)).toBe(
      'Thông tin chuyển khoản của hóa đơn HD-2026-000001 không còn dùng được; hóa đơn mới sẽ được gửi.',
    );
    expect(voidedInvoiceNotice(voided, false)).toContain('Đừng chuyển khoản cho hóa đơn đó.');
  });

  it('finds the invoice a change would void, and says what replaced it afterwards', () => {
    const old = invoice({ id: 'old', number: 'HD-1' });
    const next = invoice({ id: 'new', number: 'HD-2' });
    const before = { renewal: renewal({ invoice: old }) };
    expect(pendingRenewalInvoice(before)).toEqual({ invoiceId: 'old', invoiceNumber: 'HD-1' });
    expect(pendingRenewalInvoice({ renewal: renewal({ invoice: old, paid: true }) })).toBeNull();
    expect(replacedInvoiceNote(before, { renewal: renewal({ invoice: next }) })).toBe(
      ' Hóa đơn HD-1 không còn dùng được; hóa đơn chuyển khoản mới HD-2 đã được gửi.',
    );
    expect(replacedInvoiceNote(before, { renewal: null })).toContain('HD-1 không còn dùng được');
    expect(replacedInvoiceNote(null, { renewal: renewal({ invoice: next }) })).toBe(
      ' Hóa đơn chuyển khoản HD-2 đã được gửi.',
    );
    expect(replacedInvoiceNote(before, before)).toBe('');
  });
});

describe('plan card and banner of a transfer renewal (T4)', () => {
  it('says the method on the renewal line, and a paid next period', () => {
    expect(periodLine(active({ renewal: renewal() }))).toBe(
      'Kỳ hiện tại 04/11/2026 – 04/12/2026 · gia hạn 04/12/2026 · chuyển khoản 599.000 ₫, hóa đơn gửi 27/11/2026',
    );
    expect(periodLine(active({ renewal: renewal({ invoice: invoice() }) }))).toContain(
      'hóa đơn HD-2026-000001 đã gửi',
    );
    expect(periodLine(active({ renewal: renewal({ paid: true, invoice: invoice() }) }))).toContain(
      'kỳ sau đã thanh toán, bắt đầu 04/12/2026',
    );
  });

  it('banners the early invoice with a way to its bank details, and a trial in the same words', () => {
    const banner = planBanner(active({ renewal: renewal({ invoice: invoice() }) }));
    expect(banner?.title).toBe(
      'Hóa đơn gia hạn HD-2026-000001 · 599.000 ₫ · chuyển khoản trước 04/12/2026',
    );
    expect(banner?.action).toBe('view_transfer');
    expect(banner?.body).toContain('không mất ngày nào');
    const trial = planBanner(
      summaryFixture({ renewalMethod: 'transfer', renewal: renewal({ invoice: invoice() }) }),
    );
    expect(trial?.action).toBe('view_transfer');
    expect(trial?.body).toContain('Dùng thử hết 04/12/2026.');
  });

  it('does not say a transfer trial is charged to the card', () => {
    const none = planBanner(summaryFixture({ renewalMethod: 'transfer', renewal: renewal() }));
    expect(none?.body).toContain('Hóa đơn 599.000 ₫ cho Gói Agency được gửi 27/11/2026');
    expect(none?.body).not.toContain('thẻ');
  });

  it('says "Chờ chuyển khoản" with the deadline in the grace, and read-only after it', () => {
    const waiting = {
      state: 'pending_payment' as const,
      awaitingTransfer: true,
      dueInvoice: invoice(),
      graceEndsAt: '2026-12-11T03:00:00.000Z',
    };
    const grace = planBanner(active(waiting));
    expect(grace).toMatchObject({
      title: 'Chờ chuyển khoản.',
      action: 'view_transfer',
      tone: 'warning',
    });
    expect(grace?.body).toContain('Chuyển khoản trước 11/12/2026');
    expect(grace?.body).not.toContain('thử lại');
    const readOnly = planBanner(active({ ...waiting, access: 'read_only' }));
    expect(readOnly).toMatchObject({ role: 'alert', tone: 'danger' });
    expect(readOnly?.body).toContain('Workspace mở lại khi nhận được chuyển khoản');
  });

  it('hides "Hủy gói" and "Hủy thay đổi" while the next period is paid', () => {
    const paid = active({ renewal: renewal({ paid: true, invoice: invoice() }) });
    expect(canCancelPlan(paid)).toBe(false);
    expect(canDropSchedule(paid)).toBe(false);
    expect(canCancelPlan(active({ renewal: renewal() }))).toBe(true);
  });
});
