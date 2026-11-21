import { type APIRequestContext } from '@playwright/test';
import { billingSummarySchema, endpoints, testClockSchema } from '@plp/contracts';
import { call } from './setup.js';

/**
 * Moves the billing clock of the whole API process (ADR-035; the E2E API runs with
 * `BILLING_TEST_CLOCK=on`), or `null` back to real time. Specs that move it reset it after.
 */
export function setBillingClock(request: APIRequestContext, now: Date | null) {
  return call(request, 'PUT', endpoints.setTestClock.path(), testClockSchema, {
    now: now === null ? null : now.toISOString(),
  });
}

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MINUTE_MS = 60 * 1000;

/** The workspace's billing summary, as the owner's page reads it. */
export function billingSummaryOf(request: APIRequestContext, workspaceId: string) {
  return call(request, 'GET', endpoints.getBillingSummary.path(workspaceId), billingSummarySchema);
}

/** An ISO time from the summary, as a Date; the summary field must be set. */
export function dateOf(iso: string | null): Date {
  if (iso === null) {
    throw new Error('Expected the billing summary to carry this date');
  }
  return new Date(iso);
}

/** "dd/MM" as the admin writes it, in Vietnam's time. */
export function dayMonth(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

/** "dd/MM/yyyy" as the admin writes it, in Vietnam's time. */
export function fullDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}
