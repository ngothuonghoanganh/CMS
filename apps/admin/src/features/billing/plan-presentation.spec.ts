import { describe, expect, it } from 'vitest';
import {
  comparisonRows,
  periodLine,
  planBanner,
  planImpacts,
  priceLabel,
  readOnlyReason,
  stateChip,
  usageMeters,
} from './plan-presentation';
import { agency, basic, business, catalog, summaryFixture } from './test-fixtures';

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

  it('tells a trial when it ends, without offering a payment that does not exist yet', () => {
    const banner = planBanner(summaryFixture());
    expect(banner?.title).toBe('Bạn đang dùng thử Gói Agency.');
    expect(banner?.body).toContain('Hết hạn 04/12/2026');
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
    expect(periodLine(summaryFixture({ state: 'cancel_scheduled', cancelAtPeriodEnd: true }))).toBe(
      'Kỳ hiện tại 20/11/2026 – 04/12/2026 · không gia hạn',
    );
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
