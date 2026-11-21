import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import {
  type BillingWorkRun,
  setTestClockRequestSchema,
  type SetTestClockResponse,
  type TestClock,
} from '@plp/contracts';
import { notFound } from '../../shared/errors.js';
import { ZodPipe } from '../../shared/zod.pipe.js';
import { Public } from '../auth/public.decorator.js';
import { BillingClock } from './billing-clock.js';
import { BillingScheduler } from './billing-scheduler.service.js';

/**
 * Moves the billing clock of this API process for end-to-end lifecycle tests (ADR-035): a trial
 * ending, a grace running out. Moving it runs the billing work due at the new time before it
 * answers (T3), and `POST /testing/billing/run-due` runs it without moving: with the test clock
 * the job has no timer, so a test decides when it acts. They exist only with
 * `BILLING_TEST_CLOCK=on`, which production refuses; otherwise every route answers 404 before
 * reading anything.
 */
@Controller('testing')
export class TestClockController {
  constructor(
    private readonly clock: BillingClock,
    private readonly scheduler: BillingScheduler,
  ) {}

  @Public()
  @Get('clock')
  get(): TestClock {
    this.requireMovable();
    return this.state();
  }

  @Public()
  @Put('clock')
  async set(@Body() body: unknown): Promise<SetTestClockResponse> {
    this.requireMovable();
    const { now } = new ZodPipe(setTestClockRequestSchema).transform(body);
    this.clock.set(now === null ? null : new Date(now));
    const handled = await this.scheduler.runDue();
    return { ...this.state(), handled };
  }

  @Public()
  @Post('billing/run-due')
  @HttpCode(200)
  async runDue(): Promise<BillingWorkRun> {
    this.requireMovable();
    const handled = await this.scheduler.runDue();
    return { now: this.clock.now().toISOString(), handled };
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
