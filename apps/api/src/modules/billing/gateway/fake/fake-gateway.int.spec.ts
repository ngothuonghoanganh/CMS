import { Writable } from 'node:stream';
import {
  endpoints,
  type GatewayEvent,
  methodSetupResponseSchema,
  paymentMethodResponseSchema,
  problemSchema,
} from '@plp/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../../../test/client.js';
import { TEST_ADMIN_ORIGIN } from '../../../../../test/env.js';
import {
  CARD_DECLINED,
  CARD_NO_FUNDS,
  CARD_OK,
  postGatewayEvent,
} from '../../../../../test/payments.js';
import { BUNDLED_PLAN_CATALOG_FILE } from '../../../../config/env.js';
import { FakeWebhookSender } from './fake-webhook-sender.js';

const SETUP_PATH = '/public/billing/fake-gateway/setup';

describe('the fake gateway’s card page (ADR-035)', () => {
  let t: TestApp;
  let sender: FakeWebhookSender;
  let sent: GatewayEvent[];
  const log: string[] = [];

  beforeAll(async () => {
    t = await createTestApp('plp_test_fake_gateway', {
      env: {
        BILLING_TEST_CLOCK: 'on',
        PLAN_CATALOG_FILE: BUNDLED_PLAN_CATALOG_FILE,
        LOG_LEVEL: 'debug',
      },
      logDestination: new Writable({
        write(chunk: Buffer, _encoding, done) {
          log.push(chunk.toString('utf8'));
          done();
        },
      }),
    });
    // The page posts its events over HTTP, so the API listens on a port of its own here.
    const listening = await t.app.listen(0, '127.0.0.1');
    const address = listening.address();
    if (address === null || typeof address === 'string') {
      throw new Error('The test API did not listen on a port');
    }
    sender = t.app.get(FakeWebhookSender);
    sender.target(`http://127.0.0.1:${address.port}`, [5, 5]);
    sent = [];
    const send = sender.send.bind(sender);
    vi.spyOn(sender, 'send').mockImplementation(async (event) => {
      sent.push(event);
      await send(event);
    });
  });

  afterAll(async () => {
    await t.close();
  });

  async function openSetup(owner: TestClient, workspaceId: string) {
    const response = await owner
      .post(endpoints.startPaymentMethodSetup.path(workspaceId), { returnTo: 'payments' })
      .expect(200);
    const url = new URL(methodSetupResponseSchema.parse(response.body).url);
    return { session: url.searchParams.get('session') ?? '', url };
  }

  /** What the browser does when the form is submitted, through the admin's `/api` proxy. */
  function submit(
    session: string,
    card: { number: string; expiry?: string; cvc?: string },
  ): request.Test {
    return request(t.app.getHttpServer())
      .post(SETUP_PATH)
      .set('Origin', TEST_ADMIN_ORIGIN)
      .type('form')
      .send({
        session,
        number: card.number,
        expiry: card.expiry ?? '12/35',
        cvc: card.cvc ?? '737',
      });
  }

  const savedCard = async (owner: TestClient, workspaceId: string) =>
    paymentMethodResponseSchema.parse(
      (await owner.get(endpoints.getPaymentMethod.path(workspaceId)).expect(200)).body,
    ).paymentMethod;

  it('shows a plainly labelled test form with the test cards, and nothing from outside', async () => {
    const { client: owner, workspaceId } = await signedUpClient(t.app);
    const { session } = await openSetup(owner, workspaceId);
    const page = await request(t.app.getHttpServer())
      .get(SETUP_PATH)
      .query({ session })
      .expect(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.headers['cache-control']).toBe('no-store');
    expect(page.text).toContain('Cổng thanh toán thử');
    expect(page.text).toContain('<html lang="vi">');
    for (const field of ['number', 'expiry', 'cvc']) {
      expect(page.text).toContain(`<label for="${field}">`);
    }
    for (const card of [CARD_OK, CARD_DECLINED, CARD_NO_FUNDS]) {
      expect(page.text).toContain(card);
    }
    expect(page.text).toContain('>Hủy</a>');
    expect(page.text).not.toMatch(/(?:src|href)="https?:\/\/(?!localhost)/);
  });

  it('refuses a changed or expired session link', async () => {
    const { session } = await openSetup(
      ...(await signedUpClient(t.app).then(
        ({ client, workspaceId }) => [client, workspaceId] as const,
      )),
    );
    await request(t.app.getHttpServer())
      .get(SETUP_PATH)
      .query({ session: `${session}0` })
      .expect(400);
    await request(t.app.getHttpServer()).get(SETUP_PATH).expect(400);
    await submit(`${session.slice(0, -1)}0`, { number: CARD_OK }).expect(400);
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 31 * 60_000 });
    try {
      await request(t.app.getHttpServer()).get(SETUP_PATH).query({ session }).expect(400);
    } finally {
      vi.useRealTimers();
    }
  });

  it('saves a test card through the real webhook, then sends the browser back', async () => {
    const { client: owner, workspaceId } = await signedUpClient(t.app);
    const { session } = await openSetup(owner, workspaceId);
    expect(await savedCard(owner, workspaceId)).toBeNull();
    const before = sent.length;
    const response = await submit(session, { number: CARD_OK, expiry: '08 / 2035' }).expect(303);
    expect(response.headers['location']).toBe(
      `${TEST_ADMIN_ORIGIN}/workspaces/${workspaceId}/billing/payments?paymentMethod=saved`,
    );
    // The event was applied before the redirect, so the admin finds the card at once.
    expect(await savedCard(owner, workspaceId)).toEqual({
      brand: 'visa',
      last4: '4242',
      expMonth: 8,
      expYear: 2035,
      expired: false,
    });
    expect(sent).toHaveLength(before + 1);
    const event = sent.at(-1);
    expect(event?.kind).toBe('method_saved');
    expect(event?.eventId).toMatch(/^evt_fake_/);
    // A replay of the same signed event is answered and changes nothing.
    if (event === undefined) {
      throw new Error('No event was sent');
    }
    await postGatewayEvent(t, event).expect(200);
    expect((await savedCard(owner, workspaceId))?.last4).toBe('4242');
  });

  it('gives every card its own event id', async () => {
    const { client: owner, workspaceId } = await signedUpClient(t.app);
    const first = await openSetup(owner, workspaceId);
    await submit(first.session, { number: CARD_OK }).expect(303);
    const second = await openSetup(owner, workspaceId);
    await submit(second.session, { number: CARD_DECLINED }).expect(303);
    const [a, b] = sent.slice(-2);
    expect(a?.eventId).not.toBe(b?.eventId);
    expect((await savedCard(owner, workspaceId))?.last4).toBe('0002');
  });

  it('saves one card per session: opened again, it says so and leads back, with no form', async () => {
    const { client: owner, workspaceId } = await signedUpClient(t.app);
    const { session } = await openSetup(owner, workspaceId);
    const saved = await submit(session, { number: CARD_OK }).expect(303);
    const back = String(saved.headers['location']);
    const before = sent.length;

    // The browser's Back shows the page again: the card is saved, nothing takes another one.
    const again = await request(t.app.getHttpServer())
      .get(SETUP_PATH)
      .query({ session })
      .expect(200);
    expect(again.text).toContain('Đã lưu thẻ');
    expect(again.text).toContain(`href="${back.replaceAll('&', '&amp;')}"`);
    expect(again.text).not.toContain('<form');
    const resent = await submit(session, { number: CARD_DECLINED }).expect(409);
    expect(resent.text).toContain('Đã lưu thẻ');
    expect(sent).toHaveLength(before);
    expect((await savedCard(owner, workspaceId))?.last4).toBe('4242');
  });

  it('rejects a number that is not a test card, a bad expiry and a bad CVC, keeping the form', async () => {
    const { client: owner, workspaceId } = await signedUpClient(t.app);
    const { session } = await openSetup(owner, workspaceId);
    const before = sent.length;
    const real = await submit(session, { number: '5555 5555 5555 4444' }).expect(422);
    expect(real.text).toContain('không phải thẻ thử');
    expect(real.text).toContain('role="alert"');
    expect(real.text).not.toContain('5555');
    const format = await submit(session, { number: CARD_OK, expiry: '13/35' }).expect(422);
    expect(format.text).toContain('MM/YY');
    const past = await submit(session, { number: CARD_OK, expiry: '01/20' }).expect(422);
    expect(past.text).toContain('hết hạn');
    const cvc = await submit(session, { number: CARD_OK, cvc: 'ab' }).expect(422);
    expect(cvc.text).toContain('CVC');
    expect(cvc.text).not.toMatch(/name="number"[^>]*value=/);
    expect(sent).toHaveLength(before);
    expect(await savedCard(owner, workspaceId)).toBeNull();
  });

  it('refuses a post from another origin', async () => {
    const { client: owner, workspaceId } = await signedUpClient(t.app);
    const { session } = await openSetup(owner, workspaceId);
    await request(t.app.getHttpServer())
      .post(SETUP_PATH)
      .set('Origin', 'https://evil.test')
      .type('form')
      .send({ session, number: CARD_OK, expiry: '12/35', cvc: '737' })
      .expect(403);
  });

  it('does not send the browser back when the event cannot be delivered', async () => {
    const { client: owner, workspaceId } = await signedUpClient(t.app);
    const { session } = await openSetup(owner, workspaceId);
    const address = t.app.getHttpServer().address();
    if (address === null || typeof address === 'string') {
      throw new Error('The test API stopped listening');
    }
    sender.target('http://127.0.0.1:9', [1, 1]);
    try {
      const response = await submit(session, { number: CARD_OK }).expect(502);
      expect(response.headers['location']).toBeUndefined();
      expect(response.text).toContain('Cổng thử không gửi được');
    } finally {
      sender.target(`http://127.0.0.1:${address.port}`, [5, 5]);
    }
    expect(await savedCard(owner, workspaceId)).toBeNull();
    // Nothing was saved, so the same session takes the card when tried again.
    await submit(session, { number: CARD_OK }).expect(303);
    expect((await savedCard(owner, workspaceId))?.last4).toBe('4242');
  });

  it('lets the card decide the charge: it goes through, or is declined for the reason', async () => {
    for (const [number, status, code] of [
      [CARD_OK, 200, null],
      [CARD_DECLINED, 402, 'card_declined'],
      [CARD_NO_FUNDS, 402, 'insufficient_funds'],
    ] as const) {
      const { client: owner, workspaceId } = await signedUpClient(t.app);
      const { session } = await openSetup(owner, workspaceId);
      await submit(session, { number }).expect(303);
      const response = await owner
        .post(endpoints.changePlan.path(workspaceId), {
          planId: 'agency',
          cycle: 'monthly',
          payNow: true,
          expectedAmount: 599_000,
        })
        .expect(status);
      if (code !== null) {
        expect(problemSchema.parse(response.body)).toMatchObject({ code: 'payment_failed' });
        expect(response.body).toMatchObject({ context: { code } });
      }
    }
  });

  it('keeps the card number and CVC out of the database and the log', async () => {
    const { client: owner, workspaceId } = await signedUpClient(t.app);
    const { session } = await openSetup(owner, workspaceId);
    await submit(session, { number: CARD_OK, cvc: '7391' }).expect(303);
    const another = await openSetup(owner, workspaceId);
    await submit(another.session, { number: '5555 5555 5555 4444', cvc: '7391' }).expect(422);
    const dumps: string[] = [];
    const databases = [t.connection, t.workspaceDb(workspaceId)];
    for (const connection of databases) {
      const collections = await connection.db?.listCollections().toArray();
      for (const { name } of collections ?? []) {
        dumps.push(JSON.stringify(await connection.collection(name).find({}).toArray()));
      }
    }
    const everything = [...dumps, ...log].join('\n');
    expect(log.length).toBeGreaterThan(0);
    for (const secret of ['4242424242424242', '4242 4242 4242 4242', '5555555555554444', '7391']) {
      expect(everything).not.toContain(secret);
    }
    // The token holds the behaviour and a random part, never the number.
    expect(dumps.join('')).toMatch(/tok_fake_succeeds_[a-f0-9]{16}/);
  });
});

describe('the fake gateway’s card page with payments off', () => {
  it('does not exist', async () => {
    const t = await createTestApp('plp_test_fake_gateway_off', {
      env: { PAYMENT_PROVIDER: 'none' },
    });
    try {
      await request(t.app.getHttpServer()).get(SETUP_PATH).query({ session: 'x' }).expect(404);
      await request(t.app.getHttpServer())
        .post(SETUP_PATH)
        .set('Origin', TEST_ADMIN_ORIGIN)
        .type('form')
        .send({ session: 'x', number: CARD_OK })
        .expect(404);
    } finally {
      await t.close();
    }
  });
});
