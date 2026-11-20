import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHARGE_HOLD_MS, CHARGE_TIMEOUT_MS } from '../invoice-charges.service.js';
import { chargeWithTimeout, GatewayTimeout, type LateChargeAnswer } from './charge-with-timeout.js';
import type { ChargeRequest, ChargeResult } from './payment-gateway.js';

const REQUEST: ChargeRequest = {
  token: 'tok_fake_succeeds_0000000000000000',
  amount: 357_000,
  reference: '674000000000000000000abc',
  idempotencyKey: '674000000000000000000abc-1',
};

/** A gateway whose answer the test gives when it wants to. */
function slowGateway() {
  let answer: (result: ChargeResult) => void = () => undefined;
  let fail: (error: unknown) => void = () => undefined;
  const charge = vi.fn(
    () =>
      new Promise<ChargeResult>((resolve, reject) => {
        answer = resolve;
        fail = reject;
      }),
  );
  return {
    gateway: { charge },
    answer: (result: ChargeResult) => {
      answer(result);
    },
    fail: (error: unknown) => {
      fail(error);
    },
  };
}

describe('chargeWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ends well within the hold of the charge', () => {
    expect(CHARGE_TIMEOUT_MS).toBeLessThanOrEqual(CHARGE_HOLD_MS / 2);
  });

  it('answers what the gateway answers in time', async () => {
    const { gateway, answer } = slowGateway();
    const late = vi.fn();
    const charged = chargeWithTimeout(gateway, REQUEST, 1000, late);
    answer({ status: 'succeeded' });

    await expect(charged).resolves.toEqual({ status: 'succeeded' });
    expect(gateway.charge).toHaveBeenCalledWith(REQUEST);
    await vi.advanceTimersByTimeAsync(5000);
    expect(late).not.toHaveBeenCalled();
  });

  it('passes on a gateway that fails in time', async () => {
    const { gateway, fail } = slowGateway();
    const late = vi.fn();
    const charged = chargeWithTimeout(gateway, REQUEST, 1000, late);
    const error = new Error('socket hang up');
    fail(error);

    await expect(charged).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(5000);
    expect(late).not.toHaveBeenCalled();
  });

  it('gives up on a gateway that hangs, and reports what it answers later', async () => {
    const { gateway, answer } = slowGateway();
    const late: LateChargeAnswer[] = [];
    const charged = chargeWithTimeout(gateway, REQUEST, 1000, (item) => {
      late.push(item);
    });
    const outcome = expect(charged).rejects.toBeInstanceOf(GatewayTimeout);
    await vi.advanceTimersByTimeAsync(1000);
    await outcome;

    answer({ status: 'succeeded' });
    await vi.waitFor(() => {
      expect(late).toEqual([{ result: { status: 'succeeded' } }]);
    });
  });

  it('reports a late failure without an unhandled rejection', async () => {
    const { gateway, fail } = slowGateway();
    const late: LateChargeAnswer[] = [];
    const charged = chargeWithTimeout(gateway, REQUEST, 1000, (item) => {
      late.push(item);
    });
    const outcome = expect(charged).rejects.toBeInstanceOf(GatewayTimeout);
    await vi.advanceTimersByTimeAsync(1000);
    await outcome;

    const error = new Error('connection reset');
    fail(error);
    await vi.waitFor(() => {
      expect(late).toEqual([{ error }]);
    });
  });
});
