import type { ChargeRequest, ChargeResult, PaymentGateway } from './payment-gateway.js';

/** The gateway did not answer a charge in time, so its outcome is unknown (ADR-035). */
export class GatewayTimeout extends Error {
  constructor(readonly timeoutMs: number) {
    super(`The payment gateway did not answer a charge within ${String(timeoutMs)} ms`);
    this.name = 'GatewayTimeout';
  }
}

/** What a charge that ran out of time answered after all. */
export type LateChargeAnswer = { result: ChargeResult } | { error: unknown };

/**
 * Charges through `gateway`, or rejects with `GatewayTimeout` after `timeoutMs`. The charge holds
 * the workspace for a fixed time, so the call must end while the hold is still on: a gateway that
 * hangs then ends as an unknown outcome, and the next attempt asks again with the same idempotency
 * key. The port takes no signal, so the call itself goes on; whatever it answers after the timeout
 * goes to `onLate`, never to an unhandled rejection.
 */
export async function chargeWithTimeout(
  gateway: Pick<PaymentGateway, 'charge'>,
  request: ChargeRequest,
  timeoutMs: number,
  onLate: (answer: LateChargeAnswer) => void,
): Promise<ChargeResult> {
  const call = gateway.charge(request);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new GatewayTimeout(timeoutMs));
      call.then(
        (result) => {
          onLate({ result });
        },
        (error: unknown) => {
          onLate({ error });
        },
      );
    }, timeoutMs);
  });
  try {
    return await Promise.race([call, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
