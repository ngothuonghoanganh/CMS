import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { AutomationRunner } from './automation-runner.service.js';
import { AutomationRunsRepository } from './automation-runs.repository.js';
import { NOTHING_DUE } from './job-wakeup.schema.js';
import {
  JobWakeupsRepository,
  type WakeupChange,
  type WakeupResumeToken,
  type WakeupStream,
} from './job-wakeups.repository.js';

/** The longest `setTimeout` takes; a later time is armed again when this one fires. */
const MAX_TIMER_MS = 2 ** 31 - 1;
/** Workspaces handled per read of the due ones. */
const DUE_BATCH = 20;
/** Rounds of due workspaces per wake-up, so new work never keeps one wake-up running forever. */
const ROUNDS_MAX = 10;

/**
 * The queue's clock (ADR-034), one per API instance: a timer set to the earliest due time in the
 * master's `job_wakeups`, and a change stream on it that brings the timer forward when any
 * instance adds earlier work. No polling. At startup it reads the earliest time, so work due
 * while the API was down runs at once.
 */
@Injectable()
export class AutomationScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AutomationScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private armedFor: number | null = null;
  private stream: WakeupStream | null = null;
  /** Where a closed stream picks up again; null once a fresh stream must start. */
  private resume: { token: WakeupResumeToken } | null = null;
  private working: Promise<void> | null = null;
  private again = false;
  private closed = false;

  constructor(
    private readonly wakeups: JobWakeupsRepository,
    private readonly runs: AutomationRunsRepository,
    private readonly runner: AutomationRunner,
  ) {}

  onApplicationBootstrap(): void {
    this.open();
    void this.arm();
  }

  async onModuleDestroy(): Promise<void> {
    this.closed = true;
    this.clear();
    await this.stream?.close();
    await this.working;
  }

  /**
   * Runs every workspace due now, then arms the timer again. A wake-up while one is working is
   * folded into it. Tests call it to run the queue at once.
   */
  wake(): Promise<void> {
    if (this.working !== null) {
      this.again = true;
      return this.working;
    }
    this.working = this.work().finally(() => {
      this.working = null;
    });
    return this.working;
  }

  private async work(): Promise<void> {
    this.clear();
    try {
      do {
        this.again = false;
        await this.processDue();
      } while (this.wokenAgain());
    } catch (error) {
      this.logger.error({ err: error }, 'Running the automation queue failed');
    }
    await this.arm();
  }

  /** A wake-up came while the last round worked. */
  private wokenAgain(): boolean {
    return this.again && !this.closed;
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

  private async arm(): Promise<void> {
    if (this.closed) {
      return;
    }
    try {
      this.setTimer(await this.wakeups.earliest());
    } catch (error) {
      this.logger.error({ err: error }, 'Reading the automation queue time failed');
    }
  }

  /** Sets the timer to `at` unless it already fires sooner. */
  private setTimer(at: Date): void {
    if (this.closed || at.getTime() >= NOTHING_DUE.getTime()) {
      return;
    }
    if (this.timer !== null && this.armedFor !== null && this.armedFor <= at.getTime()) {
      return;
    }
    this.clear();
    this.armedFor = at.getTime();
    const delay = Math.min(Math.max(0, at.getTime() - Date.now()), MAX_TIMER_MS);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.armedFor = null;
      void this.wake();
    }, delay);
    this.timer.unref();
  }

  private clear(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = null;
    this.armedFor = null;
  }

  /**
   * Watches `job_wakeups`. A stream that closes opens again from its resume token; one that cannot
   * reads the earliest time again and starts a new stream.
   */
  private open(): void {
    if (this.closed) {
      return;
    }
    let stream: WakeupStream;
    try {
      stream = this.wakeups.watch(this.resume?.token);
    } catch (error) {
      // The token is too old or the stream cannot start: read the time again and start afresh.
      this.logger.error({ err: error }, 'Watching the automation queue failed');
      this.resume = null;
      void this.arm();
      setTimeout(() => {
        this.open();
      }, 1000).unref();
      return;
    }
    this.stream = stream;
    stream.on('change', (change: WakeupChange) => {
      this.resume = { token: change._id };
      if ('fullDocument' in change) {
        this.setTimer(change.fullDocument.dueAt);
      }
    });
    stream.on('error', (error: unknown) => {
      this.logger.warn({ err: error }, 'The automation queue stream failed; opening it again');
      void stream.close();
    });
    stream.on('close', () => {
      if (this.closed || this.stream !== stream) {
        return;
      }
      this.stream = null;
      setTimeout(() => {
        if (this.resume === null) {
          void this.arm();
        }
        this.open();
      }, 1000).unref();
    });
  }
}
