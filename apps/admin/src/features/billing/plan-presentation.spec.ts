import { describe, expect, it } from 'vitest';
import {
  canCancelPlan,
  canDropSchedule,
  comparisonRows,
  dueWaiting,
  graceNotice,
  periodLine,
  planBanner,
  planImpacts,
  priceLabel,
  quoteImpacts,
  readOnlyReason,
  scheduledChangeLine,
  shownState,
  stateChip,
  usageMeters,
} from './plan-presentation';
import {
  agency,
  basic,
  business,
  catalog,
  invoiceSummaryFixture,
  summaryFixture,
} from './test-fixtures';

describe('priceLabel', () => {
  it('writes the price with its cycle', () => {
    expect(priceLabel(agency, 'monthly')).toBe('599.000 ₫ / tháng');
    expect(priceLabel(agency, 'yearly')).toBe('5.990.000 ₫ / năm');
  });
});

describe('stateChip', () => {
  it('counts the days left of a trial', () => {
    expect(stateChip('trialing', 9)).toEqual({ label: 'Dùng thử · còn 9 ngày', tone: 'primary' });
  });

  it('names every other state of the subscription', () => {
    expect(stateChip('active', null).label).toBe('Đang hoạt động');
    expect(stateChip('expiring_soon', null)).toEqual({ label: 'Sắp hết hạn', tone: 'warning' });
    expect(stateChip('past_due', null)).toEqual({ label: 'Quá hạn', tone: 'danger' });
    expect(stateChip('pending_payment', null).label).toBe('Chờ thanh toán');
    expect(stateChip('cancel_scheduled', null).label).toBe('Đã lên lịch hủy');
    expect(stateChip('canceled', null)).toEqual({ label: 'Đã hủy', tone: 'neutral' });
    expect(stateChip('trial_expired', null)).toEqual({ label: 'Hết dùng thử', tone: 'danger' });
  });
});

describe('planBanner', () => {
  it('has none for an active plan', () => {
    expect(planBanner(summaryFixture({ state: 'active' }))).toBeNull();
  });

  it('tells a trial when it ends, and what happens then', () => {
    const banner = planBanner(summaryFixture());
    expect(banner?.title).toBe('Bạn đang dùng thử Gói Agency.');
    expect(banner?.body).toContain('Hết hạn 04/12/2026');
    expect(banner?.action).toBeNull();
    const charged = planBanner(
      summaryFixture({
        renewal: {
          at: '2026-12-04T03:00:00.000Z',
          planId: 'agency',
          planName: 'Agency',
          cycle: 'monthly',
          amount: 599_000,
          method: 'card' as const,
          invoiceAt: null,
          invoice: null,
          paid: false,
          autoRenews: true,
          blocker: null,
        },
      }),
    );
    expect(charged?.body).toContain('tự thanh toán 599.000 ₫ cho Gói Agency');
  });

  it('asks a trial without a card for one, and one whose card expires for another', () => {
    const renewal = {
      at: '2026-12-04T03:00:00.000Z',
      planId: 'agency' as const,
      planName: 'Agency',
      cycle: 'monthly' as const,
      amount: 599_000,
      method: 'card' as const,
      invoiceAt: null,
      invoice: null,
      paid: false,
      autoRenews: false,
    };
    expect(
      planBanner(summaryFixture({ renewal: { ...renewal, blocker: 'no_payment_method' } }))?.action,
    ).toBe('add_method');
    expect(
      planBanner(summaryFixture({ renewal: { ...renewal, blocker: 'card_expires' } }))?.action,
    ).toBe('update_card');
  });

  it('offers to keep a plan whose stop is scheduled, in a trial as in a paid period', () => {
    const trial = planBanner(summaryFixture({ cancelAt: '2026-12-04T03:00:00.000Z' }));
    expect(trial?.title).toBe('Gói sẽ dừng vào 04/12/2026.');
    expect(trial?.action).toBe('keep');
    // The trial stops at an instant of that day, not at its end.
    expect(trial?.body).toContain('tới ngày đó');
    expect(trial?.body).not.toContain('hết ngày');
    const paid = planBanner(
      summaryFixture({ state: 'cancel_scheduled', cancelAt: '2026-12-04T03:00:00.000Z' }),
    );
    expect(paid?.action).toBe('keep');
    expect(paid?.body).toContain('giữ lại gói');
  });

  it('names the invoice, the reason and the retry date of a failed renewal', () => {
    const due = {
      ...invoiceSummaryFixture({
        status: 'failed',
        paidAt: null,
        payable: true,
        periodStart: '2026-11-30T17:00:00.000Z',
        lastAttempt: {
          number: 1,
          at: '2026-12-01T03:00:00.000Z',
          outcome: 'failed',
          code: 'insufficient_funds',
        },
      }),
    };
    const { card: _card, ...dueInvoice } = due;
    const base = {
      state: 'past_due' as const,
      graceEndsAt: '2026-12-08T03:00:00.000Z',
      dueInvoice,
    };
    const retry = planBanner(summaryFixture({ ...base, nextRetryAt: '2026-12-03T03:00:00.000Z' }));
    expect(retry?.title).toBe('Thanh toán kỳ 01/12 chưa thành công.');
    expect(retry?.body).toContain('Hóa đơn HD-2026-000001 · 1.490.000 ₫.');
    expect(retry?.body).toContain('Thẻ không đủ hạn mức.');
    expect(retry?.body).toContain('Hệ thống tự thử lại ngày 03/12.');
    expect(retry?.body).toContain('chuyển sang chỉ đọc từ 08/12/2026');
    expect(retry?.action).toBe('pay_invoice');
    const spent = planBanner(summaryFixture({ ...base, nextRetryAt: null }));
    expect(spent?.body).toContain('Hệ thống đã hết lượt tự thử lại.');
  });

  it('says a period whose invoice the job has not made yet is being paid, with nothing to do', () => {
    for (const trialEndsAt of [null, '2026-12-04T03:00:00.000Z']) {
      const banner = planBanner(
        summaryFixture({ state: 'past_due', trialEndsAt, graceEndsAt: '2026-12-11T03:00:00.000Z' }),
      );
      expect(banner).toMatchObject({
        role: 'status',
        tone: 'info',
        title: 'Đang thanh toán kỳ mới.',
        action: null,
      });
      expect(banner?.body).toContain('chuyển sang chỉ đọc từ 11/12/2026');
    }
  });

  it('waits for the gateway after a failure rather than saying it failed with no retry left', () => {
    const { card: _card, ...open } = invoiceSummaryFixture({
      status: 'open',
      paidAt: null,
      payable: true,
      lastAttempt: { number: 2, at: '2026-12-03T03:00:00.000Z', outcome: 'unknown', code: null },
    });
    const banner = planBanner(
      summaryFixture({
        state: 'past_due',
        dueInvoice: open,
        nextRetryAt: null,
        graceEndsAt: '2026-12-08T03:00:00.000Z',
      }),
    );
    expect(banner?.title).toBe('Đang chờ xác nhận thanh toán.');
    expect(banner?.body).toContain('Cổng thanh toán chưa trả lời.');
    expect(banner?.body).not.toContain('hết lượt tự thử lại');
    expect(banner?.action).toBe('view_invoice');
  });

  it('shows a transfer paying for a plan now during the trial, which runs on meanwhile', () => {
    const { card: _card, ...transfer } = invoiceSummaryFixture({
      status: 'pending',
      method: 'transfer',
      paidAt: null,
      payable: true,
    });
    const renewal = {
      at: '2026-12-04T03:00:00.000Z',
      planId: 'agency' as const,
      planName: 'Agency',
      cycle: 'monthly' as const,
      amount: 599_000,
      method: 'card' as const,
      invoiceAt: null,
      invoice: null,
      paid: false,
      autoRenews: true,
      blocker: null,
    };
    const banner = planBanner(summaryFixture({ dueInvoice: transfer, renewal }));
    expect(banner?.title).toBe('Đang chờ xác nhận chuyển khoản.');
    expect(banner?.body).toContain('Bạn dùng thử bình thường tới 04/12/2026.');
    expect(banner?.action).toBe('view_invoice');
  });

  it('waits for a transfer, or for the gateway, and leads to the invoice', () => {
    const { card: _card, ...transfer } = invoiceSummaryFixture({
      status: 'pending',
      method: 'transfer',
      paidAt: null,
      payable: true,
    });
    const banner = planBanner(
      summaryFixture({ state: 'pending_payment', dueInvoice: transfer, graceEndsAt: null }),
    );
    expect(banner?.title).toBe('Đang chờ xác nhận chuyển khoản.');
    expect(banner?.body).toContain('Hóa đơn HD-2026-000001 · 1.490.000 ₫.');
    expect(banner?.action).toBe('view_invoice');
    const open = planBanner(
      summaryFixture({
        state: 'pending_payment',
        dueInvoice: { ...transfer, status: 'open', method: 'card' },
      }),
    );
    expect(open?.title).toBe('Đang chờ xác nhận thanh toán.');
  });

  it('shows a transfer started after a failed charge as waiting, not as failed', () => {
    const { card: _card, ...transfer } = invoiceSummaryFixture({
      status: 'pending',
      method: 'transfer',
      paidAt: null,
      payable: true,
    });
    const banner = planBanner(
      summaryFixture({
        state: 'past_due',
        dueInvoice: transfer,
        graceEndsAt: '2026-12-08T03:00:00.000Z',
      }),
    );
    expect(banner?.title).toBe('Đang chờ xác nhận chuyển khoản.');
    expect(banner?.body).toContain('chuyển sang chỉ đọc từ 08/12/2026');
    expect(banner?.action).toBe('view_invoice');
  });

  it('offers a stopped plan a new one', () => {
    const banner = planBanner(
      summaryFixture({
        state: 'canceled',
        access: 'read_only',
        cancelAt: '2026-12-04T03:00:00.000Z',
      }),
    );
    expect(banner?.title).toBe('Gói đã hủy từ 04/12/2026.');
    expect(banner?.action).toBe('choose_plan');
  });

  it('alerts when a state stops work, and says live pages keep running', () => {
    for (const state of ['trial_expired', 'canceled'] as const) {
      const banner = planBanner(summaryFixture({ state, access: 'read_only' }));
      expect(banner?.role).toBe('alert');
      expect(banner?.body).toContain('chỉ đọc');
      expect(banner?.body).toContain('Trang live và form vẫn chạy');
    }
  });

  it('says when an unpaid workspace turns read-only, then that it is', () => {
    const grace = planBanner(
      summaryFixture({
        state: 'past_due',
        graceEndsAt: '2026-12-10T03:00:00.000Z',
      }),
    );
    expect(grace?.body).toContain('chuyển sang chỉ đọc từ 10/12/2026');
    const over = planBanner(
      summaryFixture({
        state: 'past_due',
        access: 'read_only',
        graceEndsAt: '2026-12-10T03:00:00.000Z',
      }),
    );
    expect(over?.body).toContain('đang ở chế độ chỉ đọc');
  });

  it('warns before a plan that cannot renew ends, and when a stop is scheduled', () => {
    expect(planBanner(summaryFixture({ state: 'expiring_soon' }))?.title).toBe(
      'Gói hết hạn ngày 04/12/2026.',
    );
    expect(planBanner(summaryFixture({ state: 'cancel_scheduled' }))?.title).toBe(
      'Gói sẽ dừng vào 04/12/2026.',
    );
    expect(planBanner(summaryFixture({ state: 'pending_payment' }))?.role).toBe('status');
  });
});

describe('periodLine', () => {
  it('gives a trial its dates, and a stopped plan the day it stopped', () => {
    expect(periodLine(summaryFixture())).toBe('Dùng thử từ 20/11/2026 tới 04/12/2026');
    expect(periodLine(summaryFixture({ state: 'canceled' }))).toBe('Đã dừng từ 04/12/2026');
  });

  it('says a scheduled cancel does not renew', () => {
    expect(
      periodLine(
        summaryFixture({
          state: 'cancel_scheduled',
          cancelAt: '2026-12-04T03:00:00.000Z',
        }),
      ),
    ).toBe('Kỳ hiện tại 20/11/2026 – 04/12/2026 · không gia hạn');
  });

  it('says when a period renews by itself, and when it cannot', () => {
    const renewal = {
      at: '2026-12-04T03:00:00.000Z',
      planId: 'agency' as const,
      planName: 'Agency',
      cycle: 'monthly' as const,
      amount: 599_000,
      method: 'card' as const,
      invoiceAt: null,
      invoice: null,
      paid: false,
    };
    const active = { state: 'active' as const };
    expect(
      periodLine(
        summaryFixture({ ...active, renewal: { ...renewal, autoRenews: true, blocker: null } }),
      ),
    ).toBe('Kỳ hiện tại 20/11/2026 – 04/12/2026 · gia hạn tự động 04/12/2026');
    expect(
      periodLine(
        summaryFixture({
          ...active,
          renewal: { ...renewal, autoRenews: false, blocker: 'no_payment_method' },
        }),
      ),
    ).toBe('Kỳ hiện tại 20/11/2026 – 04/12/2026 · chưa thể gia hạn tự động');
    expect(
      periodLine(summaryFixture({ renewal: { ...renewal, autoRenews: true, blocker: null } })),
    ).toBe('Dùng thử từ 20/11/2026 tới 04/12/2026 · tự thanh toán 599.000 ₫ ngày 04/12/2026');
  });
});

describe('the state shown', () => {
  it('reads a failed period whose payment waits for its answer as waiting', () => {
    expect(shownState('past_due', true)).toBe('pending_payment');
    expect(shownState('past_due', false)).toBe('past_due');
    expect(shownState('active', true)).toBe('active');
    expect(stateChip(shownState('past_due', true), null).label).toBe('Chờ thanh toán');
  });

  it('waits for a transfer or a gateway that has not answered, never for a refused charge', () => {
    expect(dueWaiting({ status: 'pending' })).toBe(true);
    expect(dueWaiting({ status: 'open' })).toBe(true);
    expect(dueWaiting({ status: 'failed' })).toBe(false);
    expect(dueWaiting(null)).toBe(false);
  });
});

describe('canDropSchedule', () => {
  it('is only while the period is paid: an unpaid renewal already charges the schedule', () => {
    for (const state of ['active', 'expiring_soon', 'cancel_scheduled'] as const) {
      expect(canDropSchedule({ state })).toBe(true);
    }
    for (const state of ['past_due', 'pending_payment', 'canceled'] as const) {
      expect(canDropSchedule({ state })).toBe(false);
    }
  });
});

describe('canCancelPlan', () => {
  it('is for a plan that runs, until its stop is set', () => {
    for (const state of ['trialing', 'active', 'expiring_soon'] as const) {
      expect(canCancelPlan({ state, cancelAt: null })).toBe(true);
    }
    expect(canCancelPlan({ state: 'trialing', cancelAt: '2026-12-04T03:00:00.000Z' })).toBe(false);
    for (const state of [
      'past_due',
      'pending_payment',
      'trial_expired',
      'canceled',
      'cancel_scheduled',
    ] as const) {
      expect(canCancelPlan({ state, cancelAt: null })).toBe(false);
    }
  });
});

describe('scheduledChangeLine', () => {
  const PERIOD_END = '2026-12-01T03:00:00.000Z';

  it('says the plan, the cycle and the day', () => {
    expect(
      scheduledChangeLine(
        {
          scheduledChange: { planId: 'basic', cycle: 'yearly' },
          periodEnd: PERIOD_END,
          cancelAt: null,
        },
        'Cơ bản',
      ),
    ).toBe('Chuyển sang Gói Cơ bản · theo năm từ 01/12/2026');
    expect(
      scheduledChangeLine({ scheduledChange: null, periodEnd: PERIOD_END, cancelAt: null }, 'X'),
    ).toBeNull();
  });

  it('says it applies only if the plan is kept while "Hủy gói" stands', () => {
    expect(
      scheduledChangeLine(
        {
          scheduledChange: { planId: 'basic', cycle: 'monthly' },
          periodEnd: PERIOD_END,
          cancelAt: PERIOD_END,
        },
        'Cơ bản',
      ),
    ).toBe('Nếu giữ lại gói: chuyển sang Gói Cơ bản · theo tháng từ 01/12/2026');
  });
});

describe('graceNotice', () => {
  const plan = (
    state: 'past_due' | 'pending_payment' | 'active' | 'trial_expired',
    graceDaysLeft: number | null,
    paymentWaiting = false,
    awaitingTransfer = false,
  ) => ({ state, graceDaysLeft, paymentWaiting, awaitingTransfer });

  it('gives the days to read-only that the server counted', () => {
    expect(graceNotice(plan('past_due', 3))?.title).toBe(
      'Thanh toán lỗi — còn 3 ngày trước khi chỉ đọc',
    );
    expect(graceNotice(plan('pending_payment', 3))?.title).toBe(
      'Đang chờ xác nhận thanh toán — còn 3 ngày trước khi chỉ đọc',
    );
  });

  it('says a failed period whose transfer or charge waits for its answer is waiting', () => {
    const notice = graceNotice(plan('past_due', 7, true));
    expect(notice?.title).toBe('Đang chờ xác nhận thanh toán — còn 7 ngày trước khi chỉ đọc');
    expect(notice?.detail).not.toContain('Thanh toán lại');
  });

  it('says "Chờ chuyển khoản" for a renewal waiting for its transfer, not a failed payment (T4)', () => {
    const notice = graceNotice(plan('pending_payment', 5, false, true));
    expect(notice?.title).toBe('Chờ chuyển khoản — còn 5 ngày trước khi chỉ đọc');
    expect(notice?.detail).toContain('Chuyển khoản theo hóa đơn gia hạn');
    expect(notice?.detail).not.toContain('Thanh toán lại');
  });

  it('leaves the days out when there are none, and says nothing for other states', () => {
    expect(graceNotice(plan('past_due', null))?.title).toBe('Thanh toán lỗi');
    expect(graceNotice(plan('active', null))).toBeNull();
    expect(graceNotice(plan('trial_expired', null))).toBeNull();
  });
});

describe('quoteImpacts', () => {
  it('lists what the quote counted: the limits passed, automations paused, members kept', () => {
    const impacts = quoteImpacts(
      {
        overLimits: [
          { limit: 'sites', used: 4, max: 1 },
          { limit: 'members', used: 7, max: 3 },
        ],
        automationsToPause: 3,
        aiUses: { from: 300, to: 30 },
        members: 7,
      },
      agency,
      basic,
    );
    expect(impacts.map((impact) => impact.title)).toEqual([
      '4 site, vượt hạn mức Gói Cơ bản (1).',
      '7 thành viên, vượt hạn mức Gói Cơ bản (3).',
      '3 automation đang bật sẽ tạm dừng.',
      'AI còn 30 lượt mỗi tháng.',
      '7 thành viên giữ nguyên quyền.',
    ]);
  });
});

describe('usageMeters', () => {
  const usage = { sites: 4, members: 7, aiUses: 300, automationRuns: 1240, customDomains: 4 };

  it('measures each limit of the plan, in the order of the board', () => {
    const meters = usageMeters(agency, usage, '2026-12-01');
    expect(meters.map((meter) => meter.name)).toEqual([
      'Site',
      'Thành viên',
      'Lượt AI mỗi tháng',
      'Lượt automation mỗi tháng',
      'Tên miền riêng',
    ]);
    expect(meters[0]).toMatchObject({ text: '4 / 5', percent: 80, tone: 'near' });
    expect(meters[1]).toMatchObject({ text: '7 / 10', percent: 70, tone: 'normal' });
    expect(meters[3]?.text).toBe('1.240 / 5.000');
  });

  it('notes what each count includes, and when a monthly one comes back', () => {
    const meters = usageMeters(agency, { ...usage, sites: 1 }, '2026-12-01');
    expect(meters[1]?.note).toBe('Lời mời đang chờ cũng được tính');
    expect(meters[4]?.note).toBe('Tính trên mọi site');
    expect(meters[3]?.note).toBe('Làm mới 01/12');
    expect(meters[0]?.note).toBe('');
  });

  it('fills a meter at its limit', () => {
    const [sites, , ai] = usageMeters(agency, { ...usage, sites: 5, aiUses: 300 }, '2026-12-01');
    expect(sites).toMatchObject({ percent: 100, tone: 'full', note: 'Đã dùng hết hạn mức' });
    expect(ai).toMatchObject({ percent: 100, tone: 'full' });
    expect(ai?.note).toBe('Hết lượt. Làm mới 01/12');
  });

  it('says a count past the limit after a smaller plan is over it, not just at it', () => {
    const [sites, members, ai, , domains] = usageMeters(
      basic,
      { sites: 6, members: 9, aiUses: 45, automationRuns: 0, customDomains: 1 },
      '2026-12-01',
    );
    expect(sites).toMatchObject({
      text: '6 / 1',
      percent: 100,
      tone: 'over',
      note: 'Vượt hạn mức, không tạo thêm được',
      label: 'Site: vượt hạn mức, 6 trên 1',
    });
    expect(members?.tone).toBe('over');
    expect(ai?.note).toBe('Vượt hạn mức. Làm mới 01/12');
    // Exactly at the limit stays "used up".
    expect(domains).toMatchObject({ tone: 'full', note: 'Đã dùng hết hạn mức' });
  });

  it('says a plan without automation has no runs, instead of dividing by zero', () => {
    const runs = usageMeters(basic, { ...usage, automationRuns: 0 }, '2026-12-01')[3];
    expect(runs).toMatchObject({ percent: 0, tone: 'normal', note: 'Gói này chưa có automation' });
  });
});

describe('comparisonRows', () => {
  it('has a cell per plan, in catalog order, with Có and — for features', () => {
    const rows = comparisonRows(catalog.plans);
    expect(rows.find((row) => row.name === 'Site')?.cells).toEqual(['1', '5', '20']);
    expect(rows.find((row) => row.name === 'Automation')?.cells).toEqual(['—', 'Có', 'Có']);
    expect(rows.find((row) => row.name === 'Vai trò tùy chỉnh')?.cells).toEqual(['—', '—', 'Có']);
    expect(rows.find((row) => row.name === 'Lượt automation mỗi tháng')?.cells[0]).toBe('—');
  });
});

describe('planImpacts', () => {
  const usage = { sites: 4, members: 7, aiUses: 12, automationRuns: 0, customDomains: 4 };

  it('lists what goes over a limit and what stops when the plan gets smaller', () => {
    const titles = planImpacts(agency, basic, usage).map((impact) => impact.title);
    expect(titles).toEqual([
      '4 site, vượt hạn mức Gói Cơ bản (1).',
      '7 thành viên, vượt hạn mức Gói Cơ bản (3).',
      '4 tên miền riêng, vượt hạn mức Gói Cơ bản (1).',
      'Automation đang bật sẽ tạm dừng.',
      'AI còn 30 lượt mỗi tháng.',
    ]);
  });

  it('has nothing to warn about when the plan grows', () => {
    expect(planImpacts(agency, business, usage)).toEqual([]);
  });
});

describe('readOnlyReason', () => {
  it('says why in the words of the API', () => {
    expect(readOnlyReason('trial_expired')).toBe('Thời gian dùng thử đã hết.');
    expect(readOnlyReason('canceled')).toBe('Gói đã hủy.');
    expect(readOnlyReason('past_due')).toContain('ân hạn');
  });
});
