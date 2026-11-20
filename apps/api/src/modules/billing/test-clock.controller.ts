import { Body, Controller, Get, Put } from '@nestjs/common';
import { setTestClockRequestSchema, type TestClock } from '@plp/contracts';
import { notFound } from '../../shared/errors.js';
import { ZodPipe } from '../../shared/zod.pipe.js';
import { Public } from '../auth/public.decorator.js';
import { BillingClock } from './billing-clock.js';

/**
 * Moves the billing clock of this API process for end-to-end lifecycle tests (ADR-035): a trial
 * ending, a grace running out. It exists only with `BILLING_TEST_CLOCK=on`, which production
 * refuses; otherwise both routes answer 404 before reading anything.
 */
@Controller('testing/clock')
export class TestClockController {
  constructor(private readonly clock: BillingClock) {}

  @Public()
  @Get()
  get(): TestClock {
    this.requireMovable();
    return this.state();
  }

  @Public()
  @Put()
  set(@Body() body: unknown): TestClock {
    this.requireMovable();
    const { now } = new ZodPipe(setTestClockRequestSchema).transform(body);
    this.clock.set(now === null ? null : new Date(now));
    return this.state();
  }

  private requireMovable(): void {
    if (!this.clock.movable) {
      throw notFound();
    }
  }

  private state(): TestClock {
    return { now: this.clock.now().toISOString(), offsetMs: this.clock.offset };
  }
}
