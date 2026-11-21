import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { WakeupTimer } from '../../shared/persistence/wakeup-timer.js';
import { AutomationRunner } from './automation-runner.service.js';
import { AutomationRunsRepository } from './automation-runs.repository.js';
import { type JobWakeupRecord, NOTHING_DUE } from './job-wakeup.schema.js';
import { JobWakeupsRepository } from './job-wakeups.repository.js';

/** Workspaces handled per read of the due ones. */
const DUE_BATCH = 20;
/** Rounds of due workspaces per wake-up, so new work never keeps one wake-up running forever. */
const ROUNDS_MAX = 10;

/** A time of `job_wakeups`, or null for "nothing due". */
function dueTime(at: Date): Date | null {
  return at.getTime() >= NOTHING_DUE.getTime() ? null : at;
}

/**
 * The queue's clock (ADR-034), one per API instance: a timer set to the earliest due time in the
 * master's `job_wakeups`, and a change stream on it that brings the timer forward when any
 * instance adds earlier work (`WakeupTimer`). No polling. At startup it reads the earliest time,
 * so work due while the API was down runs at once.
 */
@Injectable()
export class AutomationScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AutomationScheduler.name);
  private readonly timer: WakeupTimer<JobWakeupRecord>;
  private closed = false;

  constructor(
    private readonly wakeups: JobWakeupsRepository,
    private readonly runs: AutomationRunsRepository,
    private readonly runner: AutomationRunner,
  ) {
    this.timer = new WakeupTimer<JobWakeupRecord>({
      name: 'automation queue',
      logger: this.logger,
      now: () => Date.now(),
      run: () => this.processDue(),
      earliest: async () => dueTime(await this.wakeups.earliest()),
      watch: (resumeAfter) => this.wakeups.watch(resumeAfter),
      timeOf: (change) => ('fullDocument' in change ? dueTime(change.fullDocument.dueAt) : null),
    });
  }

  onApplicationBootstrap(): void {
    this.timer.start();
  }

  async onModuleDestroy(): Promise<void> {
    this.closed = true;
    await this.timer.stop();
  }

  /**
   * Runs every workspace due now, then arms the timer again. A wake-up while one is working is
   * folded into it. Tests call it to run the queue at once.
   */
  wake(): Promise<void> {
    return this.timer.wake();
  }

  private async processDue(): Promise<void> {
    for (let round = 0; round < ROUNDS_MAX && !this.closed; round += 1) {
      const due = await this.wakeups.due(new Date(), DUE_BATCH);
      if (due.length === 0) {
        return;
      }
      for (const wakeup of due) {
        const ref = { workspaceId: wakeup.workspaceId };
        await this.runner.drain(ref);
        // Work added meanwhile moved `seq`: the workspace stays due and the next round sees it.
        await this.wakeups.settle(wakeup.workspaceId, wakeup.seq, await this.runs.earliestDue(ref));
      }
    }
  }
}
