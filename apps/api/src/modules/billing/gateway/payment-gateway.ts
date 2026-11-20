import type {
  GatewayEvent,
  PaymentDeclineCode,
  PaymentProvider,
  TransferInstructions,
} from '@plp/contracts';

/*
 * The port every payment gateway plugs into (ADR-035), as the AI's (ADR-031). The gateway keeps
 * the card; the API holds its token and what the owner sees. An adapter maps its own answers and
 * errors to these types, and never logs a card number, a token or its keys.
 */

export interface MethodSetupRequest {
  /** Echoed back in the `method_saved` event: what the webhook routes it by. */
  reference: string;
  /** Where the gateway's page leads the browser once the card is entered, and when left. */
  returnUrl: string;
  cancelUrl: string;
}

export interface MethodSetup {
  /** The gateway's page that takes the card; the admin sends the browser there. */
  url: string;
}

export interface ChargeRequest {
  /** The saved card's token. */
  token: string;
  /** In đồng, VAT included. */
  amount: number;
  /** The invoice's id, echoed back in the charge's events. */
  reference: string;
  /**
   * `{invoiceId}-{attempt}`: the same key never charges twice; it answers the first charge's
   * outcome again.
   */
  idempotencyKey: string;
}

/** `pending`: the gateway decides later and says so with a `charge_*` event. */
export type ChargeResult =
  { status: 'succeeded' } | { status: 'failed'; code: PaymentDeclineCode } | { status: 'pending' };

export interface TransferRequest {
  /** The invoice's id, echoed back in `transfer_received`. */
  reference: string;
  amount: number;
}

/** Request headers with lowercase names, as Node gives them. */
export type WebhookHeaders = Readonly<Record<string, string | string[] | undefined>>;

/**
 * A webhook request the gateway did not sign (`signature`: missing, stale or wrong), or a signed
 * body that is no event the port knows (`malformed`).
 */
export class GatewayWebhookRejected extends Error {
  constructor(
    readonly reason: 'signature' | 'malformed',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'GatewayWebhookRejected';
  }
}

/**
 * The payment gateway of the API; the billing module provides the adapter `PAYMENT_PROVIDER`
 * names (`createPaymentGateway`).
 *
 * - `startMethodSetup`: the gateway's page that saves a card; it sends `method_saved`.
 * - `charge`: charges a saved card. It throws when the gateway cannot answer: the outcome is then
 *   unknown, and the same idempotency key is used again to learn it.
 * - `startTransfer`: bank transfer details for an invoice; `transfer_received` confirms it (T3).
 * - `parseWebhook`: checks the signature over the exact bytes received, in constant time, and
 *   returns the event; throws `GatewayWebhookRejected` otherwise.
 */
export abstract class PaymentGateway {
  abstract readonly provider: PaymentProvider;
  abstract startMethodSetup(request: MethodSetupRequest): Promise<MethodSetup>;
  abstract charge(request: ChargeRequest): Promise<ChargeResult>;
  abstract startTransfer(request: TransferRequest): Promise<TransferInstructions>;
  abstract parseWebhook(rawBody: Buffer, headers: WebhookHeaders): Promise<GatewayEvent>;
}
