import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { WakeupTimer } from '../../shared/persistence/wakeup-timer.js';
import type { JobWakeupRecord } from '../automations/job-wakeup.schema.js';
import { BillingClock } from './billing-clock.js';
import { BillingJob } from './billing-job.service.js';
import { BillingWakeupRepository } from './billing-wakeup.repository.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';

/** Subscriptions read per round of due work. */
const DUE_BATCH = 20;
/** Rounds per wake-up, so new work never keeps one wake-up running forever. */
const ROUNDS_MAX = 10;

/**
 * The clock of the billing job (ADR-035, T3), one per API instance, on the mechanism of ADR-034:
 * a timer set to the earliest `nextActionAt` of the subscriptions (`job_wakeups`' billing document
 * moves when a write brings work earlier, and its change stream brings every instance's timer
 * forward). No polling. At startup it reads the earliest time, so work due while the API was down
 * runs at once.
 *
 * With `BILLING_TEST_CLOCK=on` no timer runs: the due work runs when a test moves the clock or asks
 * for it (`runDue`), so a test decides when the job acts.
 */
@Injectable()
export class BillingScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BillingScheduler.name);
  private readonly timer: WakeupTimer<JobWakeupRecord>;
  /** The run going on in this process: runs never overlap here, whoever asks. */
  private running: Promise<number> = Promise.resolve(0);
  private closed = false;

  constructor(
    private readonly clock: BillingClock,
    private readonly subscriptions: SubscriptionsRepository,
    private readonly wakeups: BillingWakeupRepository,
    private readonly job: BillingJob,
  ) {
    this.timer = new WakeupTimer<JobWakeupRecord>({
      name: 'billing job',
      logger: this.logger,
      now: () => this.clock.now().getTime(),
      run: async () => {
        await this.runDue();
      },
      earliest: () => this.subscriptions.earliestAction(this.clock.now()),
      watch: (resumeAfter) => this.wakeups.watch(resumeAfter),
      timeOf: (change) => BillingWakeupRepository.timeOf(change),
    });
  }

  onApplicationBootstrap(): void {
    if (!this.clock.movable) {
      this.timer.start();
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.closed = true;
    await this.timer.stop();
    await this.running;
  }

  /**
   * Runs the job for every subscription due at the billing clock's time, then sets the billing
   * document's time to the next work; how many subscriptions it ran for. Tests, the test clock and
   * the timer call it; calls made while one runs wait for it and run after.
   */
  runDue(): Promise<number> {
    const next = this.running.then(
      () => this.work(),
      () => this.work(),
    );
    this.running = next.catch(() => 0);
    return next;
  }

  private async work(): Promise<number> {
    let handled = 0;
    for (let round = 0; round < ROUNDS_MAX && !this.closed; round += 1) {
      const seq = await this.wakeups.seq();
      const due = await this.subscriptions.dueIds(this.clock.now(), DUE_BATCH);
      for (const workspaceId of due) {
        // Each run reads the time it starts at: the runs before it may have waited for the gateway
        // for minutes, and its hold must count from now.
        if (await this.job.runFor({ workspaceId }, this.clock.now())) {
          handled += 1;
        }
      }
      // Work brought earlier meanwhile moved `seq`: look again before setting the next time.
      const settled = await this.wakeups.settle(
        seq,
        await this.subscriptions.earliestAction(this.clock.now()),
      );
      if (due.length < DUE_BATCH && settled) {
        break;
      }
    }
    return handled;
  }
}
