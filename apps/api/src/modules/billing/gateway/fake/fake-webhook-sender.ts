import { Injectable } from '@nestjs/common';
import type { GatewayEvent } from '@plp/contracts';
import type { Env } from '../../../../config/env.js';
import { InjectEnv } from '../../../../shared/env.js';
import { PaymentGateway } from '../payment-gateway.js';
import { FakePaymentGateway } from './fake-payment-gateway.js';

/** Attempts and the waits between them: a real gateway retries too, but the fake stays quick. */
export const FAKE_WEBHOOK_RETRY_DELAYS_MS: readonly number[] = [100, 300];

const DELIVERY_TIMEOUT_MS = 5000;

export class FakeWebhookDeliveryFailed extends Error {}

/**
 * Posts the fake gateway's events to the API's own webhook, signed as it signs them. The card
 * page awaits `send` before it sends the browser back, so the events are as good as asynchronous
 * for the API but arrive in a fixed order for tests. A failed post is retried; only when every
 * attempt fails does it throw.
 */
@Injectable()
export class FakeWebhookSender {
  private baseUrl: string;
  private retryDelaysMs: readonly number[] = FAKE_WEBHOOK_RETRY_DELAYS_MS;

  constructor(
    private readonly gateway: PaymentGateway,
    @InjectEnv() env: Pick<Env, 'API_PORT'>,
  ) {
    this.baseUrl = `http://127.0.0.1:${env.API_PORT}`;
  }

  /** For tests, whose API listens on a port of its own. */
  target(baseUrl: string, retryDelaysMs: readonly number[] = FAKE_WEBHOOK_RETRY_DELAYS_MS): void {
    this.baseUrl = baseUrl;
    this.retryDelaysMs = retryDelaysMs;
  }

  async send(event: GatewayEvent): Promise<void> {
    if (!(this.gateway instanceof FakePaymentGateway)) {
      throw new Error('The fake webhook sender needs PAYMENT_PROVIDER=fake');
    }
    let failure: unknown;
    for (let attempt = 0; attempt <= this.retryDelaysMs.length; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.retryDelaysMs[attempt - 1]));
      }
      // Signed again for each attempt: the timestamp must stay inside the tolerance.
      const signed = this.gateway.webhookRequest(event);
      try {
        const response = await fetch(`${this.baseUrl}/public/billing/webhooks/fake`, {
          method: 'POST',
          headers: signed.headers,
          body: signed.body,
          signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
        });
        if (response.ok) {
          return;
        }
        failure = new Error(`The webhook answered ${response.status}`);
      } catch (error) {
        failure = error;
      }
    }
    throw new FakeWebhookDeliveryFailed('The fake gateway could not deliver its event', {
      cause: failure,
    });
  }
}
