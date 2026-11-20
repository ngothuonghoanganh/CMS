import { Injectable } from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';

/**
 * The time every billing decision reads (ADR-035): when a trial ends, how many days are left,
 * when the grace is over and the workspace turns read-only. It is real time, except that with
 * `BILLING_TEST_CLOCK=on` (never in production) lifecycle tests move it for the whole process:
 * end to end through `PUT /testing/clock`, in integration tests with `set`.
 */
@Injectable()
export class BillingClock {
  private offsetMs = 0;

  constructor(@InjectEnv() private readonly env: Env) {}

  get movable(): boolean {
    return this.env.BILLING_TEST_CLOCK === 'on';
  }

  /** How far the clock is ahead of real time; 0 unless a test moved it. */
  get offset(): number {
    return this.offsetMs;
  }

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  /** Moves the clock to `at`, from where it keeps running; null goes back to real time. */
  set(at: Date | null): void {
    if (!this.movable) {
      throw new Error('The billing clock moves only with BILLING_TEST_CLOCK=on (ADR-035)');
    }
    this.offsetMs = at === null ? 0 : at.getTime() - Date.now();
  }
}
