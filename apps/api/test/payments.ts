import { randomUUID } from 'node:crypto';
import {
  endpoints,
  type GatewayEvent,
  IDEMPOTENCY_KEY_HEADER,
  type InvoiceListResponse,
  invoiceListResponseSchema,
  methodSetupResponseSchema,
} from '@plp/contracts';
import request from 'supertest';
import { fakeCardTokenFor } from '../src/modules/billing/gateway/fake/fake-gateway-protocol.js';
import { FakePaymentGateway } from '../src/modules/billing/gateway/fake/fake-payment-gateway.js';
import { PaymentGateway } from '../src/modules/billing/gateway/payment-gateway.js';
import type { TestApp } from './app.js';
import type { TestClient } from './client.js';

/** The test cards of the fake gateway (ADR-035). */
export const CARD_OK = '4242 4242 4242 4242';
export const CARD_DECLINED = '4000 0000 0000 0002';
export const CARD_NO_FUNDS = '4000 0000 0000 9995';

/** The fake gateway of a test app (`PAYMENT_PROVIDER` unset outside production). */
export function fakeGateway(t: TestApp): FakePaymentGateway {
  const gateway = t.app.get(PaymentGateway);
  if (!(gateway instanceof FakePaymentGateway)) {
    throw new Error('The test app does not use the fake payment gateway');
  }
  return gateway;
}

let events = 0;

/** A gateway event id no test used before. */
export function newEventId(): string {
  events += 1;
  return `evt_test_${process.pid}_${events}_${randomUUID()}`;
}

/** Posts `event` to the webhook signed as the fake gateway signs it, or with `headers` instead. */
export function postGatewayEvent(
  t: TestApp,
  event: GatewayEvent,
  options: { provider?: string; headers?: Record<string, string>; body?: string } = {},
): request.Test {
  const signed = fakeGateway(t).webhookRequest(event);
  return request(t.app.getHttpServer())
    .post(endpoints.paymentGatewayWebhook.path(options.provider ?? 'fake'))
    .set(options.headers ?? signed.headers)
    .send(options.body ?? signed.body);
}

/**
 * Adds a test card as the owner does: asks for the gateway's page, which the fake gateway's page
 * would then post as `method_saved` with the reference of its signed session. The card number
 * only becomes a token.
 */
export async function addCard(
  t: TestApp,
  owner: TestClient,
  workspaceId: string,
  cardNumber: string = CARD_OK,
  expiry: { expMonth: number; expYear: number } = { expMonth: 12, expYear: 2035 },
): Promise<GatewayEvent> {
  const setup = methodSetupResponseSchema.parse(
    (
      await owner
        .post(endpoints.startPaymentMethodSetup.path(workspaceId), { returnTo: 'payments' })
        .expect(200)
    ).body,
  );
  const session = fakeGateway(t).setupSession(new URL(setup.url).searchParams.get('session') ?? '');
  const card = fakeCardTokenFor(cardNumber);
  if (session === null || card === null) {
    throw new Error('The fake gateway gave no setup session, or the card is not a test card');
  }
  const event: GatewayEvent = {
    kind: 'method_saved',
    eventId: newEventId(),
    occurredAt: new Date().toISOString(),
    reference: session.reference,
    method: { token: card.token, brand: card.brand, last4: card.last4, ...expiry },
  };
  await postGatewayEvent(t, event).expect(200);
  return event;
}

/** "Thanh toán lại" of an invoice with an `Idempotency-Key`. */
export function payInvoice(
  owner: TestClient,
  workspaceId: string,
  invoiceId: string,
  key: string = randomUUID(),
): request.Test {
  return owner
    .post(endpoints.payInvoice.path(workspaceId, invoiceId))
    .set(IDEMPOTENCY_KEY_HEADER, key);
}

export async function invoicesOf(
  owner: TestClient,
  workspaceId: string,
): Promise<InvoiceListResponse> {
  return invoiceListResponseSchema.parse(
    (await owner.get(endpoints.listInvoices.path(workspaceId)).expect(200)).body,
  );
}
