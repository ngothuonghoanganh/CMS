import { type APIRequestContext } from '@playwright/test';
import { endpoints, testClockSchema } from '@plp/contracts';
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
