import { z } from 'zod';
import {
  accessLevelSchema,
  billingCycleSchema,
  planIdSchema,
  planSchema,
  planUsageSchema,
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
 * The next charge of the plan: at the end of the trial or of the period, for the plan and cycle the
 * workspace will have then (a scheduled change applied).
 */
export const subscriptionRenewalSchema = z.object({
  /** When the next period starts and is charged ("gia hạn tự động 01/12"). */
  at: isoDateTimeSchema,
  planId: planIdSchema,
  planName: z.string(),
  cycle: billingCycleSchema,
  /** What it charges, VAT included. */
  amount: vndAmountSchema,
  /** The saved card can pay it then: the job charges it at `at`. */
  autoRenews: z.boolean(),
  /** Why it cannot: no card, or the card expires before `at`; null when it can. */
  blocker: renewalBlockerSchema.nullable(),
});
export type SubscriptionRenewal = z.infer<typeof subscriptionRenewalSchema>;

/**
 * The invoice the subscription waits for (banners of boards 28 and 29): the renewal charged at the
 * end of a period or trial, failed and retried, or a bank transfer waiting for its confirmation.
 * Without the card, which only the owner sees on board 29.
 */
export const dueInvoiceSchema = invoiceSummarySchema.omit({ card: true });
export type DueInvoice = z.infer<typeof dueInvoiceSchema>;

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
