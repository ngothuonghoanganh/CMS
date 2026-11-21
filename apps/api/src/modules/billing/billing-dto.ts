import {
  type BillingCycle,
  type BillingSummary,
  cardValidAt,
  type DueInvoice,
  type Invoice,
  type InvoiceAttempt,
  type InvoiceSummary,
  type InvoiceTransfer,
  nextVnMonthStart,
  type PaymentMethod,
  type PaymentMethodView,
  type Plan,
  type PlanChangeImpacts,
  type PlanChangeQuote,
  type PlanUsage,
  type SubscriptionRenewal,
  type VnMonth,
  type WorkspacePlan,
} from '@plp/contracts';
import { nextRetryOf } from './domain/billing-agenda.js';
import { chargesNow, type PlanChange } from './domain/plan-change.js';
import {
  type BillingPolicy,
  currentEndOf,
  paymentUnderWay,
  renewalBlockerOf,
  renewalTermsOf,
  scheduledChangeOf,
  transferInvoiceAtOf,
} from './domain/renewal.js';
import { qrSvgDataUrl } from './domain/transfer-qr.js';
import type { Entitlements } from './entitlements.service.js';
import type { InvoiceAttemptRecord, InvoiceRecord, PlanInvoiceRecord } from './invoice.schema.js';

/** What board 28 and 29's banners need beyond the plan (T3): the due invoice and the policy. */
export interface SummaryContext {
  usage: PlanUsage;
  month: VnMonth;
  policy: Pick<BillingPolicy, 'retryDays' | 'transferLeadDays'>;
  planOf: (planId: string) => Plan;
  /**
   * The invoice the subscription waits for (`openInvoiceId`, or once the end passed the next
   * period's invoice made before it), with whether it is payable: always an invoice of the plan.
   */
  due: { invoice: PlanInvoiceRecord; payable: boolean } | null;
  /** The next period's invoice made before the end (T4): waiting for its transfer, or paid. */
  renewalInvoice: { invoice: PlanInvoiceRecord; payable: boolean } | null;
  /** The ended period waits for its renewal invoice made for a transfer (T4). */
  awaitingTransfer: boolean;
}

/**
 * The next period: at the end of the trial or period, for the plan it will have then, charged to
 * the card or paid by transfer of an invoice made before it (T4), maybe paid already. None after
 * "Hủy gói", or once the trial or period ended or a payment of it is under way.
 */
function renewalOf(
  { facts, at }: Pick<Entitlements, 'facts' | 'at'>,
  context: Pick<SummaryContext, 'planOf' | 'policy' | 'renewalInvoice'>,
): SubscriptionRenewal | null {
  const end = currentEndOf(facts);
  if (facts.cancelAtPeriodEnd || paymentUnderWay(facts) || at.getTime() >= end.getTime()) {
    return null;
  }
  const made = context.renewalInvoice;
  const terms = renewalTermsOf(facts, context.planOf);
  const paid = facts.prepaid !== null;
  const byCard = facts.renewalMethod === 'card';
  const blocker = byCard && !paid ? renewalBlockerOf(facts.paymentMethod, end) : null;
  const planned = transferInvoiceAtOf(facts, context.policy);
  const invoiceAt =
    made !== null
      ? made.invoice.createdAt
      : byCard || paid
        ? null
        : new Date(Math.max(planned.getTime(), at.getTime()));
  return {
    at: end.toISOString(),
    // What the invoice made for it says, once there is one: it was made from these terms.
    planId: made?.invoice.planId ?? terms.plan.id,
    planName: made?.invoice.planName ?? terms.plan.name,
    cycle: made?.invoice.cycle ?? terms.cycle,
    amount: made?.invoice.amount ?? terms.amount,
    autoRenews: byCard && !paid && blocker === null,
    blocker,
    method: facts.renewalMethod,
    invoiceAt: invoiceAt?.toISOString() ?? null,
    invoice: made === null ? null : toDueInvoice(made.invoice, made.payable),
    paid,
  };
}

export function toBillingSummary(
  { plan, facts, status, at }: Entitlements,
  context: SummaryContext,
): BillingSummary {
  const { due, month } = context;
  const nextRetry =
    facts.failedSince !== null && due !== null && due.invoice.status === 'failed'
      ? nextRetryOf(facts.failedSince, context.policy.retryDays, due.invoice.attempts)
      : null;
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
    scheduledChange: scheduledChangeOf(facts, at),
    graceEndsAt: status.graceEndsAt?.toISOString() ?? null,
    graceDaysLeft: status.graceDaysLeft,
    cancelAt: facts.cancelAtPeriodEnd ? currentEndOf(facts).toISOString() : null,
    renewal: renewalOf({ facts, at }, context),
    dueInvoice: due === null ? null : toDueInvoice(due.invoice, due.payable),
    renewalMethod: facts.renewalMethod,
    awaitingTransfer: context.awaitingTransfer,
    failedSince: facts.failedSince?.toISOString() ?? null,
    nextRetryAt: nextRetry?.toISOString() ?? null,
    usage: context.usage,
    usageMonth: month,
    usageResetsOn: nextVnMonthStart(month),
  };
}

/** The due invoice of board 28's banners, without the card (board 29 only). */
function toDueInvoice(invoice: PlanInvoiceRecord, payable: boolean): DueInvoice {
  const { card: _card, ...summary } = toInvoiceSummary(invoice, payable);
  return {
    ...summary,
    planId: invoice.planId,
    planName: invoice.planName,
    cycle: invoice.cycle,
    periodStart: invoice.periodStart.toISOString(),
    periodEnd: invoice.periodEnd.toISOString(),
    item: null,
  };
}

/**
 * The plan every member sees, with `due`, the invoice the subscription waits for: a transfer to
 * confirm or a charge the gateway has not answered make the banners say it waits (T3), and a
 * renewal by transfer awaited says "Chờ chuyển khoản" (T4).
 */
export function toWorkspacePlan(
  { plan, status }: Entitlements,
  due: Pick<InvoiceRecord, 'status'> | null,
  awaitingTransfer: boolean,
): WorkspacePlan {
  return {
    plan: { id: plan.id, name: plan.name, limits: plan.limits, features: plan.features },
    state: status.state,
    access: status.access,
    trialDaysLeft: status.trialDaysLeft,
    graceDaysLeft: status.graceDaysLeft,
    paymentWaiting: due !== null && (due.status === 'pending' || due.status === 'open'),
    awaitingTransfer,
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

/**
 * What choosing `planId` in `cycle` does now, for board 28's dialog, with the early transfer
 * invoice confirming voids (T4).
 */
export function toPlanChangeQuote(
  change: PlanChange,
  choice: { planId: string; cycle: BillingCycle },
  method: PaymentMethod | null,
  at: Date,
  impacts: PlanChangeImpacts | null,
  renewalInvoiceVoided: PlanChangeQuote['renewalInvoiceVoided'] = null,
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
    effectiveAt: change.mode === 'scheduled' ? change.effectiveAt.toISOString() : null,
    nextAmount: change.mode === 'scheduled' ? change.nextAmount : null,
    impacts,
    renewalInvoiceVoided,
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

/**
 * A row of "Lịch sử giao dịch"; `payable` says whether "Thanh toán lại" can charge it now. A
 * marketplace invoice has its item and no plan (ADR-036).
 */
export function toInvoiceSummary(invoice: InvoiceRecord, payable: boolean): InvoiceSummary {
  const last = invoice.attempts.at(-1);
  return {
    id: invoice._id.toHexString(),
    number: invoice.number,
    kind: invoice.kind,
    planId: invoice.planId,
    planName: invoice.planName,
    cycle: invoice.cycle,
    periodStart: invoice.periodStart?.toISOString() ?? null,
    periodEnd: invoice.periodEnd?.toISOString() ?? null,
    item:
      invoice.kind === 'marketplace'
        ? { itemId: invoice.item.itemId, name: invoice.item.name, version: invoice.item.version }
        : null,
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

/** The transfer's details, with the QR code drawn here. */
function toInvoiceTransfer(invoice: InvoiceRecord): InvoiceTransfer | null {
  const { transfer } = invoice;
  if (transfer === null) {
    return null;
  }
  return {
    bankName: transfer.bankName,
    accountNumber: transfer.accountNumber,
    accountName: transfer.accountName,
    content: transfer.content,
    amount: invoice.amount,
    qrDataUrl: transfer.qrPayload === null ? null : qrSvgDataUrl(transfer.qrPayload),
    pageUrl: transfer.pageUrl,
    startedAt: transfer.startedAt.toISOString(),
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
    transfer: toInvoiceTransfer(invoice),
  };
}
