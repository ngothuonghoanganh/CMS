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
    // Each setup is a session of its own.
    const other = new URL(
      (
        await fake.startMethodSetup({
          reference: methodSaved.reference,
          returnUrl: 'http://localhost:3100/workspaces/1/billing/payments?paymentMethod=saved',
          cancelUrl: 'http://localhost:3100/workspaces/1/billing/payments?paymentMethod=canceled',
        })
      ).url,
    ).searchParams.get('session');
    expect(fake.setupSession(other ?? '')?.id).not.toBe(fake.setupSession(session)?.id);
  });

  it('saves one card per session, unless the card could not be saved', () => {
    let now = NOW;
    const fake = gateway(() => now);
    const setup = (id: string) => ({
      id,
      reference: methodSaved.reference,
      returnUrl: 'http://localhost:3100/workspaces/1/billing/payments?paymentMethod=saved',
      cancelUrl: 'http://localhost:3100/workspaces/1/billing/payments?paymentMethod=canceled',
      expiresAt: Math.floor(NOW / 1000) + 60,
    });
    expect(fake.setupUsed(setup('s1'))).toBe(false);
    expect(fake.claimSetup(setup('s1'))).toBe(true);
    expect(fake.setupUsed(setup('s1'))).toBe(true);
    expect(fake.claimSetup(setup('s1'))).toBe(false);
    expect(fake.claimSetup(setup('s2'))).toBe(true);
    fake.releaseSetup(setup('s2'));
    expect(fake.claimSetup(setup('s2'))).toBe(true);
    // Forgotten once the session has expired, when it no longer opens anything anyway.
    now += 61_000;
    expect(fake.claimSetup(setup('s3'))).toBe(true);
    expect(fake.setupUsed(setup('s1'))).toBe(false);
  });
});

describe('the fake gateway’s transfers (T3)', () => {
  const request = {
    reference: '674000000000000000000abc',
    amount: 599_000,
    invoiceNumber: 'HD-2026-000042',
    returnUrl: 'http://localhost:3100/workspaces/w/billing/payments?transfer=received',
  };

  it('give the fake account, a content naming the invoice, a VietQR and the confirming page', async () => {
    const fake = gateway();
    const instructions = await fake.startTransfer(request);
    expect(instructions).toMatchObject({
      bankName: 'Ngân hàng thử (cổng thanh toán giả)',
      accountNumber: '0000000000',
      accountName: 'PAYLOAD LANDING PAGE',
      content: 'PLP HD-2026-000042',
      amount: 599_000,
    });
    expect(instructions.qrPayload).toMatch(
      /^000201010212.*5406599000.*PLP HD-2026-000042.*6304[0-9A-F]{4}$/,
    );
    const page = new URL(instructions.pageUrl ?? '');
    expect(`${page.origin}${page.pathname}`).toBe(`${PAGES}/transfer`);
    const session = fake.transferSession(page.searchParams.get('session') ?? '');
    expect(session).toMatchObject({
      reference: request.reference,
      amount: 599_000,
      content: 'PLP HD-2026-000042',
      returnUrl: request.returnUrl,
    });
  });

  it('confirm one transfer per page, unless its event could not be sent', async () => {
    const fake = gateway();
    const page = new URL((await fake.startTransfer(request)).pageUrl ?? '');
    const session = fake.transferSession(page.searchParams.get('session') ?? '');
    if (session === null) {
      throw new Error('The transfer page has no session');
    }
    expect(fake.transferConfirmed(session)).toBe(false);
    expect(fake.claimTransfer(session)).toBe(true);
    expect(fake.claimTransfer(session)).toBe(false);
    fake.releaseTransfer(session);
    expect(fake.claimTransfer(session)).toBe(true);
    expect(fake.transferConfirmed(session)).toBe(true);
  });

  it('open no page with a changed, expired or card session', async () => {
    const fake = gateway();
    const token = new URL((await fake.startTransfer(request)).pageUrl ?? '').searchParams.get(
      'session',
    );
    expect(fake.transferSession(`${token ?? ''}0`)).toBeNull();
    const later = gateway(() => NOW + 15 * 24 * 3600 * 1000);
    expect(later.transferSession(token ?? '')).toBeNull();
    const setup = await fake.startMethodSetup({
      reference: 'ws_1_by_2',
      returnUrl: 'http://localhost:3100/a',
      cancelUrl: 'http://localhost:3100/b',
    });
    expect(fake.transferSession(new URL(setup.url).searchParams.get('session') ?? '')).toBeNull();
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
