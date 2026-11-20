import type { GatewayEvent, TransferInstructions } from '@plp/contracts';
import {
  type ChargeResult,
  type MethodSetup,
  PaymentGateway,
  GatewayWebhookRejected,
} from './payment-gateway.js';

/**
 * `PAYMENT_PROVIDER=none`: payments are off. Services answer 503 `payments_disabled` before they
 * reach it, and the webhook route answers 404, so a call here is a bug.
 */
export class DisabledPaymentGateway extends PaymentGateway {
  readonly provider = 'none' as const;

  startMethodSetup(): Promise<MethodSetup> {
    return Promise.reject(new Error('Payments are off (PAYMENT_PROVIDER=none)'));
  }

  charge(): Promise<ChargeResult> {
    return Promise.reject(new Error('Payments are off (PAYMENT_PROVIDER=none)'));
  }

  startTransfer(): Promise<TransferInstructions> {
    return Promise.reject(new Error('Payments are off (PAYMENT_PROVIDER=none)'));
  }

  parseWebhook(): Promise<GatewayEvent> {
    return Promise.reject(
      new GatewayWebhookRejected('signature', 'Payments are off (PAYMENT_PROVIDER=none)'),
    );
  }
}
