import { type GatewayEvent, gatewayEventSchema, type TransferInstructions } from '@plp/contracts';
import {
  type ChargeRequest,
  type ChargeResult,
  GatewayWebhookRejected,
  type MethodSetup,
  type MethodSetupRequest,
  PaymentGateway,
  type TransferRequest,
  type WebhookHeaders,
} from '../payment-gateway.js';
import {
  behaviourOfFakeToken,
  FAKE_SETUP_SESSION_SECONDS,
  FAKE_SIGNATURE_HEADER,
  type FakeSetupSession,
  fakeWebhookRequest,
  mintFakeSetupSession,
  readFakeSetupSession,
  verifyFakeWebhook,
} from './fake-gateway-protocol.js';

/** Charges remembered by idempotency key; the oldest are forgotten past this many. */
const REMEMBERED_CHARGES = 10_000;

export interface FakePaymentGatewayOptions {
  /** Signs webhooks and card page sessions (`PAYMENT_WEBHOOK_SECRET`). */
  secret: string;
  /** Absolute URL of `FAKE_GATEWAY_PATH` as the browser reaches it. */
  pagesUrl: string;
  /** Real time in milliseconds; signatures never follow the billing test clock. */
  now?: () => number;
}

/**
 * The fake gateway (`PAYMENT_PROVIDER=fake`, ADR-035), for development, tests and E2E; refused in
 * production. The test card's token decides each charge at once: 4242 4242 4242 4242 succeeds,
 * 4000 0000 0000 0002 is declined, 4000 0000 0000 9995 lacks funds. Its card page and transfer
 * page are served by the API under `FAKE_GATEWAY_PATH`, and post their events signed as a real
 * gateway would. Charges are remembered per process, which is enough for one API in tests.
 */
export class FakePaymentGateway extends PaymentGateway {
  readonly provider = 'fake' as const;
  private readonly charges = new Map<string, ChargeResult>();
  private readonly now: () => number;

  constructor(private readonly options: FakePaymentGatewayOptions) {
    super();
    this.now = options.now ?? Date.now;
  }

  startMethodSetup(request: MethodSetupRequest): Promise<MethodSetup> {
    const session = mintFakeSetupSession(this.options.secret, {
      reference: request.reference,
      returnUrl: request.returnUrl,
      cancelUrl: request.cancelUrl,
      expiresAt: Math.floor(this.now() / 1000) + FAKE_SETUP_SESSION_SECONDS,
    });
    const url = new URL(`${this.options.pagesUrl}/setup`);
    url.searchParams.set('session', session);
    return Promise.resolve({ url: url.toString() });
  }

  charge(request: ChargeRequest): Promise<ChargeResult> {
    const earlier = this.charges.get(request.idempotencyKey);
    if (earlier !== undefined) {
      return Promise.resolve(earlier);
    }
    const result = this.decide(request.token);
    this.charges.set(request.idempotencyKey, result);
    if (this.charges.size > REMEMBERED_CHARGES) {
      const oldest = this.charges.keys().next();
      if (oldest.done !== true) {
        this.charges.delete(oldest.value);
      }
    }
    return Promise.resolve(result);
  }

  startTransfer(request: TransferRequest): Promise<TransferInstructions> {
    return Promise.resolve({
      bankName: 'Ngân hàng thử (cổng thanh toán giả)',
      accountNumber: '0000000000',
      accountName: 'PAYLOAD LANDING PAGE',
      content: `PLP ${request.reference}`,
      amount: request.amount,
      qrPayload: null,
    });
  }

  parseWebhook(rawBody: Buffer, headers: WebhookHeaders): Promise<GatewayEvent> {
    const header = headers[FAKE_SIGNATURE_HEADER];
    const check = verifyFakeWebhook(
      this.options.secret,
      rawBody,
      typeof header === 'string' ? header : undefined,
      Math.floor(this.now() / 1000),
    );
    if (!check.ok) {
      return Promise.reject(
        new GatewayWebhookRejected('signature', `Fake gateway signature ${check.reason}`),
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(rawBody.toString('utf8'));
    } catch (error) {
      return Promise.reject(
        new GatewayWebhookRejected('malformed', 'The event is not JSON', { cause: error }),
      );
    }
    const event = gatewayEventSchema.safeParse(json);
    if (!event.success) {
      return Promise.reject(
        new GatewayWebhookRejected('malformed', 'The body is not a gateway event', {
          cause: event.error,
        }),
      );
    }
    return Promise.resolve(event.data);
  }

  /** The signed request for `event`, as the fake gateway's pages post it to the webhook. */
  webhookRequest(event: GatewayEvent): { body: string; headers: Record<string, string> } {
    return fakeWebhookRequest(this.options.secret, event, this.now());
  }

  /** The setup a card page was opened for; null when its link was changed or expired. */
  setupSession(token: string): FakeSetupSession | null {
    return readFakeSetupSession(this.options.secret, token, Math.floor(this.now() / 1000));
  }

  private decide(token: string): ChargeResult {
    switch (behaviourOfFakeToken(token)) {
      case 'succeeds':
        return { status: 'succeeded' };
      case 'insufficient_funds':
        return { status: 'failed', code: 'insufficient_funds' };
      case 'card_declined':
      case null:
        // A real gateway declines a token it never gave, too.
        return { status: 'failed', code: 'card_declined' };
    }
  }
}
