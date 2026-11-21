import type {
  BillingSummary,
  DueInvoice,
  Invoice,
  InvoiceSummary,
  PaymentMethodView,
  Plan,
  PlanCatalogResponse,
  PlanChangeQuote,
} from '@plp/contracts';

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
    graceDaysLeft: null,
    cancelAt: null,
    renewal: null,
    dueInvoice: null,
    failedSince: null,
    nextRetryAt: null,
    usage: { sites: 4, members: 7, aiUses: 12, automationRuns: 1240, customDomains: 4 },
    usageMonth: '2026-11',
    usageResetsOn: '2026-12-01',
    ...overrides,
  };
}

export const visaCard: PaymentMethodView = {
  brand: 'visa',
  last4: '4242',
  expMonth: 8,
  expYear: 2030,
  expired: false,
};

export function quoteFixture(overrides: Partial<PlanChangeQuote> = {}): PlanChangeQuote {
  return {
    mode: 'trial_change',
    planId: 'agency',
    cycle: 'monthly',
    amount: 0,
    periodStart: null,
    periodEnd: null,
    remainingDays: null,
    periodDays: null,
    paymentMethod: null,
    paymentMethodRequired: false,
    unavailableReason: null,
    effectiveAt: null,
    nextAmount: null,
    impacts: null,
    ...overrides,
  };
}

/** A row of the plan (`subscription`, `upgrade`): its plan and period, no marketplace item. */
export type PlanInvoiceSummary = InvoiceSummary &
  Pick<DueInvoice, 'planId' | 'planName' | 'cycle' | 'periodStart' | 'periodEnd' | 'item'>;

export function invoiceSummaryFixture(
  overrides: Partial<PlanInvoiceSummary> = {},
): PlanInvoiceSummary {
  return {
    id: '64b0000000000000000000b1',
    number: 'HD-2026-000001',
    kind: 'subscription',
    planId: 'business',
    planName: 'Doanh nghiệp',
    cycle: 'monthly',
    periodStart: '2026-11-21T03:00:00.000Z',
    periodEnd: '2026-12-21T03:00:00.000Z',
    item: null,
    amount: 1_490_000,
    method: 'card',
    card: { brand: 'visa', last4: '4242' },
    status: 'paid',
    createdAt: '2026-11-21T03:00:00.000Z',
    paidAt: '2026-11-21T03:00:05.000Z',
    payable: false,
    lastAttempt: { number: 1, at: '2026-11-21T03:00:05.000Z', outcome: 'succeeded', code: null },
    ...overrides,
  };
}

export function invoiceFixture(overrides: Partial<Invoice> = {}): Invoice {
  return {
    ...invoiceSummaryFixture(),
    attempts: [{ number: 1, at: '2026-11-21T03:00:05.000Z', outcome: 'succeeded', code: null }],
    billingInfo: null,
    from: { planId: 'agency', cycle: 'monthly' },
    endsTrial: true,
    transfer: null,
    ...overrides,
  };
}

/** A marketplace row (ADR-036): the item it bought, no plan or period. */
export function marketplaceInvoiceSummaryFixture(
  overrides: Partial<InvoiceSummary> = {},
): InvoiceSummary {
  return {
    ...invoiceSummaryFixture(),
    id: '64b0000000000000000000b9',
    number: 'HD-2026-000009',
    kind: 'marketplace',
    planId: null,
    planName: null,
    cycle: null,
    periodStart: null,
    periodEnd: null,
    item: { itemId: 'mp-mo-ban-du-an-can-ho', name: 'Mở bán dự án căn hộ', version: 1 },
    amount: 499_000,
    ...overrides,
  };
}
