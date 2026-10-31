/** Thrown by `TaskLimiter.run` when as many tasks are waiting as the limiter allows. */
export class TooManyWaitingError extends Error {
  constructor() {
    super('Too many tasks are waiting');
    this.name = 'TooManyWaitingError';
  }
}

export interface TaskLimits {
  /** Tasks that run at the same time. */
  running: number;
  /** Tasks that may wait for a slot; one more is refused at once. */
  waiting: number;
}

/**
 * Runs heavy tasks a few at a time, in arrival order, within one process. A waiting task still
 * holds what it was given (an upload's bytes), so the queue is bounded too.
 */
export class TaskLimiter {
  private active = 0;
  private readonly queue: (() => void)[] = [];

  constructor(private readonly limits: TaskLimits) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active < this.limits.running) {
      this.active += 1;
    } else if (this.queue.length < this.limits.waiting) {
      // The task that ends hands its slot over, so `active` stays as it is.
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    } else {
      throw new TooManyWaitingError();
    }
    try {
      return await task();
    } finally {
      const next = this.queue.shift();
      if (next === undefined) {
        this.active -= 1;
      } else {
        next();
      }
    }
  }
}
