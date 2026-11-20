import { z } from 'zod';
import {
  billingCycleSchema,
  billingInfoSchema,
  paymentMethodSchema,
  planIdSchema,
  vndAmountSchema,
} from './billing.js';
import { idSchema, isoDateTimeSchema } from './common.js';

/*
 * Payments of a workspace's plan (ADR-035, T2, boards 28 and 29): the payment gateway's events,
 * the saved card, the billing info, invoices and their receipts, and what a plan change charges.
 * The gateway keeps the card; the system holds its token, brand, last four digits and expiry only.
 */

/**
 * The payment gateways the API can use (`PAYMENT_PROVIDER`): `fake` is for development, tests and
 * E2E and is refused in production; `none` turns payments off. A real gateway is a new adapter
 * and an amendment of ADR-035.
 */
export const paymentProviders = ['none', 'fake'] as const;
export const paymentProviderSchema = z.enum(paymentProviders);
export type PaymentProvider = z.infer<typeof paymentProviderSchema>;

/** Why a gateway refused a charge; an adapter maps its own codes to these. */
export const paymentDeclineCodes = [
  'card_declined',
  'insufficient_funds',
  'expired_card',
  'processing_error',
] as const;
export const paymentDeclineCodeSchema = z.enum(paymentDeclineCodes);
export type PaymentDeclineCode = z.infer<typeof paymentDeclineCodeSchema>;

/** "Ngân hàng từ chối thẻ •••• 6411 (không đủ hạn mức)" on board 29. */
export const paymentDeclineLabels: Record<PaymentDeclineCode, string> = {
  card_declined: 'Ngân hàng từ chối thẻ',
  insufficient_funds: 'Thẻ không đủ hạn mức',
  expired_card: 'Thẻ đã hết hạn',
  processing_error: 'Cổng thanh toán gặp lỗi',
};

/*
 * The gateway's events (`POST /public/billing/webhooks/:provider`). An adapter's `parseWebhook`
 * checks the signature and returns one of them; the fake gateway sends exactly this JSON.
 */

export const gatewayEventKinds = [
  'method_saved',
  'charge_succeeded',
  'charge_failed',
  'transfer_received',
] as const;
export const gatewayEventKindSchema = z.enum(gatewayEventKinds);
export type GatewayEventKind = z.infer<typeof gatewayEventKindSchema>;

const gatewayEventBase = {
  /** Unique per gateway: an event that arrives again is applied once (`billing_events`). */
  eventId: z.string().min(1).max(200),
  occurredAt: isoDateTimeSchema,
  /** What the API gave the gateway and the gateway echoes back; the only routing input. */
  reference: z.string().min(1).max(200),
};

export const gatewayEventSchema = z.discriminatedUnion('kind', [
  /** A card was saved on the gateway's page that `startMethodSetup` opened. */
  z.strictObject({
    kind: z.literal('method_saved'),
    ...gatewayEventBase,
    method: paymentMethodSchema,
  }),
  /** A charge went through: `reference` is the invoice, `idempotencyKey` its attempt. */
  z.strictObject({
    kind: z.literal('charge_succeeded'),
    ...gatewayEventBase,
    idempotencyKey: z.string().min(1).max(200),
    amount: vndAmountSchema,
  }),
  /** A charge that answered `pending` was refused later. */
  z.strictObject({
    kind: z.literal('charge_failed'),
    ...gatewayEventBase,
    idempotencyKey: z.string().min(1).max(200),
    amount: vndAmountSchema,
    code: paymentDeclineCodeSchema,
  }),
  /** A bank transfer for the invoice `reference` arrived (T3). */
  z.strictObject({
    kind: z.literal('transfer_received'),
    ...gatewayEventBase,
    amount: vndAmountSchema,
  }),
]);
export type GatewayEvent = z.infer<typeof gatewayEventSchema>;

/** What the webhook answers every accepted event, applied, already applied or ignored alike. */
export const gatewayWebhookResponseSchema = z.object({ received: z.literal(true) });
export type GatewayWebhookResponse = z.infer<typeof gatewayWebhookResponseSchema>;

/** Bank transfer details for an invoice (`startTransfer`, T3): account, content and QR code. */
export const transferInstructionsSchema = z.object({
  bankName: z.string().min(1).max(200),
  accountNumber: z.string().min(1).max(40),
  accountName: z.string().min(1).max(200),
  /** "Nội dung chuyển khoản": how the gateway matches the transfer to the invoice. */
  content: z.string().min(1).max(200),
  amount: vndAmountSchema,
  /** The VietQR payload to draw as a QR code; null when the gateway gives none. */
  qrPayload: z.string().max(2000).nullable(),
});
export type TransferInstructions = z.infer<typeof transferInstructionsSchema>;

/*
 * The saved card (board 29 "Phương thức thanh toán").
 */

/** What the owner sees of the saved card: never its token. */
export const paymentMethodViewSchema = z.object({
  brand: z.string(),
  last4: z.string().regex(/^\d{4}$/),
  expMonth: z.number().int().min(1).max(12),
  expYear: z.number().int(),
  /** Past the last day of its expiry month: it cannot be charged ("Hết hạn 08/2028"). */
  expired: z.boolean(),
});
export type PaymentMethodView = z.infer<typeof paymentMethodViewSchema>;

/** `GET /workspaces/:id/billing/payment-method` (`billing.manage`). */
export const paymentMethodResponseSchema = z.object({
  paymentMethod: paymentMethodViewSchema.nullable(),
  /** False when `PAYMENT_PROVIDER=none`: nothing can be paid ("Thanh toán chưa được bật"). */
  paymentsEnabled: z.boolean(),
});
export type PaymentMethodResponse = z.infer<typeof paymentMethodResponseSchema>;

/** The admin screen the gateway's page leads back to: board 29, or board 28's plan dialog. */
export const methodSetupReturnTargets = ['payments', 'plan'] as const;
export const methodSetupReturnTargetSchema = z.enum(methodSetupReturnTargets);
export type MethodSetupReturnTarget = z.infer<typeof methodSetupReturnTargetSchema>;

/** "Thêm phương thức" / "Đổi thẻ": the API asks the gateway for the page that saves a card. */
export const startMethodSetupRequestSchema = z.strictObject({
  returnTo: methodSetupReturnTargetSchema.default('payments'),
});
export type StartMethodSetupRequest = z.infer<typeof startMethodSetupRequestSchema>;

/** Where the browser goes: the gateway's page, which leads back to the admin. */
export const methodSetupResponseSchema = z.object({ url: z.url() });
export type MethodSetupResponse = z.infer<typeof methodSetupResponseSchema>;

/**
 * Query parameter of the admin page the gateway leads back to: `saved` after a card was entered
 * (its event may still be on its way), `canceled` when the owner left the gateway's page.
 */
export const METHOD_SETUP_RESULT_PARAM = 'paymentMethod';
export const methodSetupResults = ['saved', 'canceled'] as const;
export const methodSetupResultSchema = z.enum(methodSetupResults);
export type MethodSetupResult = z.infer<typeof methodSetupResultSchema>;

/*
 * "Thông tin xuất hóa đơn" (board 29): copied onto each invoice when it is made, so a change
 * applies to later invoices only.
 */

/** `GET` and `PUT /workspaces/:id/billing/info` (`billing.manage`). */
export const billingInfoResponseSchema = z.object({ billingInfo: billingInfoSchema.nullable() });
export type BillingInfoResponse = z.infer<typeof billingInfoResponseSchema>;

/*
 * Invoices (`invoices` in the master DB) and their receipts: "Lịch sử giao dịch" and "Tải hóa
 * đơn" of board 29. A paid or void invoice never changes.
 */

/** `subscription` pays a period of the plan; `upgrade` the rest of a period on a higher plan. */
export const invoiceKinds = ['subscription', 'upgrade'] as const;
export const invoiceKindSchema = z.enum(invoiceKinds);
export type InvoiceKind = z.infer<typeof invoiceKindSchema>;

/**
 * - `open`: not charged yet, or the gateway's answer is unknown (it may still have charged);
 * - `pending`: the gateway is still deciding, or a transfer awaits confirmation;
 * - `paid` and `void` never change again; `failed`: the last charge was refused.
 */
export const invoiceStatuses = ['open', 'pending', 'paid', 'failed', 'void'] as const;
export const invoiceStatusSchema = z.enum(invoiceStatuses);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

/** The status column of "Lịch sử giao dịch". */
export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  open: 'Chờ thanh toán',
  pending: 'Đang xử lý',
  paid: 'Đã thanh toán',
  failed: 'Thất bại',
  void: 'Đã hủy',
};

export const invoicePaymentMethods = ['card', 'transfer'] as const;
export const invoicePaymentMethodSchema = z.enum(invoicePaymentMethods);
export type InvoicePaymentMethod = z.infer<typeof invoicePaymentMethodSchema>;

/** `HD-{năm}-{số thứ tự 6 chữ số}`, numbered per year in Vietnam. */
export const invoiceNumberSchema = z.string().regex(/^HD-\d{4}-\d{6}$/);

/** `unknown`: the gateway could not be reached or did not answer; it may have charged. */
export const chargeOutcomes = ['succeeded', 'failed', 'pending', 'unknown'] as const;
export const chargeOutcomeSchema = z.enum(chargeOutcomes);
export type ChargeOutcome = z.infer<typeof chargeOutcomeSchema>;

/** One charge of an invoice; its idempotency key at the gateway is `{invoiceId}-{number}`. */
export const invoiceAttemptSchema = z.object({
  number: z.number().int().min(1),
  at: isoDateTimeSchema,
  outcome: chargeOutcomeSchema,
  /** Why the gateway refused it; null unless `failed`. */
  code: paymentDeclineCodeSchema.nullable(),
});
export type InvoiceAttempt = z.infer<typeof invoiceAttemptSchema>;

const planChoiceSchema = z.object({ planId: planIdSchema, cycle: billingCycleSchema });

/** A row of "Lịch sử giao dịch". */
export const invoiceSummarySchema = z.object({
  id: idSchema,
  number: invoiceNumberSchema,
  kind: invoiceKindSchema,
  planId: planIdSchema,
  /** The plan's name when the invoice was made: "Gói Agency · kỳ 01/11 – 30/11". */
  planName: z.string(),
  cycle: billingCycleSchema,
  /** What the invoice pays for: a whole period, or the rest of one for an upgrade. */
  periodStart: isoDateTimeSchema,
  periodEnd: isoDateTimeSchema,
  /** In đồng, VAT included. */
  amount: vndAmountSchema,
  method: invoicePaymentMethodSchema,
  /** The card of the last charge; null before any. */
  card: z.object({ brand: z.string(), last4: z.string() }).nullable(),
  status: invoiceStatusSchema,
  createdAt: isoDateTimeSchema,
  paidAt: isoDateTimeSchema.nullable(),
  /** "Thanh toán lại" can charge it now: unpaid, and what it pays for still applies. */
  payable: z.boolean(),
  lastAttempt: invoiceAttemptSchema.nullable(),
});
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;

/** One invoice with its charges and the billing info copied onto it. */
export const invoiceSchema = invoiceSummarySchema.extend({
  attempts: z.array(invoiceAttemptSchema),
  billingInfo: billingInfoSchema.nullable(),
  /** The plan it changes from (a plan change paid now); null for a period's renewal. */
  from: planChoiceSchema.nullable(),
  /** Paying it ends the trial and starts the first paid period. */
  endsTrial: z.boolean(),
});
export type Invoice = z.infer<typeof invoiceSchema>;

/** `GET /workspaces/:id/billing/invoices` (`billing.manage`): newest first. */
export const invoiceListResponseSchema = z.object({
  items: z.array(invoiceSummarySchema),
  nextCursor: z.string().nullable(),
});
export type InvoiceListResponse = z.infer<typeof invoiceListResponseSchema>;

/**
 * "Tải hóa đơn": the receipt of a paid invoice, for a printable page. It is a payment receipt,
 * not an electronic VAT invoice (§6).
 */
export const invoiceReceiptSchema = z.object({
  invoice: invoiceSchema,
  workspaceName: z.string(),
});
export type InvoiceReceipt = z.infer<typeof invoiceReceiptSchema>;

/** "Thanh toán lại" (header `Idempotency-Key`): the invoice after the charge. */
export const payInvoiceResponseSchema = z.object({ invoice: invoiceSchema });
export type PayInvoiceResponse = z.infer<typeof payInvoiceResponseSchema>;

/*
 * What choosing a plan does now (board 28's dialog), before the owner confirms it.
 */

/**
 * - `unchanged`: the plan and cycle the workspace has;
 * - `trial_change`: during the trial, at once and free;
 * - `start_paid`: `payNow` during or after the trial: the trial ends and the first period of the
 *   chosen plan is charged in full, from now;
 * - `upgrade`: a higher price in the same cycle during a paid period: at once, the difference for
 *   the days left is charged, rounded up to 1.000đ;
 * - `unavailable`: see `planChangeUnavailableReasons`.
 */
export const planChangeModes = [
  'unchanged',
  'trial_change',
  'start_paid',
  'upgrade',
  'unavailable',
] as const;
export const planChangeModeSchema = z.enum(planChangeModes);
export type PlanChangeMode = z.infer<typeof planChangeModeSchema>;

/**
 * - `payment_required`: the trial is over; only paying now (`payNow`) chooses a plan;
 * - `unpaid`: the period ended or its payment is due; it is paid first (T3);
 * - `scheduled_change`: a lower or equal price, or another cycle, applies at the period's end
 *   (T3).
 */
export const planChangeUnavailableReasons = [
  'payment_required',
  'unpaid',
  'scheduled_change',
] as const;
export const planChangeUnavailableReasonSchema = z.enum(planChangeUnavailableReasons);
export type PlanChangeUnavailableReason = z.infer<typeof planChangeUnavailableReasonSchema>;

/** `GET /workspaces/:id/billing/plan/quote` (`billing.manage`). */
export const planChangeQuoteQuerySchema = z.object({
  planId: planIdSchema,
  cycle: billingCycleSchema,
  payNow: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});
export type PlanChangeQuoteQuery = z.infer<typeof planChangeQuoteQuerySchema>;

export const planChangeQuoteSchema = z.object({
  mode: planChangeModeSchema,
  planId: planIdSchema,
  cycle: billingCycleSchema,
  /** What is charged now, VAT included; 0 when nothing is. Confirm with `expectedAmount`. */
  amount: vndAmountSchema,
  /** What the charge pays for; null when nothing is charged. */
  periodStart: isoDateTimeSchema.nullable(),
  periodEnd: isoDateTimeSchema.nullable(),
  /** An upgrade's proration: whole days left of the period (rounded up), and its length. */
  remainingDays: z.number().int().nonnegative().nullable(),
  periodDays: z.number().int().positive().nullable(),
  /** The card that would be charged; null when none is saved. */
  paymentMethod: paymentMethodViewSchema.nullable(),
  /** The change charges and no valid card is saved: "Thêm thẻ" first. */
  paymentMethodRequired: z.boolean(),
  unavailableReason: planChangeUnavailableReasonSchema.nullable(),
});
export type PlanChangeQuote = z.infer<typeof planChangeQuoteSchema>;

/*
 * Problems of payments.
 */

/** `context` of a 402 `payment_failed`: the gateway refused the charge of this invoice. */
export const paymentFailedProblemContextSchema = z.object({
  invoiceId: idSchema,
  invoiceNumber: invoiceNumberSchema,
  code: paymentDeclineCodeSchema,
});
export type PaymentFailedProblemContext = z.infer<typeof paymentFailedProblemContextSchema>;

/** `context` of a 503 `gateway_unavailable`: the charge's outcome is not known yet. */
export const gatewayUnavailableProblemContextSchema = z.object({
  invoiceId: idSchema,
  invoiceNumber: invoiceNumberSchema,
});
export type GatewayUnavailableProblemContext = z.infer<
  typeof gatewayUnavailableProblemContextSchema
>;

/** `context` of a 409 `quote_changed`: what the change charges now, to confirm again. */
export const quoteChangedProblemContextSchema = z.object({ quote: planChangeQuoteSchema });
export type QuoteChangedProblemContext = z.infer<typeof quoteChangedProblemContextSchema>;

/** `context` of a 409 `plan_change_unavailable`. */
export const planChangeUnavailableProblemContextSchema = z.object({
  reason: planChangeUnavailableReasonSchema,
});
export type PlanChangeUnavailableProblemContext = z.infer<
  typeof planChangeUnavailableProblemContextSchema
>;
