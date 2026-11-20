import {
  billingInfoResponseSchema,
  endpoints,
  type GatewayEvent,
  IDEMPOTENCY_KEY_HEADER,
  methodSetupResponseSchema,
  paymentMethodResponseSchema,
  problemSchema,
} from '@plp/contracts';
import { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { TEST_ADMIN_ORIGIN } from '../../../test/env.js';
import {
  addCard,
  CARD_DECLINED,
  CARD_OK,
  fakeGateway,
  invoicesOf,
  newEventId,
  postGatewayEvent,
} from '../../../test/payments.js';
import { addMember } from '../../../test/resources.js';
import { BUNDLED_PLAN_CATALOG_FILE } from '../../config/env.js';
import { BillingClock } from './billing-clock.js';
import { methodSetupReference } from './domain/billing-references.js';
import {
  FAKE_SIGNATURE_HEADER,
  fakeCardTokenFor,
  signFakeWebhook,
} from './gateway/fake/fake-gateway-protocol.js';

const DAY_MS = 86_400_000;

const BILLING_INFO = {
  companyName: 'Công ty TNHH Truyền thông Mây Xanh',
  taxCode: '0315 123 456 001',
  address: '12 Nguyễn Đình Chiểu, Phường Đa Kao, TP. Hồ Chí Minh',
  email: 'ketoan@mayxanh.vn',
};

describe('cards, billing info and the gateway’s webhook (ADR-035, T2)', () => {
  let t: TestApp;
  let clock: BillingClock;

  beforeAll(async () => {
    t = await createTestApp('plp_test_payments', {
      env: { BILLING_TEST_CLOCK: 'on', PLAN_CATALOG_FILE: BUNDLED_PLAN_CATALOG_FILE },
    });
    clock = t.app.get(BillingClock);
  });

  afterEach(() => {
    clock.set(null);
  });

  afterAll(async () => {
    await t.close();
  });

  const subscriptionOf = (workspaceId: string) =>
    t.connection.collection('subscriptions').findOne({ _id: new Types.ObjectId(workspaceId) });
  const logOf = (workspaceId: string) =>
    t.connection
      .collection('billing_log')
      .find({ workspaceId: new Types.ObjectId(workspaceId) })
      .sort({ _id: 1 })
      .toArray();

  function methodSaved(reference: string, cardNumber = CARD_OK): GatewayEvent {
    const card = fakeCardTokenFor(cardNumber);
    if (card === null) {
      throw new Error(`${cardNumber} is not a test card`);
    }
    return {
      kind: 'method_saved',
      eventId: newEventId(),
      occurredAt: new Date().toISOString(),
      reference,
      method: {
        token: card.token,
        brand: card.brand,
        last4: card.last4,
        expMonth: 8,
        expYear: 2028,
      },
    };
  }

  async function setupUrl(owner: TestClient, workspaceId: string, returnTo?: string) {
    const response = await owner
      .post(endpoints.startPaymentMethodSetup.path(workspaceId), returnTo ? { returnTo } : {})
      .expect(200);
    return new URL(methodSetupResponseSchema.parse(response.body).url);
  }

  describe('a card', () => {
    it('is entered on the gateway’s page, which leads back to the admin', async () => {
      const { client: owner, workspaceId, me } = await signedUpClient(t.app);
      const url = await setupUrl(owner, workspaceId);
      expect(`${url.origin}${url.pathname}`).toBe(
        `${TEST_ADMIN_ORIGIN}/api/public/billing/fake-gateway/setup`,
      );
      const session = fakeGateway(t).setupSession(url.searchParams.get('session') ?? '');
      expect(session).toMatchObject({
        reference: methodSetupReference(
          new Types.ObjectId(workspaceId),
          new Types.ObjectId(me.user.id),
        ),
        returnUrl: `${TEST_ADMIN_ORIGIN}/workspaces/${workspaceId}/billing/payments?paymentMethod=saved`,
        cancelUrl: `${TEST_ADMIN_ORIGIN}/workspaces/${workspaceId}/billing/payments?paymentMethod=canceled`,
      });
      const plan = await setupUrl(owner, workspaceId, 'plan');
      expect(fakeGateway(t).setupSession(plan.searchParams.get('session') ?? '')?.returnUrl).toBe(
        `${TEST_ADMIN_ORIGIN}/workspaces/${workspaceId}/billing?paymentMethod=saved`,
      );
      await owner
        .post(endpoints.startPaymentMethodSetup.path(workspaceId), {
          returnTo: 'https://evil.test',
        })
        .expect(422);
      // Nothing is saved before the gateway's event.
      expect(
        paymentMethodResponseSchema.parse(
          (await owner.get(endpoints.getPaymentMethod.path(workspaceId)).expect(200)).body,
        ),
      ).toEqual({ paymentMethod: null, paymentsEnabled: true });
    });

    it('is stored from the gateway’s event, shown and logged without its token', async () => {
      const { client: owner, workspaceId, me } = await signedUpClient(t.app);
      await addCard(t, owner, workspaceId, CARD_OK, { expMonth: 8, expYear: 2028 });
      expect(
        paymentMethodResponseSchema.parse(
          (await owner.get(endpoints.getPaymentMethod.path(workspaceId)).expect(200)).body,
        ),
      ).toEqual({
        paymentMethod: { brand: 'visa', last4: '4242', expMonth: 8, expYear: 2028, expired: false },
        paymentsEnabled: true,
      });
      const stored = await subscriptionOf(workspaceId);
      expect(stored).toMatchObject({ version: 1, paymentMethod: { last4: '4242' } });
      expect((stored?.['paymentMethod'] as { token: string }).token).toMatch(/^tok_fake_/);

      const log = await logOf(workspaceId);
      expect(log).toEqual([
        expect.objectContaining({
          action: 'payment_method_changed',
          actorId: new Types.ObjectId(me.user.id),
          invoiceId: null,
          amount: null,
        }),
      ]);
      expect(JSON.stringify(log)).not.toMatch(/tok_fake|4242/);
      const events = await t.connection.collection('billing_events').find({}).toArray();
      expect(JSON.stringify(events)).not.toMatch(/tok_fake|4242/);

      // Another card replaces it; an expired one says so.
      await addCard(t, owner, workspaceId, CARD_DECLINED, { expMonth: 1, expYear: 2026 });
      expect(
        paymentMethodResponseSchema.parse(
          (await owner.get(endpoints.getPaymentMethod.path(workspaceId)).expect(200)).body,
        ).paymentMethod,
      ).toEqual({ brand: 'visa', last4: '0002', expMonth: 1, expYear: 2026, expired: true });
    });
  });

  describe('billing info', () => {
    it('is empty until saved, without spaces in its tax code, and logged without its content', async () => {
      const { client: owner, workspaceId } = await signedUpClient(t.app);
      const path = endpoints.getBillingInfo.path(workspaceId);
      expect(billingInfoResponseSchema.parse((await owner.get(path).expect(200)).body)).toEqual({
        billingInfo: null,
      });
      const saved = billingInfoResponseSchema.parse(
        (await owner.put(endpoints.updateBillingInfo.path(workspaceId), BILLING_INFO).expect(200))
          .body,
      );
      const stored = { ...BILLING_INFO, taxCode: '0315123456-001' };
      expect(saved).toEqual({ billingInfo: stored });
      expect(billingInfoResponseSchema.parse((await owner.get(path).expect(200)).body)).toEqual({
        billingInfo: stored,
      });
      expect(await subscriptionOf(workspaceId)).toMatchObject({ billingInfo: stored, version: 1 });
      const log = await logOf(workspaceId);
      expect(log.map((entry) => entry['action'] as string)).toEqual(['billing_info_changed']);
      expect(JSON.stringify(log)).not.toMatch(/Mây Xanh|ketoan|0315/);
    });

    it('refuses a tax code of the wrong length and missing fields', async () => {
      const { client: owner, workspaceId } = await signedUpClient(t.app);
      const path = endpoints.updateBillingInfo.path(workspaceId);
      const short = await owner.put(path, { ...BILLING_INFO, taxCode: '0315 123 45' }).expect(422);
      expect(problemSchema.parse(short.body).issues?.[0]).toMatchObject({
        path: ['taxCode'],
        message: 'Mã số thuế gồm 10 chữ số, hoặc 13 dạng 0123456789-001',
      });
      await owner.put(path, { ...BILLING_INFO, companyName: ' ' }).expect(422);
      await owner.put(path, { ...BILLING_INFO, email: 'ketoan' }).expect(422);
      await owner.put(path, { ...BILLING_INFO, note: 'x' }).expect(422);
      expect(await subscriptionOf(workspaceId)).toMatchObject({ billingInfo: null, version: 0 });
    });
  });

  describe('the gateway’s webhook', () => {
    it('applies a signed event once, however often it comes, without a session or Origin', async () => {
      const { client: owner, workspaceId, me } = await signedUpClient(t.app);
      const event = methodSaved(
        methodSetupReference(new Types.ObjectId(workspaceId), new Types.ObjectId(me.user.id)),
      );
      await postGatewayEvent(t, event).expect(200, { received: true });
      await postGatewayEvent(t, event).expect(200, { received: true });
      expect(await subscriptionOf(workspaceId)).toMatchObject({ version: 1 });
      expect(await logOf(workspaceId)).toHaveLength(1);
      const recorded = await t.connection
        .collection('billing_events')
        .find({ eventId: event.eventId })
        .toArray();
      expect(recorded).toEqual([
        expect.objectContaining({ provider: 'fake', kind: 'method_saved' }),
      ]);
      const kept = (recorded[0]?.['expiresAt'] as Date).getTime() - Date.now();
      expect(kept).toBeGreaterThan(89 * DAY_MS);
      expect(kept).toBeLessThanOrEqual(90 * DAY_MS);
      await owner.get(endpoints.getPaymentMethod.path(workspaceId)).expect(200);
    });

    it('refuses what the gateway did not sign, before reading it', async () => {
      const { workspaceId, me } = await signedUpClient(t.app);
      const event = methodSaved(
        methodSetupReference(new Types.ObjectId(workspaceId), new Types.ObjectId(me.user.id)),
      );
      const body = JSON.stringify(event);
      const now = Math.floor(Date.now() / 1000);
      const unsigned = await postGatewayEvent(t, event, { headers: {} }).expect(401);
      expect(problemSchema.parse(unsigned.body)).toMatchObject({
        code: 'unauthenticated',
        title: 'Chữ ký của cổng thanh toán không hợp lệ',
      });
      const signedFor = (raw: string, secret: string, at: number) => ({
        'content-type': 'application/json',
        [FAKE_SIGNATURE_HEADER]: signFakeWebhook(secret, raw, at),
      });
      const secret = t.env.PAYMENT_WEBHOOK_SECRET ?? '';
      // Another body under a signature, a stale signature, another secret.
      await postGatewayEvent(t, event, {
        headers: signedFor(body, secret, now),
        body: body.replace('"expYear":2028', '"expYear":2029'),
      }).expect(401);
      await postGatewayEvent(t, event, {
        headers: signedFor(body, secret, now - 600),
        body,
      }).expect(401);
      await postGatewayEvent(t, event, {
        headers: signedFor(body, `${secret}-khac`, now),
        body,
      }).expect(401);
      // Signed, but no event: 400.
      const junk = JSON.stringify({ kind: 'refund', eventId: 'evt_x' });
      await postGatewayEvent(t, event, {
        headers: signedFor(junk, secret, now),
        body: junk,
      }).expect(400);
      const notJson = 'kind=method_saved';
      await postGatewayEvent(t, event, {
        headers: {
          ...signedFor(notJson, secret, now),
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: notJson,
      }).expect(400);
      // Another gateway's path is not found.
      await postGatewayEvent(t, event, { provider: 'none' }).expect(404);
      await postGatewayEvent(t, event, { provider: 'stripe' }).expect(404);
      expect(await subscriptionOf(workspaceId)).toMatchObject({ paymentMethod: null, version: 0 });
      expect(
        await t.connection.collection('billing_events').countDocuments({ eventId: event.eventId }),
      ).toBe(0);
    });

    it('refuses a body over 64 KB before reading it', async () => {
      const big = 'x'.repeat(70 * 1024);
      const secret = t.env.PAYMENT_WEBHOOK_SECRET ?? '';
      await request(t.app.getHttpServer())
        .post(endpoints.paymentGatewayWebhook.path('fake'))
        .set({
          'content-type': 'application/json',
          [FAKE_SIGNATURE_HEADER]: signFakeWebhook(secret, big, Math.floor(Date.now() / 1000)),
        })
        .send(big)
        .expect(413);
    });

    it('ignores, with the same answer, events naming nothing the API knows', async () => {
      const { workspaceId } = await signedUpClient(t.app);
      const stranger = methodSetupReference(new Types.ObjectId(), new Types.ObjectId());
      const unknownInvoice = new Types.ObjectId().toHexString();
      const events: GatewayEvent[] = [
        methodSaved(stranger),
        methodSaved('ws_khong-phai-ma'),
        methodSaved(unknownInvoice),
        {
          kind: 'charge_succeeded',
          eventId: newEventId(),
          occurredAt: new Date().toISOString(),
          reference: unknownInvoice,
          idempotencyKey: `${unknownInvoice}-1`,
          amount: 599_000,
        },
        {
          kind: 'charge_failed',
          eventId: newEventId(),
          occurredAt: new Date().toISOString(),
          reference: methodSetupReference(new Types.ObjectId(workspaceId), new Types.ObjectId()),
          idempotencyKey: 'x-1',
          amount: 599_000,
          code: 'card_declined',
        },
        {
          kind: 'transfer_received',
          eventId: newEventId(),
          occurredAt: new Date().toISOString(),
          reference: unknownInvoice,
          amount: 599_000,
        },
      ];
      for (const event of events) {
        await postGatewayEvent(t, event).expect(200, { received: true });
      }
      expect(
        await t.connection
          .collection('subscriptions')
          .countDocuments({ _id: new Types.ObjectId(stranger.slice(3, 27)) }),
      ).toBe(0);
      expect(await subscriptionOf(workspaceId)).toMatchObject({ paymentMethod: null, version: 0 });
      // Recorded all the same, so that none of them is looked at twice.
      expect(
        await t.connection
          .collection('billing_events')
          .countDocuments({ eventId: { $in: events.map((event) => event.eventId) } }),
      ).toBe(events.length);
    });
  });

  describe('who may pay', () => {
    it('is the owner only: Quản trị sees the plan, not the payments', async () => {
      const { client: owner, workspaceId } = await signedUpClient(t.app);
      await addCard(t, owner, workspaceId);
      await owner
        .post(endpoints.changePlan.path(workspaceId), {
          planId: 'agency',
          cycle: 'monthly',
          payNow: true,
          expectedAmount: 599_000,
        })
        .expect(200);
      const [paid] = (await invoicesOf(owner, workspaceId)).items;
      const invoiceId = paid?.id ?? '';
      const { client: admin } = await addMember(t, workspaceId, 'admin');
      const { client: editor } = await addMember(t, workspaceId, 'editor');

      await admin.get(endpoints.getBillingSummary.path(workspaceId)).expect(200);
      for (const member of [admin, editor]) {
        const refusals = [
          () => member.get(endpoints.getPaymentMethod.path(workspaceId)),
          () => member.post(endpoints.startPaymentMethodSetup.path(workspaceId), {}),
          () => member.get(endpoints.getBillingInfo.path(workspaceId)),
          () => member.put(endpoints.updateBillingInfo.path(workspaceId), BILLING_INFO),
          () => member.get(endpoints.listInvoices.path(workspaceId)),
          () => member.get(endpoints.getInvoice.path(workspaceId, invoiceId)),
          () => member.get(endpoints.getInvoiceReceipt.path(workspaceId, invoiceId)),
          () =>
            member
              .post(endpoints.payInvoice.path(workspaceId, invoiceId))
              .set(IDEMPOTENCY_KEY_HEADER, 'khong-co-quyen-1'),
          () =>
            member
              .get(endpoints.getPlanChangeQuote.path(workspaceId))
              .query({ planId: 'business', cycle: 'monthly' }),
        ];
        for (const refused of refusals) {
          const response = await refused().expect(403);
          expect(problemSchema.parse(response.body).title).toBe(
            'Chỉ Chủ sở hữu được thực hiện thao tác này',
          );
        }
      }
    });

    it('answers another workspace’s invoices and payments as not found', async () => {
      const { client: owner, workspaceId } = await signedUpClient(t.app);
      await addCard(t, owner, workspaceId);
      await owner
        .post(endpoints.changePlan.path(workspaceId), {
          planId: 'agency',
          cycle: 'monthly',
          payNow: true,
          expectedAmount: 599_000,
        })
        .expect(200);
      const [paid] = (await invoicesOf(owner, workspaceId)).items;
      const invoiceId = paid?.id ?? '';
      const { client: stranger, workspaceId: strangerWorkspace } = await signedUpClient(t.app);

      for (const probe of [
        () => stranger.get(endpoints.getPaymentMethod.path(workspaceId)),
        () => stranger.post(endpoints.startPaymentMethodSetup.path(workspaceId), {}),
        () => stranger.get(endpoints.getBillingInfo.path(workspaceId)),
        () => stranger.put(endpoints.updateBillingInfo.path(workspaceId), BILLING_INFO),
        () => stranger.get(endpoints.listInvoices.path(workspaceId)),
        () => stranger.get(endpoints.getInvoice.path(workspaceId, invoiceId)),
        () => stranger.get(endpoints.getInvoiceReceipt.path(workspaceId, invoiceId)),
        () =>
          stranger
            .post(endpoints.payInvoice.path(workspaceId, invoiceId))
            .set(IDEMPOTENCY_KEY_HEADER, 'nguoi-la-1234'),
        // Their own workspace's path with this invoice: still not theirs.
        () => stranger.get(endpoints.getInvoice.path(strangerWorkspace, invoiceId)),
        () => stranger.get(endpoints.getInvoiceReceipt.path(strangerWorkspace, invoiceId)),
        () =>
          stranger
            .post(endpoints.payInvoice.path(strangerWorkspace, invoiceId))
            .set(IDEMPOTENCY_KEY_HEADER, 'nguoi-la-5678'),
        () => stranger.get(endpoints.getInvoice.path(strangerWorkspace, 'khong-phai-ma')),
      ]) {
        await probe().expect(404);
      }
      expect((await invoicesOf(stranger, strangerWorkspace)).items).toEqual([]);
      expect(await subscriptionOf(workspaceId)).toMatchObject({ billingInfo: null });
    });
  });

  describe('a read-only workspace', () => {
    it('still adds a card, edits its billing info and pays, which lifts read-only', async () => {
      const { client: owner, workspaceId } = await signedUpClient(t.app);
      const stored = await subscriptionOf(workspaceId);
      clock.set(new Date((stored?.['trialEndsAt'] as Date).getTime() + 8 * DAY_MS));
      const createSite = () =>
        owner.post(endpoints.createSite.path(workspaceId), {
          name: 'Bếp Nhà Mây',
          subdomain: `bep-${workspaceId.slice(-8)}`,
        });
      await createSite().expect(402);

      await owner.put(endpoints.updateBillingInfo.path(workspaceId), BILLING_INFO).expect(200);
      await addCard(t, owner, workspaceId);
      // A card after the trial is charged by the renewal job (T3); the grace of the trial's end is
      // over, so the workspace stays read-only until it pays.
      await createSite().expect(402);
      const quote = await owner
        .get(endpoints.getPlanChangeQuote.path(workspaceId))
        .query({ planId: 'agency', cycle: 'monthly', payNow: 'true' })
        .expect(200);
      expect(quote.body).toMatchObject({ mode: 'start_paid', amount: 599_000 });
      await owner
        .post(endpoints.changePlan.path(workspaceId), {
          planId: 'agency',
          cycle: 'monthly',
          payNow: true,
          expectedAmount: 599_000,
        })
        .expect(200);
      await createSite().expect(201);
    });
  });
});

describe('payments turned off (PAYMENT_PROVIDER=none)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_payments_off', {
      env: { PAYMENT_PROVIDER: 'none', PLAN_CATALOG_FILE: BUNDLED_PLAN_CATALOG_FILE },
    });
  });

  afterAll(async () => {
    await t.close();
  });

  it('says so, and has no webhook', async () => {
    const { client: owner, workspaceId } = await signedUpClient(t.app);
    expect(
      paymentMethodResponseSchema.parse(
        (await owner.get(endpoints.getPaymentMethod.path(workspaceId)).expect(200)).body,
      ),
    ).toEqual({ paymentMethod: null, paymentsEnabled: false });
    const setup = await owner
      .post(endpoints.startPaymentMethodSetup.path(workspaceId), {})
      .expect(503);
    expect(problemSchema.parse(setup.body).code).toBe('payments_disabled');
    const pay = await owner
      .post(endpoints.changePlan.path(workspaceId), {
        planId: 'agency',
        cycle: 'monthly',
        payNow: true,
        expectedAmount: 599_000,
      })
      .expect(503);
    expect(problemSchema.parse(pay.body).code).toBe('payments_disabled');
    // Billing info and free trial changes do not need a gateway.
    await owner.put(endpoints.updateBillingInfo.path(workspaceId), BILLING_INFO).expect(200);
    await owner
      .post(endpoints.changePlan.path(workspaceId), { planId: 'basic', cycle: 'monthly' })
      .expect(200);
    await request(t.app.getHttpServer())
      .post(endpoints.paymentGatewayWebhook.path('none'))
      .send({})
      .expect(404);
    await request(t.app.getHttpServer())
      .post(endpoints.paymentGatewayWebhook.path('fake'))
      .send({})
      .expect(404);
  });
});
