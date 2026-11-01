import { describe, expect, it } from 'vitest';
import { TaskLimiter, TooManyWaitingError } from './task-limiter.js';

function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets every settled promise run its callbacks. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('TaskLimiter', () => {
  it('runs one task at a time, in the order they came', async () => {
    const limiter = new TaskLimiter({ running: 1, waiting: 5 });
    const started: string[] = [];
    const gates = { a: deferred(), b: deferred(), c: deferred() };
    const runs = (['a', 'b', 'c'] as const).map((name) =>
      limiter.run(async () => {
        started.push(name);
        await gates[name].promise;
        return name;
      }),
    );
    await settle();
    expect(started).toEqual(['a']);

    gates.a.resolve();
    await settle();
    expect(started).toEqual(['a', 'b']);
    gates.b.resolve();
    gates.c.resolve();
    expect(await Promise.all(runs)).toEqual(['a', 'b', 'c']);
  });

  it('refuses a task at once when as many are waiting as allowed', async () => {
    const limiter = new TaskLimiter({ running: 1, waiting: 1 });
    const gate = deferred();
    const running = limiter.run(() => gate.promise);
    const waiting = limiter.run(() => Promise.resolve('waited'));

    await expect(limiter.run(() => Promise.resolve('refused'))).rejects.toBeInstanceOf(
      TooManyWaitingError,
    );
    gate.resolve();
    await running;
    expect(await waiting).toBe('waited');
  });

  it('frees the slot of a task that failed', async () => {
    const limiter = new TaskLimiter({ running: 1, waiting: 0 });
    await expect(limiter.run(() => Promise.reject(new Error('decode failed')))).rejects.toThrow(
      'decode failed',
    );
    expect(await limiter.run(() => Promise.resolve('next'))).toBe('next');
  });

  it('hands the slot to the next waiting task when one fails', async () => {
    const limiter = new TaskLimiter({ running: 1, waiting: 2 });
    const gate = deferred();
    const failing = limiter.run(() => gate.promise);
    const next = limiter.run(() => Promise.resolve('next'));
    gate.reject(new Error('decode failed'));
    await expect(failing).rejects.toThrow('decode failed');
    expect(await next).toBe('next');
    expect(await limiter.run(() => Promise.resolve('after'))).toBe('after');
  });
});
