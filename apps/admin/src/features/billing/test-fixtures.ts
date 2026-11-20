import type { BillingSummary, Plan, PlanCatalogResponse } from '@plp/contracts';

// Shared by the billing specs only.

export const basic: Plan = {
  id: 'basic',
  name: 'Cơ bản',
  fit: 'Một doanh nghiệp, vài trang',
  prices: { monthly: 199_000, yearly: 1_990_000 },
  limits: { sites: 1, members: 3, aiUses: 30, automationRuns: 0, customDomains: 1 },
  features: { automation: false, customRoles: false },
};
export const agency: Plan = {
  id: 'agency',
  name: 'Agency',
  fit: 'Nhiều site khách hàng',
  prices: { monthly: 599_000, yearly: 5_990_000 },
  limits: { sites: 5, members: 10, aiUses: 300, automationRuns: 5000, customDomains: 10 },
  features: { automation: true, customRoles: false },
};
export const business: Plan = {
  id: 'business',
  name: 'Doanh nghiệp',
  fit: 'Đội lớn, cần kiểm soát',
  prices: { monthly: 1_490_000, yearly: 14_900_000 },
  limits: { sites: 20, members: 50, aiUses: 1500, automationRuns: 50000, customDomains: 40 },
  features: { automation: true, customRoles: true },
};

export const catalog: PlanCatalogResponse = {
  plans: [basic, agency, business],
  trial: { planId: 'agency', days: 14 },
};

export function summaryFixture(overrides: Partial<BillingSummary> = {}): BillingSummary {
  return {
    plan: agency,
    cycle: 'monthly',
    state: 'trialing',
    access: 'full',
    trialEndsAt: '2026-12-04T03:00:00.000Z',
    trialDaysLeft: 14,
    periodStart: '2026-11-20T03:00:00.000Z',
    periodEnd: '2026-12-04T03:00:00.000Z',
    cancelAtPeriodEnd: false,
    scheduledChange: null,
    graceEndsAt: null,
    usage: { sites: 4, members: 7, aiUses: 12, automationRuns: 1240, customDomains: 4 },
    usageMonth: '2026-11',
    usageResetsOn: '2026-12-01',
    ...overrides,
  };
}
