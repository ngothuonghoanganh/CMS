import { randomUUID } from 'node:crypto';
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
import { vietQrPayload } from '../../domain/transfer-qr.js';
import {
  behaviourOfFakeToken,
  FAKE_SETUP_SESSION_SECONDS,
  FAKE_SIGNATURE_HEADER,
  FAKE_TRANSFER_ACCOUNT,
  FAKE_TRANSFER_SESSION_SECONDS,
  type FakeSetupSession,
  type FakeTransferSession,
  fakeWebhookRequest,
  mintFakeSetupSession,
  mintFakeTransferSession,
  readFakeSetupSession,
  readFakeTransferSession,
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
 * gateway would; the transfer page's "Xác nhận đã nhận tiền" stands for the bank. Charges and
 * confirmed transfers are remembered per process, which is enough for one API in tests.
 */
export class FakePaymentGateway extends PaymentGateway {
  readonly provider = 'fake' as const;
  private readonly charges = new Map<string, ChargeResult>();
  /** Ids of the setup sessions a card was saved with, until they expire (Unix seconds). */
  private readonly usedSetups = new Map<string, number>();
  /** Ids of the transfer sessions confirmed, until they expire (Unix seconds). */
  private readonly confirmedTransfers = new Map<string, number>();
  private readonly now: () => number;

  constructor(private readonly options: FakePaymentGatewayOptions) {
    super();
    this.now = options.now ?? (() => Date.now());
  }

  startMethodSetup(request: MethodSetupRequest): Promise<MethodSetup> {
    const session = mintFakeSetupSession(this.options.secret, {
      id: randomUUID(),
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

  /**
   * The fake bank account, a content naming the invoice, its VietQR and the page that confirms the
   * transfer as the bank would. The same invoice always gets the same account and content.
   */
  startTransfer(request: TransferRequest): Promise<TransferInstructions> {
    const content = `PLP ${request.invoiceNumber}`;
    const session = mintFakeTransferSession(this.options.secret, {
      id: randomUUID(),
      reference: request.reference,
      amount: request.amount,
      content,
      returnUrl: request.returnUrl,
      expiresAt: Math.floor(this.now() / 1000) + FAKE_TRANSFER_SESSION_SECONDS,
    });
    const page = new URL(`${this.options.pagesUrl}/transfer`);
    page.searchParams.set('session', session);
    return Promise.resolve({
      bankName: FAKE_TRANSFER_ACCOUNT.bankName,
      accountNumber: FAKE_TRANSFER_ACCOUNT.accountNumber,
      accountName: FAKE_TRANSFER_ACCOUNT.accountName,
      content,
      amount: request.amount,
      qrPayload: vietQrPayload({
        bankBin: FAKE_TRANSFER_ACCOUNT.bankBin,
        accountNumber: FAKE_TRANSFER_ACCOUNT.accountNumber,
        amount: request.amount,
        content,
      }),
      pageUrl: page.toString(),
    });
  }

  /** The transfer a confirmation page was opened for; null when its link was changed or expired. */
  transferSession(token: string): FakeTransferSession | null {
    return readFakeTransferSession(this.options.secret, token, Math.floor(this.now() / 1000));
  }

  /**
   * Takes the transfer `session` for one confirmation; false when it was confirmed already, so the
   * page reached again (the browser's Back, a second click) never sends a second transfer.
   * `releaseTransfer` gives it back when the event was not delivered.
   */
  claimTransfer(session: FakeTransferSession): boolean {
    const now = Math.floor(this.now() / 1000);
    for (const [confirmed, expiresAt] of this.confirmedTransfers) {
      if (expiresAt <= now) {
        this.confirmedTransfers.delete(confirmed);
      }
    }
    if (this.confirmedTransfers.has(session.id)) {
      return false;
    }
    this.confirmedTransfers.set(session.id, session.expiresAt);
    return true;
  }

  releaseTransfer(session: FakeTransferSession): void {
    this.confirmedTransfers.delete(session.id);
  }

  /** Whether the transfer of this session was confirmed. */
  transferConfirmed(session: FakeTransferSession): boolean {
    return this.confirmedTransfers.has(session.id);
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

  /**
   * Takes the setup `session` for one card; false when a card was saved with it already. A
   * session saves one card, as a real gateway's does, so its page reached again (the browser's
   * Back) never takes a second one. `releaseSetup` gives it back when the card was not saved.
   */
  claimSetup(session: FakeSetupSession): boolean {
    const now = Math.floor(this.now() / 1000);
    for (const [used, expiresAt] of this.usedSetups) {
      if (expiresAt <= now) {
        this.usedSetups.delete(used);
      }
    }
    if (this.usedSetups.has(session.id)) {
      return false;
    }
    this.usedSetups.set(session.id, session.expiresAt);
    return true;
  }

  releaseSetup(session: FakeSetupSession): void {
    this.usedSetups.delete(session.id);
  }

  /** Whether a card was saved with this setup session. */
  setupUsed(session: FakeSetupSession): boolean {
    return this.usedSetups.has(session.id);
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
