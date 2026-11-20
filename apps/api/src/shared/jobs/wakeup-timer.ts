import type { Logger } from '@nestjs/common';
import type { mongo } from 'mongoose';

/** The longest `setTimeout` takes; a later time is armed again when this one fires. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/** A change stream whose events may name an earlier time for the work. */
export type WakeupStream<TDoc extends mongo.Document> = mongo.ChangeStream<
  TDoc,
  mongo.ChangeStreamDocument<TDoc>
>;

export interface WakeupTimerOptions<TDoc extends mongo.Document> {
  /** What the logs call the work. */
  name: string;
  logger: Logger;
  /** The clock the due times are on, in milliseconds. */
  now: () => number;
  /** Runs the work due now; the timer is armed again after it. */
  run: () => Promise<void>;
  /** The earliest time work is due; null when none is. */
  earliest: () => Promise<Date | null>;
  /** Watches the changes that may bring work earlier, from `resumeAfter` when a stream closed. */
  watch: (resumeAfter?: mongo.ResumeToken) => WakeupStream<TDoc>;
  /** The time a change brings the work to; null when it names none. */
  timeOf: (change: mongo.ChangeStreamDocument<TDoc>) => Date | null;
}

/**
 * The timer of a job queue in MongoDB (ADR-034): set to the earliest due time, and brought forward
 * by a change stream when any instance adds earlier work. No polling. A wake-up while the work
 * runs is folded into it. A stream that closes opens again from its resume token; one that
 * cannot reads the earliest time again and starts a new stream.
 */
export class WakeupTimer<TDoc extends mongo.Document> {
  private timer: NodeJS.Timeout | null = null;
  private armedFor: number | null = null;
  private stream: WakeupStream<TDoc> | null = null;
  /** Where a closed stream picks up again; null once a fresh stream must start. */
  private resume: { token: mongo.ResumeToken } | null = null;
  private working: Promise<void> | null = null;
  private again = false;
  private closed = false;

  constructor(private readonly options: WakeupTimerOptions<TDoc>) {}

  /** Opens the stream and arms the timer to the earliest work: work due already runs at once. */
  start(): void {
    this.open();
    void this.arm();
  }

  async stop(): Promise<void> {
    this.closed = true;
    this.clear();
    await this.stream?.close();
    await this.working;
  }

  /** Runs the work due now, then arms the timer again. */
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
        await this.options.run();
      } while (this.wokenAgain());
    } catch (error) {
      this.options.logger.error({ err: error }, `Running the ${this.options.name} failed`);
    }
    await this.arm();
  }

  /** A wake-up came while the last round worked. */
  private wokenAgain(): boolean {
    return this.again && !this.closed;
  }

  private async arm(): Promise<void> {
    if (this.closed) {
      return;
    }
    try {
      const at = await this.options.earliest();
      if (at !== null) {
        this.setTimer(at);
      }
    } catch (error) {
      this.options.logger.error(
        { err: error },
        `Reading the time of the ${this.options.name} failed`,
      );
    }
  }

  /** Sets the timer to `at` unless it already fires sooner. */
  private setTimer(at: Date): void {
    if (this.closed) {
      return;
    }
    if (this.timer !== null && this.armedFor !== null && this.armedFor <= at.getTime()) {
      return;
    }
    this.clear();
    this.armedFor = at.getTime();
    const delay = Math.min(Math.max(0, at.getTime() - this.options.now()), MAX_TIMER_MS);
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

  private open(): void {
    if (this.closed) {
      return;
    }
    let stream: WakeupStream<TDoc>;
    try {
      stream = this.options.watch(this.resume?.token);
    } catch (error) {
      // The token is too old or the stream cannot start: read the time again and start afresh.
      this.options.logger.error({ err: error }, `Watching the ${this.options.name} failed`);
      this.resume = null;
      void this.arm();
      setTimeout(() => {
        this.open();
      }, 1000).unref();
      return;
    }
    this.stream = stream;
    stream.on('change', (change: mongo.ChangeStreamDocument<TDoc>) => {
      this.resume = { token: change._id };
      const at = this.options.timeOf(change);
      if (at !== null) {
        this.setTimer(at);
      }
    });
    stream.on('error', (error: unknown) => {
      this.options.logger.warn(
        { err: error },
        `The stream of the ${this.options.name} failed; opening it again`,
      );
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
