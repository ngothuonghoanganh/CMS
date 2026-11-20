import {
  type BillingCycle,
  type BillingSummary,
  cardValidAt,
  type Invoice,
  type InvoiceAttempt,
  type InvoiceSummary,
  nextVnMonthStart,
  type PaymentMethod,
  type PaymentMethodView,
  type PlanChangeQuote,
  type PlanUsage,
  type VnMonth,
  type WorkspacePlan,
} from '@plp/contracts';
import { chargesNow, type PlanChange } from './domain/plan-change.js';
import type { Entitlements } from './entitlements.service.js';
import type { InvoiceAttemptRecord, InvoiceRecord } from './invoice.schema.js';

export function toBillingSummary(
  { plan, facts, status }: Entitlements,
  usage: PlanUsage,
  month: VnMonth,
): BillingSummary {
  return {
    plan,
    cycle: facts.cycle,
    state: status.state,
    access: status.access,
    trialEndsAt: facts.trialEndsAt?.toISOString() ?? null,
    trialDaysLeft: status.trialDaysLeft,
    periodStart: facts.periodStart.toISOString(),
    periodEnd: facts.periodEnd.toISOString(),
    cancelAtPeriodEnd: facts.cancelAtPeriodEnd,
    scheduledChange: facts.scheduledChange,
    graceEndsAt: status.graceEndsAt?.toISOString() ?? null,
    usage,
    usageMonth: month,
    usageResetsOn: nextVnMonthStart(month),
  };
}

export function toWorkspacePlan({ plan, status }: Entitlements): WorkspacePlan {
  return {
    plan: { id: plan.id, name: plan.name, limits: plan.limits, features: plan.features },
    state: status.state,
    access: status.access,
    trialDaysLeft: status.trialDaysLeft,
  };
}

/** What the owner sees of the saved card at `at`: never the token. */
export function toPaymentMethodView(
  method: PaymentMethod | null,
  at: Date,
): PaymentMethodView | null {
  return method === null
    ? null
    : {
        brand: method.brand,
        last4: method.last4,
        expMonth: method.expMonth,
        expYear: method.expYear,
        expired: !cardValidAt(method, at),
      };
}

/** What choosing `planId` in `cycle` does now, for board 28's dialog. */
export function toPlanChangeQuote(
  change: PlanChange,
  choice: { planId: string; cycle: BillingCycle },
  method: PaymentMethod | null,
  at: Date,
): PlanChangeQuote {
  const charges = chargesNow(change);
  const view = toPaymentMethodView(method, at);
  return {
    mode: change.mode,
    planId: choice.planId,
    cycle: choice.cycle,
    amount: charges ? change.amount : 0,
    periodStart: charges ? change.periodStart.toISOString() : null,
    periodEnd: charges ? change.periodEnd.toISOString() : null,
    remainingDays: change.mode === 'upgrade' ? change.remainingDays : null,
    periodDays: change.mode === 'upgrade' ? change.periodDays : null,
    paymentMethod: view,
    paymentMethodRequired: charges && (view === null || view.expired),
    unavailableReason: change.mode === 'unavailable' ? change.reason : null,
  };
}

function toAttempt(attempt: InvoiceAttemptRecord): InvoiceAttempt {
  return {
    number: attempt.number,
    at: attempt.at.toISOString(),
    outcome: attempt.outcome,
    code: attempt.code,
  };
}

/** A row of "Lịch sử giao dịch"; `payable` says whether "Thanh toán lại" can charge it now. */
export function toInvoiceSummary(invoice: InvoiceRecord, payable: boolean): InvoiceSummary {
  const last = invoice.attempts.at(-1);
  return {
    id: invoice._id.toHexString(),
    number: invoice.number,
    kind: invoice.kind,
    planId: invoice.planId,
    planName: invoice.planName,
    cycle: invoice.cycle,
    periodStart: invoice.periodStart.toISOString(),
    periodEnd: invoice.periodEnd.toISOString(),
    amount: invoice.amount,
    method: invoice.method,
    card: invoice.card ? { brand: invoice.card.brand, last4: invoice.card.last4 } : null,
    status: invoice.status,
    createdAt: invoice.createdAt.toISOString(),
    paidAt: invoice.paidAt?.toISOString() ?? null,
    payable,
    lastAttempt: last === undefined ? null : toAttempt(last),
  };
}

export function toInvoice(invoice: InvoiceRecord, payable: boolean): Invoice {
  return {
    ...toInvoiceSummary(invoice, payable),
    attempts: invoice.attempts.map(toAttempt),
    billingInfo: invoice.billingInfo
      ? {
          companyName: invoice.billingInfo.companyName,
          taxCode: invoice.billingInfo.taxCode,
          address: invoice.billingInfo.address,
          email: invoice.billingInfo.email,
        }
      : null,
    from: invoice.from ? { planId: invoice.from.planId, cycle: invoice.from.cycle } : null,
    endsTrial: invoice.endsTrial,
  };
}
