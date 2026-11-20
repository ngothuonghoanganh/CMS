import type { GatewayEvent } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { GatewayWebhookRejected } from '../payment-gateway.js';
import {
  FAKE_SIGNATURE_HEADER,
  fakeCardTokenFor,
  signFakeWebhook,
  verifyFakeWebhook,
} from './fake-gateway-protocol.js';
import { FakePaymentGateway } from './fake-payment-gateway.js';

const SECRET = 'fake-gateway-test-secret-0123456789abcdef';
const NOW = Date.parse('2026-11-21T03:00:00.000Z');
const PAGES = 'http://localhost:3100/api/public/billing/fake-gateway';

function gateway(now = () => NOW): FakePaymentGateway {
  return new FakePaymentGateway({ secret: SECRET, pagesUrl: PAGES, now });
}

function tokenOf(cardNumber: string): string {
  const card = fakeCardTokenFor(cardNumber);
  if (card === null) {
    throw new Error(`${cardNumber} is not a test card`);
  }
  return card.token;
}

const methodSaved: GatewayEvent = {
  kind: 'method_saved',
  eventId: 'evt_1',
  occurredAt: new Date(NOW).toISOString(),
  reference: 'ws_674000000000000000000001_by_674000000000000000000002',
  method: {
    token: 'tok_fake_succeeds_0123456789abcdef',
    brand: 'visa',
    last4: '4242',
    expMonth: 12,
    expYear: 2030,
  },
};

describe('the fake gateway’s test cards', () => {
  it('give a token that never holds the number', () => {
    const card = fakeCardTokenFor('4242 4242 4242 4242');
    expect(card).toMatchObject({ brand: 'visa', last4: '4242' });
    expect(card?.token).toMatch(/^tok_fake_succeeds_[a-f0-9]{16}$/);
    expect(card?.token).not.toContain('4242424242424242');
    expect(fakeCardTokenFor('4000-0000-0000-0002')?.last4).toBe('0002');
    expect(fakeCardTokenFor('5555 5555 5555 4444')).toBeNull();
  });

  it('decide each charge: 4242 succeeds, 0002 is declined, 9995 lacks funds', async () => {
    const fake = gateway();
    const charge = (cardNumber: string, key: string) =>
      fake.charge({
        token: tokenOf(cardNumber),
        amount: 1_490_000,
        reference: 'inv',
        idempotencyKey: key,
      });
    expect(await charge('4242424242424242', 'a-1')).toEqual({ status: 'succeeded' });
    expect(await charge('4000000000000002', 'b-1')).toEqual({
      status: 'failed',
      code: 'card_declined',
    });
    expect(await charge('4000000000009995', 'c-1')).toEqual({
      status: 'failed',
      code: 'insufficient_funds',
    });
    expect(
      await fake.charge({
        token: 'tok_other',
        amount: 1000,
        reference: 'inv',
        idempotencyKey: 'd-1',
      }),
    ).toEqual({ status: 'failed', code: 'card_declined' });
  });

  it('answer an idempotency key used before with its first outcome', async () => {
    const fake = gateway();
    const first = await fake.charge({
      token: tokenOf('4000000000000002'),
      amount: 1000,
      reference: 'inv',
      idempotencyKey: 'inv-1',
    });
    const again = await fake.charge({
      token: tokenOf('4242424242424242'),
      amount: 1000,
      reference: 'inv',
      idempotencyKey: 'inv-1',
    });
    expect(again).toEqual(first);
  });
});

describe('the fake gateway’s card page', () => {
  it('opens with a signed session that leads back to the admin', async () => {
    const fake = gateway();
    const { url } = await fake.startMethodSetup({
      reference: methodSaved.reference,
      returnUrl: 'http://localhost:3100/workspaces/1/billing/payments?paymentMethod=saved',
      cancelUrl: 'http://localhost:3100/workspaces/1/billing/payments?paymentMethod=canceled',
    });
    expect(url.startsWith(`${PAGES}/setup?session=`)).toBe(true);
    const session = new URL(url).searchParams.get('session') ?? '';
    expect(fake.setupSession(session)).toMatchObject({
      reference: methodSaved.reference,
      returnUrl: 'http://localhost:3100/workspaces/1/billing/payments?paymentMethod=saved',
    });
    // A changed session, or one past 30 minutes, opens nothing.
    expect(fake.setupSession(`x${session}`)).toBeNull();
    expect(gateway(() => NOW + 31 * 60_000).setupSession(session)).toBeNull();
  });
});

describe('the fake gateway’s webhooks', () => {
  it('are signed so that parseWebhook returns the event', async () => {
    const fake = gateway();
    const { body, headers } = fake.webhookRequest(methodSaved);
    expect(await fake.parseWebhook(Buffer.from(body), headers)).toEqual(methodSaved);
  });

  it('are refused unsigned, tampered with, stale or signed with another secret', async () => {
    const fake = gateway();
    const { body, headers } = fake.webhookRequest(methodSaved);
    const reject = (raw: string, sent: Record<string, string>) =>
      expect(fake.parseWebhook(Buffer.from(raw), sent)).rejects.toMatchObject({
        name: 'GatewayWebhookRejected',
        reason: 'signature',
      });
    await reject(body, {});
    await reject(body.replace('4242', '4243'), headers);
    await reject(body, {
      [FAKE_SIGNATURE_HEADER]: signFakeWebhook(SECRET, body, NOW / 1000 - 301),
    });
    await reject(body, {
      [FAKE_SIGNATURE_HEADER]: signFakeWebhook(`${SECRET}x`, body, NOW / 1000),
    });
  });

  it('refuse a signed body that is no event', async () => {
    const fake = gateway();
    const body = JSON.stringify({ kind: 'refund', eventId: 'evt_2' });
    const headers = { [FAKE_SIGNATURE_HEADER]: signFakeWebhook(SECRET, body, NOW / 1000) };
    await expect(fake.parseWebhook(Buffer.from(body), headers)).rejects.toBeInstanceOf(
      GatewayWebhookRejected,
    );
    await expect(fake.parseWebhook(Buffer.from(body), headers)).rejects.toMatchObject({
      reason: 'malformed',
    });
  });

  it('compare signatures of any shape without throwing', () => {
    const body = Buffer.from('{}');
    expect(verifyFakeWebhook(SECRET, body, 't=1,v1=zz', 1)).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(verifyFakeWebhook(SECRET, body, `t=1,v1=${'a'.repeat(63)}`, 1)).toEqual({
      ok: false,
      reason: 'mismatch',
    });
  });
});
