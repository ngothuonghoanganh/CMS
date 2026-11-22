import { z } from 'zod';
import {
  accessLevelSchema,
  billingCycleSchema,
  planIdSchema,
  planSchema,
  planUsageSchema,
  renewalMethodSchema,
  scheduledChangeSchema,
  subscriptionStateSchema,
  testClockSchema,
  vndAmountSchema,
} from './billing.js';
import { invoiceSummarySchema } from './billing-payments.js';
import { vnDaySchema, vnMonthSchema } from './calendar.js';
import { isoDateTimeSchema } from './common.js';

/*
 * The life of a workspace's plan after T2 (ADR-035, T3, boards 28 and 29): renewing at the end of a
 * period or trial, failed charges and their retries, a transfer waiting for its confirmation, a
 * change scheduled for the end of the period, a cancellation, and what the banners of both boards
 * say about them.
 */

/** Why the next period cannot be charged by itself (board 28 "Sắp hết hạn", the trial banner). */
export const renewalBlockers = ['no_payment_method', 'card_expires'] as const;
export const renewalBlockerSchema = z.enum(renewalBlockers);
export type RenewalBlocker = z.infer<typeof renewalBlockerSchema>;

/**
 * The invoice the subscription waits for (banners of boards 28 and 29): the renewal charged at the
 * end of a period or trial, failed and retried, or a bank transfer waiting for its confirmation.
 * Without the card, which only the owner sees on board 29. Always an invoice of the plan, with its
 * plan and period: a marketplace item's never is one (ADR-036).
 */
export const dueInvoiceSchema = invoiceSummarySchema.omit({ card: true }).extend({
  planId: planIdSchema,
  planName: z.string(),
  cycle: billingCycleSchema,
  periodStart: isoDateTimeSchema,
  periodEnd: isoDateTimeSchema,
  item: z.null(),
});
export type DueInvoice = z.infer<typeof dueInvoiceSchema>;

/**
 * The next period of the plan: at the end of the trial or of the period, for the plan and cycle the
 * workspace will have then (a scheduled change applied), charged to the card at that end, or paid
 * by bank transfer of an invoice made before it (T4).
 */
export const subscriptionRenewalSchema = z.object({
  /** When the next period starts and is charged ("gia hạn tự động 01/12"); a transfer's due day. */
  at: isoDateTimeSchema,
  planId: planIdSchema,
  planName: z.string(),
  cycle: billingCycleSchema,
  /** What it costs, VAT included. */
  amount: vndAmountSchema,
  /** The saved card will pay it then: the job charges it at `at`. False for a transfer. */
  autoRenews: z.boolean(),
  /** Why the card cannot: none saved, or it expires before `at`; null otherwise (and for a transfer). */
  blocker: renewalBlockerSchema.nullable(),
  /** How it is paid (T4): the subscription's `renewalMethod`. */
  method: renewalMethodSchema,
  /**
   * When its invoice was made, or will be for a transfer (`transferLeadDays` before `at`, or now
   * when that passed); null for a card with no invoice made before `at`.
   */
  invoiceAt: isoDateTimeSchema.nullable(),
  /**
   * The invoice made for it before `at` (T4): waiting for the transfer (its details on
   * `getInvoice` and board 29), or paid (`paid`). A card charges it at `at` when the method went
   * back to `card`. Null before it is made.
   */
  invoice: dueInvoiceSchema.nullable(),
  /** The next period is paid already: it starts at `at` with no charge (T4). */
  paid: z.boolean(),
});
export type SubscriptionRenewal = z.infer<typeof subscriptionRenewalSchema>;

/** Board 28 "Gói & mức dùng" (`billing.view`): the plan with its limits and features, and usage. */
export const billingSummarySchema = z.object({
  plan: planSchema,
  cycle: billingCycleSchema,
  state: subscriptionStateSchema,
  access: accessLevelSchema,
  trialEndsAt: isoDateTimeSchema.nullable(),
  trialDaysLeft: z.number().int().nonnegative().nullable(),
  periodStart: isoDateTimeSchema,
  periodEnd: isoDateTimeSchema,
  cancelAtPeriodEnd: z.boolean(),
  /** The plan and cycle the next period moves to; it applies at `periodEnd`. */
  scheduledChange: scheduledChangeSchema.nullable(),
  /** When an unpaid workspace turns read-only. */
  graceEndsAt: isoDateTimeSchema.nullable(),
  /** Whole days left until then, by the server's clock; null outside the grace. */
  graceDaysLeft: z.number().int().nonnegative().nullable(),
  /**
   * When the plan stops after "Hủy gói": the end of the period, or of the trial ("Gói sẽ dừng vào
   * 01/12"; once `canceled`, "Gói đã hủy từ 01/12"). Null without a cancellation.
   */
  cancelAt: isoDateTimeSchema.nullable(),
  /** The next charge; null when nothing renews (a cancellation, a period that ended unpaid). */
  renewal: subscriptionRenewalSchema.nullable(),
  /** The invoice the subscription waits for; null when nothing is due. */
  dueInvoice: dueInvoiceSchema.nullable(),
  /** How the next period is paid (T4, "Phương thức thanh toán" of board 29). */
  renewalMethod: renewalMethodSchema,
  /**
   * The ended period waits for its renewal invoice made for a bank transfer (T4): nothing failed
   * and nothing is retried. Banner "Chờ chuyển khoản" with `dueInvoice` and `graceEndsAt`.
   */
  awaitingTransfer: z.boolean(),
  /** The first failed charge of the unpaid period; the grace counts from it. */
  failedSince: isoDateTimeSchema.nullable(),
  /**
   * When the job charges the due invoice again ("Hệ thống tự thử lại ngày 03/11"); null when no
   * automatic retry is left, or none is needed.
   */
  nextRetryAt: isoDateTimeSchema.nullable(),
  usage: planUsageSchema,
  /** The month AI uses and automation runs count in, and when they come back. */
  usageMonth: vnMonthSchema,
  usageResetsOn: vnDaySchema,
});
export type BillingSummary = z.infer<typeof billingSummarySchema>;

/**
 * `POST /testing/billing/run-due` and `PUT /testing/clock` (only with `BILLING_TEST_CLOCK=on`):
 * the due work of every subscription ran at the billing clock's `now`.
 */
export const billingWorkRunSchema = z.object({
  now: isoDateTimeSchema,
  /** Subscriptions whose due work ran. */
  handled: z.number().int().nonnegative(),
});
export type BillingWorkRun = z.infer<typeof billingWorkRunSchema>;

/**
 * `PUT /testing/clock` answers once the due billing work at the new time has run, so a test that
 * moves the clock sees what the job did then.
 */
export const setTestClockResponseSchema = testClockSchema.extend({
  /** Subscriptions whose due work ran at the new time. */
  handled: z.number().int().nonnegative(),
});
export type SetTestClockResponse = z.infer<typeof setTestClockResponseSchema>;
