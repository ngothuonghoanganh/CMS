import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { Logger } from '@nestjs/common';
import {
  billingSummarySchema,
  endpoints,
  type GatewayEvent,
  invoiceReceiptSchema,
  invoiceSchema,
  marketplaceItemDetailSchema,
  type MarketplacePurchaseResponse,
  marketplacePurchaseResponseSchema,
  marketplaceQuoteSchema,
  methodSetupResponseSchema,
  payInvoiceResponseSchema,
  problemSchema,
  workspacePlanSchema,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { setReadOnly } from '../../../test/billing.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { TEST_ADMIN_ORIGIN } from '../../../test/env.js';
import {
  DRAFT_ITEM_ID,
  FREE_ITEM_ID,
  grantLicence,
  marketplaceCatalogFile,
  PAID_ITEM_ID,
  purchaseBody,
  purchaseItem,
  quoteItem,
  testMarketplaceCatalog,
  TWO_VERSIONS_ITEM_ID,
  WITHDRAWN_ITEM_ID,
} from '../../../test/marketplace.js';
import {
  addCard,
  CARD_DECLINED,
  CARD_NO_FUNDS,
  CARD_OK,
  fakeGateway,
  invoicesOf,
  newEventId,
  payInvoice,
  postGatewayEvent,
} from '../../../test/payments.js';
import { addMember } from '../../../test/resources.js';
import { BUNDLED_PLAN_CATALOG_FILE } from '../../config/env.js';
import { BillingClock } from '../billing/billing-clock.js';
import { BillingLogRepository } from '../billing/billing-log.repository.js';
import { BillingScheduler } from '../billing/billing-scheduler.service.js';
import { SETTLE_FIRST_MS } from '../billing/domain/billing-agenda.js';
import { versionHashOf } from './domain/version-hash.js';
import { MarketplaceLicencesRepository } from './marketplace-licences.repository.js';

const MINUTE_MS = 60_000;
/** The second paid item of the bundled catalog (499.000đ). */
const OTHER_PAID_ID = 'mp-mo-ban-du-an-can-ho';

describe('buying a marketplace item (ADR-036, MP3)', () => {
  let t: TestApp;
  let clock: BillingClock;
  const catalog = testMarketplaceCatalog();
  const catalogFile = marketplaceCatalogFile(catalog);

  beforeAll(async () => {
    t = await createTestApp('plp_test_mp_purchases', {
      env: {
        BILLING_TEST_CLOCK: 'on',
        PLAN_CATALOG_FILE: BUNDLED_PLAN_CATALOG_FILE,
        MARKETPLACE_CATALOG_FILE: catalogFile,
      },
    });
    clock = t.app.get(BillingClock);
  });

  afterEach(async () => {
    clock.set(null);
    vi.restoreAllMocks();
    // Each test's workspaces stay out of the next tests' runs of the job.
    await t.connection.collection('subscriptions').updateMany({}, { $set: { nextActionAt: null } });
  });

  afterAll(async () => {
    await t.close();
    rmSync(dirname(catalogFile), { recursive: true, force: true });
  });

  const oid = (id: string) => new Types.ObjectId(id);
  const subscriptionOf = (workspaceId: string) =>
    t.connection.collection('subscriptions').findOne({ _id: oid(workspaceId) });
  const invoiceDocs = (workspaceId: string) =>
    t.connection
      .collection('invoices')
      .find({ workspaceId: oid(workspaceId) })
      .sort({ _id: 1 })
      .toArray();
  const licencesOf = (workspaceId: string) =>
    t.connection
      .collection('marketplace_licences')
      .find({ workspaceId: oid(workspaceId) })
      .toArray();
  const purchasesLogged = (workspaceId: string) =>
    t.connection
      .collection('billing_log')
      .find({ workspaceId: oid(workspaceId), action: 'marketplace_purchased' })
      .toArray();

  /** A new owner whose workspace has a card that pays (or the one given). */
  async function owning(card: string | null = CARD_OK) {
    const { client, workspaceId, me } = await signedUpClient(t.app);
    if (card !== null) {
      await addCard(t, client, workspaceId, card);
    }
    return { owner: client, workspaceId, ownerId: me.user.id, email: me.user.email };
  }

  function bought(response: { body: unknown }): MarketplacePurchaseResponse {
    return marketplacePurchaseResponseSchema.parse(response.body);
  }

  async function invoiceOf(owner: TestClient, workspaceId: string, invoiceId: string) {
    return invoiceSchema.parse(
      (await owner.get(endpoints.getInvoice.path(workspaceId, invoiceId)).expect(200)).body,
    );
  }

  async function detailOf(client: TestClient, workspaceId: string, itemId = PAID_ITEM_ID) {
    return marketplaceItemDetailSchema.parse(
      (await client.get(endpoints.getMarketplaceItem.path(workspaceId, itemId)).expect(200)).body,
    );
  }

  function chargeEvent(
    kind: 'charge_succeeded' | 'charge_failed',
    invoice: { id: string; amount: number },
  ): GatewayEvent {
    const base = {
      eventId: newEventId(),
      occurredAt: new Date().toISOString(),
      reference: invoice.id,
      idempotencyKey: `${invoice.id}-1`,
      amount: invoice.amount,
    };
    return kind === 'charge_succeeded'
      ? { kind, ...base }
      : { kind, ...base, code: 'card_declined' };
  }

  describe('the quote', () => {
    it('says what "Mua mẫu" charges and with which card, and never charges', async () => {
      const { owner, workspaceId } = await owning(null);
      const charge = vi.spyOn(fakeGateway(t), 'charge');
      expect(
        marketplaceQuoteSchema.parse((await quoteItem(owner, workspaceId).expect(200)).body),
      ).toEqual({
        itemId: PAID_ITEM_ID,
        name: 'Khai trương phòng tập',
        version: 1,
        amount: 399_000,
        termsVersion: 1,
        owned: false,
        paymentMethod: null,
        paymentMethodRequired: true,
        paymentsEnabled: true,
        billingCompanyName: null,
      });
      await addCard(t, owner, workspaceId, CARD_OK);
      await owner
        .put(endpoints.updateBillingInfo.path(workspaceId), {
          companyName: 'Công ty TNHH Truyền thông Mây Xanh',
          taxCode: '0315123456',
          address: '12 Nguyễn Đình Chiểu, TP. Hồ Chí Minh',
          email: 'ketoan@mayxanh.vn',
        })
        .expect(200);
      expect(
        marketplaceQuoteSchema.parse(
          (await quoteItem(owner, workspaceId, TWO_VERSIONS_ITEM_ID).expect(200)).body,
        ),
      ).toMatchObject({
        version: 2,
        amount: 150_000,
        paymentMethod: { brand: 'visa', last4: '4242', expired: false },
        paymentMethodRequired: false,
        billingCompanyName: 'Công ty TNHH Truyền thông Mây Xanh',
      });
      expect(charge).not.toHaveBeenCalled();
      expect(await invoiceDocs(workspaceId)).toEqual([]);
    });

    it('sends a free item to "Nhận mẫu", says an item held is owned, and finds nothing hidden', async () => {
      const { owner, workspaceId, ownerId } = await owning(null);
      const free = await quoteItem(owner, workspaceId, FREE_ITEM_ID).expect(409);
      expect(problemSchema.parse(free.body).code).toBe('item_free');
      for (const id of [DRAFT_ITEM_ID, WITHDRAWN_ITEM_ID, 'mp-khong-co']) {
        const missing = await quoteItem(owner, workspaceId, id).expect(404);
        expect(problemSchema.parse(missing.body).title, id).toBe('Không tìm thấy mẫu');
      }
      await grantLicence(t, workspaceId, WITHDRAWN_ITEM_ID, { version: 1, grantedBy: ownerId });
      expect(
        marketplaceQuoteSchema.parse(
          (await quoteItem(owner, workspaceId, WITHDRAWN_ITEM_ID).expect(200)).body,
        ),
      ).toMatchObject({ owned: true });
    });

    it('is the owner’s alone, and still answers in a read-only workspace', async () => {
      const { owner, workspaceId } = await owning(null);
      const { client: admin } = await addMember(t, workspaceId, 'admin');
      await quoteItem(admin, workspaceId).expect(403);
      await setReadOnly(t, workspaceId, true);
      await quoteItem(owner, workspaceId).expect(200);
      const refused = await purchaseItem(owner, workspaceId).expect(402);
      expect(problemSchema.parse(refused.body)).toMatchObject({ code: 'workspace_read_only' });
      expect(await invoiceDocs(workspaceId)).toEqual([]);
    });
  });

  describe('a purchase that goes through', () => {
    it('makes a marketplace invoice and grants the licence with it', async () => {
      const { owner, workspaceId, ownerId } = await owning();
      const before = await subscriptionOf(workspaceId);
      const charge = vi.spyOn(fakeGateway(t), 'charge');

      const answer = bought(await purchaseItem(owner, workspaceId).expect(200));
      const invoiceId = answer.invoice.id;
      expect(answer.invoice).toMatchObject({
        kind: 'marketplace',
        item: { itemId: PAID_ITEM_ID, name: 'Khai trương phòng tập', version: 1 },
        planId: null,
        planName: null,
        cycle: null,
        periodStart: null,
        periodEnd: null,
        from: null,
        endsTrial: false,
        amount: 399_000,
        method: 'card',
        card: { brand: 'visa', last4: '4242' },
        status: 'paid',
        payable: false,
        transfer: null,
      });
      expect(answer.licence).toMatchObject({ source: 'purchase', version: 1, termsVersion: 1 });
      expect(answer.invoice.number).toMatch(/^HD-\d{4}-\d{6}$/);
      expect(
        charge.mock.calls.map(([request]) => [request.idempotencyKey, request.amount]),
      ).toEqual([[`${invoiceId}-1`, 399_000]]);

      // The licence names its paid invoice, the buyer and the content of the version sold.
      const v1 = catalog.items.find((item) => item.id === PAID_ITEM_ID)?.versions[0];
      expect(await licencesOf(workspaceId)).toEqual([
        expect.objectContaining({
          itemId: PAID_ITEM_ID,
          source: 'purchase',
          version: 1,
          versionHash: v1 === undefined ? 'none' : versionHashOf(v1.composition),
          invoiceId: oid(invoiceId),
          termsVersion: 1,
          grantedBy: oid(ownerId),
        }),
      ]);
      expect(await purchasesLogged(workspaceId)).toEqual([
        expect.objectContaining({
          actorId: oid(ownerId),
          invoiceId: oid(invoiceId),
          itemId: PAID_ITEM_ID,
          amount: 399_000,
          from: null,
          to: null,
        }),
      ]);
      // The plan is as it was.
      expect(await subscriptionOf(workspaceId)).toEqual(before);

      // Board 31 shows it owned; board 29 lists the invoice and its receipt.
      expect(await detailOf(owner, workspaceId)).toMatchObject({
        owned: true,
        licence: { source: 'purchase', version: 1 },
      });
      const list = await invoicesOf(owner, workspaceId);
      expect(list.items).toEqual([
        expect.objectContaining({ id: invoiceId, kind: 'marketplace', status: 'paid' }),
      ]);
      const receipt = invoiceReceiptSchema.parse(
        (await owner.get(endpoints.getInvoiceReceipt.path(workspaceId, invoiceId)).expect(200))
          .body,
      );
      expect(receipt.invoice).toMatchObject({
        item: { itemId: PAID_ITEM_ID, name: 'Khai trương phòng tập', version: 1 },
        planName: null,
      });
      // The receipt goes as `marketplace-receipt`, never as the plan's `billing-receipt`.
      expect(t.emails.sent.filter((sent) => sent.template === 'billing-receipt')).toEqual([]);

      const again = await purchaseItem(owner, workspaceId).expect(409);
      expect(problemSchema.parse(again.body)).toMatchObject({
        code: 'item_owned',
        context: { licence: { source: 'purchase', version: 1 } },
      });
      expect(charge).toHaveBeenCalledTimes(1);
    });

    it('answers the same key with the same invoice, and refuses it for another item', async () => {
      const { owner, workspaceId } = await owning();
      const charge = vi.spyOn(fakeGateway(t), 'charge');
      const key = 'purchase-key-0001';
      const first = bought(await purchaseItem(owner, workspaceId, purchaseBody(), key).expect(200));
      const second = bought(
        await purchaseItem(owner, workspaceId, purchaseBody(), key).expect(200),
      );
      expect(second).toEqual(first);
      expect(charge).toHaveBeenCalledTimes(1);

      const reused = await purchaseItem(
        owner,
        workspaceId,
        purchaseBody({ itemId: OTHER_PAID_ID, expectedAmount: 499_000 }),
        key,
      ).expect(422);
      expect(problemSchema.parse(reused.body)).toMatchObject({
        code: 'idempotency_key_reused',
        context: { invoiceId: first.invoice.id, invoiceNumber: first.invoice.number },
      });
      expect(await invoiceDocs(workspaceId)).toHaveLength(1);
    });

    it('charges two purchases sent at once only once', async () => {
      const { owner, workspaceId } = await owning();
      const charge = vi.spyOn(fakeGateway(t), 'charge');
      const statuses = (
        await Promise.all([purchaseItem(owner, workspaceId), purchaseItem(owner, workspaceId)])
      )
        .map((response) => response.status)
        .sort();
      expect(statuses).toEqual([200, 409]);
      expect(charge).toHaveBeenCalledTimes(1);
      expect(await invoiceDocs(workspaceId)).toHaveLength(1);
      expect(await licencesOf(workspaceId)).toHaveLength(1);

      // The same key sent twice at once: one invoice, one charge, whatever each answer is.
      const { owner: other, workspaceId: otherId } = await owning();
      const twice = await Promise.all([
        purchaseItem(other, otherId, purchaseBody(), 'same-key-twice'),
        purchaseItem(other, otherId, purchaseBody(), 'same-key-twice'),
      ]);
      expect(twice.map((response) => response.status).sort()).toEqual(
        expect.arrayContaining([200]),
      );
      for (const response of twice) {
        expect([200, 409]).toContain(response.status);
      }
      expect(charge).toHaveBeenCalledTimes(2);
      expect(await invoiceDocs(otherId)).toHaveLength(1);
    });
  });

  describe('a refused purchase', () => {
    it('changes nothing of the plan, and is paid again once the card is changed', async () => {
      const { owner, workspaceId, email } = await owning(CARD_DECLINED);
      const before = await subscriptionOf(workspaceId);

      const refused = await purchaseItem(owner, workspaceId).expect(402);
      const problem = problemSchema.parse(refused.body);
      expect(problem).toMatchObject({
        code: 'payment_failed',
        context: { code: 'card_declined' },
      });
      expect(problem.detail).toContain('Ngân hàng từ chối thẻ');
      expect(problem.detail).toContain('chưa sở hữu mẫu');
      const invoiceId = String(problem.context?.['invoiceId']);
      expect(await invoiceOf(owner, workspaceId, invoiceId)).toMatchObject({
        status: 'failed',
        payable: true,
        lastAttempt: { outcome: 'failed', code: 'card_declined' },
      });
      expect(await licencesOf(workspaceId)).toEqual([]);

      // No grace, no due invoice, no banner, no email of the plan (ADR-036).
      expect(await subscriptionOf(workspaceId)).toEqual(before);
      expect(
        billingSummarySchema.parse(
          (await owner.get(endpoints.getBillingSummary.path(workspaceId)).expect(200)).body,
        ),
      ).toMatchObject({ state: 'trialing', dueInvoice: null, failedSince: null });
      expect(
        workspacePlanSchema.parse(
          (await owner.get(endpoints.getWorkspacePlan.path(workspaceId)).expect(200)).body,
        ),
      ).toMatchObject({ paymentWaiting: false, access: 'full' });
      expect(
        t.emails.sent.filter(
          (sent) => sent.template === 'billing-charge-failed' && sent.to.includes(email),
        ),
      ).toEqual([]);

      // Not by transfer: a marketplace item is paid by card.
      const transfer = await owner
        .post(endpoints.startInvoiceTransfer.path(workspaceId, invoiceId))
        .expect(409);
      expect(problemSchema.parse(transfer.body).code).toBe('invoice_not_payable');

      await addCard(t, owner, workspaceId, CARD_OK);
      const paid = await payInvoice(owner, workspaceId, invoiceId).expect(200);
      expect(payInvoiceResponseSchema.parse(paid.body).invoice).toMatchObject({ status: 'paid' });
      expect(await licencesOf(workspaceId)).toEqual([
        expect.objectContaining({ source: 'purchase', invoiceId: oid(invoiceId) }),
      ]);
    });

    it('is voided by a new purchase of the item, and is no longer payable then', async () => {
      const { owner, workspaceId } = await owning(CARD_NO_FUNDS);
      const refused = await purchaseItem(owner, workspaceId).expect(402);
      const firstId = String(problemSchema.parse(refused.body).context?.['invoiceId']);
      expect(problemSchema.parse(refused.body).detail).toContain('Thẻ không đủ hạn mức');

      await addCard(t, owner, workspaceId, CARD_OK);
      const answer = bought(await purchaseItem(owner, workspaceId).expect(200));
      expect(await invoiceOf(owner, workspaceId, firstId)).toMatchObject({
        status: 'void',
        payable: false,
      });
      expect(answer.invoice.id).not.toBe(firstId);
      const again = await payInvoice(owner, workspaceId, firstId).expect(409);
      expect(problemSchema.parse(again.body).code).toBe('invoice_not_payable');
    });
  });

  describe('the item’s checks, in order', () => {
    it('refuses what is not on sale, a free item, and a quote that moved', async () => {
      const { owner, workspaceId, ownerId } = await owning();
      for (const itemId of [DRAFT_ITEM_ID, WITHDRAWN_ITEM_ID, 'mp-khong-co']) {
        const missing = await purchaseItem(owner, workspaceId, purchaseBody({ itemId })).expect(
          404,
        );
        expect(problemSchema.parse(missing.body).title, itemId).toBe('Không tìm thấy mẫu');
      }
      const free = await purchaseItem(
        owner,
        workspaceId,
        purchaseBody({ itemId: FREE_ITEM_ID, expectedAmount: 0 }),
      ).expect(409);
      expect(problemSchema.parse(free.body).code).toBe('item_free');
      for (const moved of [
        purchaseBody({ version: 2 }),
        purchaseBody({ expectedAmount: 299_000 }),
        purchaseBody({ termsVersion: 2 }),
      ]) {
        const changed = await purchaseItem(owner, workspaceId, moved).expect(409);
        expect(problemSchema.parse(changed.body)).toMatchObject({
          code: 'item_changed',
          context: { version: 1, price: 399_000, termsVersion: 1 },
        });
      }
      // An item held answers before the quote is compared.
      await grantLicence(t, workspaceId, PAID_ITEM_ID, {
        version: 1,
        grantedBy: ownerId,
        source: 'free',
      });
      const owned = await purchaseItem(owner, workspaceId, purchaseBody({ version: 9 })).expect(
        409,
      );
      expect(problemSchema.parse(owned.body)).toMatchObject({
        code: 'item_owned',
        context: { licence: { source: 'free', version: 1 } },
      });
      expect(await invoiceDocs(workspaceId)).toEqual([]);
    });

    it('asks for a card that can pay, after everything else', async () => {
      const { owner, workspaceId } = await owning(null);
      const changed = await purchaseItem(owner, workspaceId, purchaseBody({ version: 2 })).expect(
        409,
      );
      expect(problemSchema.parse(changed.body).code).toBe('item_changed');
      const noCard = await purchaseItem(owner, workspaceId).expect(422);
      expect(problemSchema.parse(noCard.body).code).toBe('payment_method_required');
      await addCard(t, owner, workspaceId, CARD_OK, { expMonth: 1, expYear: 2020 });
      const expired = await purchaseItem(owner, workspaceId).expect(422);
      expect(problemSchema.parse(expired.body)).toMatchObject({
        code: 'payment_method_required',
        title: 'Thẻ đã lưu đã hết hạn',
      });
      expect(await invoiceDocs(workspaceId)).toEqual([]);
    });

    it('needs the Idempotency-Key and the owner', async () => {
      const { owner, workspaceId } = await owning();
      const noKey = await owner
        .post(endpoints.purchaseMarketplaceItem.path(workspaceId), purchaseBody())
        .expect(422);
      expect(problemSchema.parse(noKey.body).code).toBe('validation_failed');
      const { client: admin } = await addMember(t, workspaceId, 'admin');
      await purchaseItem(admin, workspaceId).expect(403);
      expect(await invoiceDocs(workspaceId)).toEqual([]);
    });
  });

  describe('a charge the gateway decides later', () => {
    it('answers 202, blocks other charges, and the event grants the licence once', async () => {
      const { owner, workspaceId } = await owning();
      vi.spyOn(fakeGateway(t), 'charge').mockResolvedValueOnce({ status: 'pending' });
      const pending = bought(await purchaseItem(owner, workspaceId).expect(202));
      expect(pending).toMatchObject({ invoice: { status: 'pending' }, licence: null });
      expect(await licencesOf(workspaceId)).toEqual([]);

      const blocked = await purchaseItem(
        owner,
        workspaceId,
        purchaseBody({ itemId: OTHER_PAID_ID, expectedAmount: 499_000 }),
      ).expect(409);
      expect(problemSchema.parse(blocked.body).code).toBe('payment_in_progress');
      const plan = await owner
        .post(endpoints.changePlan.path(workspaceId), {
          planId: 'agency',
          cycle: 'monthly',
          payNow: true,
          expectedAmount: 599_000,
        })
        .expect(409);
      expect(problemSchema.parse(plan.body).code).toBe('payment_in_progress');

      const event = chargeEvent('charge_succeeded', pending.invoice);
      await postGatewayEvent(t, event).expect(200);
      await postGatewayEvent(t, event).expect(200);
      expect(await invoiceOf(owner, workspaceId, pending.invoice.id)).toMatchObject({
        status: 'paid',
      });
      expect(await licencesOf(workspaceId)).toEqual([
        expect.objectContaining({ source: 'purchase', invoiceId: oid(pending.invoice.id) }),
      ]);
      expect(await purchasesLogged(workspaceId)).toHaveLength(1);
    });

    it('fails the invoice when the gateway refuses it, and the plan stays as it was', async () => {
      const { owner, workspaceId } = await owning();
      vi.spyOn(fakeGateway(t), 'charge').mockResolvedValueOnce({ status: 'pending' });
      const pending = bought(await purchaseItem(owner, workspaceId).expect(202));
      const before = await subscriptionOf(workspaceId);
      await postGatewayEvent(t, chargeEvent('charge_failed', pending.invoice)).expect(200);
      expect(await invoiceOf(owner, workspaceId, pending.invoice.id)).toMatchObject({
        status: 'failed',
        payable: true,
      });
      expect(await licencesOf(workspaceId)).toEqual([]);
      expect(await subscriptionOf(workspaceId)).toEqual(before);
    });

    it('keeps the licence a workspace came to hold meanwhile, and reports the payment', async () => {
      const { owner, workspaceId, ownerId } = await owning();
      vi.spyOn(fakeGateway(t), 'charge').mockResolvedValueOnce({ status: 'pending' });
      const pending = bought(await purchaseItem(owner, workspaceId).expect(202));
      // The item became free and was claimed while the gateway decided.
      await grantLicence(t, workspaceId, PAID_ITEM_ID, {
        version: 1,
        grantedBy: ownerId,
        source: 'free',
      });
      const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      await postGatewayEvent(t, chargeEvent('charge_succeeded', pending.invoice)).expect(200);
      expect(await invoiceOf(owner, workspaceId, pending.invoice.id)).toMatchObject({
        status: 'paid',
      });
      expect(await licencesOf(workspaceId)).toEqual([
        expect.objectContaining({ source: 'free', invoiceId: null }),
      ]);
      expect(await purchasesLogged(workspaceId)).toEqual([]);
      expect(logged).toHaveBeenCalledWith(
        expect.objectContaining({ invoiceId: pending.invoice.id }),
        expect.stringContaining('refund it outside the system'),
      );
    });
  });

  describe('a charge whose outcome is unknown', () => {
    it('blocks every charge until "Thanh toán lại" asks the gateway with the same key', async () => {
      const { owner, workspaceId } = await owning();
      const charge = vi
        .spyOn(fakeGateway(t), 'charge')
        .mockRejectedValueOnce(new Error('socket hang up'));
      const unknown = await purchaseItem(owner, workspaceId).expect(503);
      const problem = problemSchema.parse(unknown.body);
      expect(problem.code).toBe('gateway_unavailable');
      expect(problem.detail).toContain('Đừng mua lại');
      const invoiceId = String(problem.context?.['invoiceId']);
      expect(await invoiceOf(owner, workspaceId, invoiceId)).toMatchObject({
        status: 'open',
        payable: true,
        lastAttempt: { outcome: 'unknown' },
      });

      const other = await purchaseItem(
        owner,
        workspaceId,
        purchaseBody({ itemId: OTHER_PAID_ID, expectedAmount: 499_000 }),
      ).expect(409);
      expect(problemSchema.parse(other.body)).toMatchObject({
        code: 'payment_in_progress',
        context: { invoiceId },
      });

      const paid = await payInvoice(owner, workspaceId, invoiceId).expect(200);
      expect(payInvoiceResponseSchema.parse(paid.body).invoice).toMatchObject({ status: 'paid' });
      expect(charge.mock.calls.map(([request]) => request.idempotencyKey)).toEqual([
        `${invoiceId}-1`,
        `${invoiceId}-1`,
      ]);
      expect(await licencesOf(workspaceId)).toHaveLength(1);
    });

    it('is asked about again by the billing job until it is known', async () => {
      const { owner, workspaceId } = await owning();
      const start = new Date(Date.now() + MINUTE_MS);
      clock.set(start);
      const charge = vi
        .spyOn(fakeGateway(t), 'charge')
        .mockRejectedValueOnce(new Error('socket hang up'));
      const unknown = await purchaseItem(owner, workspaceId).expect(503);
      const invoiceId = String(problemSchema.parse(unknown.body).context?.['invoiceId']);
      const askAt: unknown = (await subscriptionOf(workspaceId))?.['nextActionAt'];
      expect(askAt).toBeInstanceOf(Date);
      const at = askAt instanceof Date ? askAt : start;
      expect(at.getTime()).toBeGreaterThanOrEqual(start.getTime() + SETTLE_FIRST_MS - 1);
      expect(at.getTime()).toBeLessThan(start.getTime() + SETTLE_FIRST_MS + MINUTE_MS);

      clock.set(at);
      await t.app.get(BillingScheduler).runDue();
      expect(charge.mock.calls.map(([request]) => request.idempotencyKey)).toEqual([
        `${invoiceId}-1`,
        `${invoiceId}-1`,
      ]);
      expect(await invoiceOf(owner, workspaceId, invoiceId)).toMatchObject({ status: 'paid' });
      expect(await licencesOf(workspaceId)).toEqual([
        expect.objectContaining({ source: 'purchase', invoiceId: oid(invoiceId) }),
      ]);
    });

    it('is voided by the job, without asking, once the workspace holds the item', async () => {
      const { owner, workspaceId, ownerId } = await owning();
      const start = new Date(Date.now() + MINUTE_MS);
      clock.set(start);
      const charge = vi
        .spyOn(fakeGateway(t), 'charge')
        .mockRejectedValueOnce(new Error('socket hang up'));
      const unknown = await purchaseItem(owner, workspaceId).expect(503);
      const invoiceId = String(problemSchema.parse(unknown.body).context?.['invoiceId']);
      await grantLicence(t, workspaceId, PAID_ITEM_ID, {
        version: 1,
        grantedBy: ownerId,
        source: 'free',
      });
      expect(await invoiceOf(owner, workspaceId, invoiceId)).toMatchObject({ payable: false });
      const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      clock.set(new Date(start.getTime() + SETTLE_FIRST_MS + MINUTE_MS));
      await t.app.get(BillingScheduler).runDue();
      expect(charge).toHaveBeenCalledTimes(1);
      expect(await invoiceOf(owner, workspaceId, invoiceId)).toMatchObject({ status: 'void' });
      expect(logged).toHaveBeenCalledWith(
        expect.objectContaining({ invoiceId }),
        expect.stringContaining('refund it outside the system'),
      );
      // Nothing undecided is left to block a charge.
      expect(
        bought(
          await purchaseItem(
            owner,
            workspaceId,
            purchaseBody({ itemId: OTHER_PAID_ID, expectedAmount: 499_000 }),
          ).expect(200),
        ).invoice.status,
      ).toBe('paid');
    });
  });

  describe('the licence and the paid invoice', () => {
    it('are written together: a failure of either leaves neither, and paying again settles it', async () => {
      const { owner, workspaceId } = await owning();
      vi.spyOn(MarketplaceLicencesRepository.prototype, 'grant').mockRejectedValueOnce(
        new Error('Granting the licence failed'),
      );
      await purchaseItem(owner, workspaceId).expect(500);
      const [stuck] = await invoiceDocs(workspaceId);
      expect(stuck).toMatchObject({ status: 'open', attempts: [] });
      expect(await licencesOf(workspaceId)).toEqual([]);
      const invoiceId = String(stuck?.['_id']);

      // The log of the purchase fails after the licence was written: both roll back.
      const log = t.app.get(BillingLogRepository);
      const record = log.record.bind(log);
      vi.spyOn(log, 'record').mockImplementation((ref, entry, tx) =>
        entry.action === 'marketplace_purchased'
          ? Promise.reject(new Error('Logging the purchase failed'))
          : record(ref, entry, tx),
      );
      await payInvoice(owner, workspaceId, invoiceId).expect(500);
      expect(await invoiceDocs(workspaceId)).toEqual([
        expect.objectContaining({ status: 'open', attempts: [] }),
      ]);
      expect(await licencesOf(workspaceId)).toEqual([]);
      vi.restoreAllMocks();

      // The gateway answers the same key again: one charge, now paid with its licence.
      const charge = vi.spyOn(fakeGateway(t), 'charge');
      await payInvoice(owner, workspaceId, invoiceId).expect(200);
      expect(charge.mock.calls.map(([request]) => request.idempotencyKey)).toEqual([
        `${invoiceId}-1`,
      ]);
      expect(await licencesOf(workspaceId)).toEqual([
        expect.objectContaining({ invoiceId: oid(invoiceId) }),
      ]);
      expect(await purchasesLogged(workspaceId)).toHaveLength(1);
    });

    it('answers 409 payment_not_applied when the item was held by the time it was paid', async () => {
      const { owner, workspaceId, ownerId } = await owning();
      const gateway = fakeGateway(t);
      const charge = gateway.charge.bind(gateway);
      vi.spyOn(gateway, 'charge').mockImplementation(async (request) => {
        await grantLicence(t, workspaceId, PAID_ITEM_ID, {
          version: 1,
          grantedBy: ownerId,
          source: 'free',
        });
        return charge(request);
      });
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const key = 'not-applied-key-1';
      const refused = await purchaseItem(owner, workspaceId, purchaseBody(), key).expect(409);
      expect(problemSchema.parse(refused.body)).toMatchObject({ code: 'payment_not_applied' });
      const [invoice] = await invoiceDocs(workspaceId);
      expect(invoice).toMatchObject({ status: 'paid' });
      expect(await licencesOf(workspaceId)).toEqual([
        expect.objectContaining({ source: 'free', invoiceId: null }),
      ]);
      // Sent again, the same answer.
      const again = await purchaseItem(owner, workspaceId, purchaseBody(), key).expect(409);
      expect(problemSchema.parse(again.body).code).toBe('payment_not_applied');
    });
  });

  describe('the card page of a purchase', () => {
    it('leads back to board 31 of the item, never to an address from the request', async () => {
      const { owner, workspaceId } = await owning(null);
      const setup = await owner
        .post(endpoints.startPaymentMethodSetup.path(workspaceId), {
          returnTo: 'marketplace',
          itemId: PAID_ITEM_ID,
        })
        .expect(200);
      const url = new URL(methodSetupResponseSchema.parse(setup.body).url);
      expect(fakeGateway(t).setupSession(url.searchParams.get('session') ?? '')).toMatchObject({
        returnUrl: `${TEST_ADMIN_ORIGIN}/workspaces/${workspaceId}/marketplace/${PAID_ITEM_ID}?paymentMethod=saved`,
        cancelUrl: `${TEST_ADMIN_ORIGIN}/workspaces/${workspaceId}/marketplace/${PAID_ITEM_ID}?paymentMethod=canceled`,
      });
      for (const body of [
        { returnTo: 'marketplace', itemId: 'mp-khong-co' },
        { returnTo: 'marketplace', itemId: DRAFT_ITEM_ID },
        { returnTo: 'marketplace' },
        { returnTo: 'marketplace', itemId: 'https://evil.test' },
      ]) {
        const refused = await owner
          .post(endpoints.startPaymentMethodSetup.path(workspaceId), body)
          .expect(422);
        expect(problemSchema.parse(refused.body).code).toBe('validation_failed');
      }
    });
  });

  describe('another workspace', () => {
    it('cannot quote, buy, see or pay a workspace’s invoices; its keys are its own', async () => {
      const a = await owning();
      const b = await owning();
      const key = 'shared-key-0001';
      const bought1 = bought(
        await purchaseItem(a.owner, a.workspaceId, purchaseBody(), key).expect(200),
      );
      const invoiceId = bought1.invoice.id;

      await quoteItem(b.owner, a.workspaceId).expect(404);
      await purchaseItem(b.owner, a.workspaceId).expect(404);
      await b.owner.get(endpoints.getInvoice.path(a.workspaceId, invoiceId)).expect(404);
      await b.owner.get(endpoints.getInvoice.path(b.workspaceId, invoiceId)).expect(404);
      await b.owner.get(endpoints.getInvoiceReceipt.path(b.workspaceId, invoiceId)).expect(404);
      await payInvoice(b.owner, b.workspaceId, invoiceId).expect(404);
      await b.owner.post(endpoints.startInvoiceTransfer.path(b.workspaceId, invoiceId)).expect(404);

      // The same key in another workspace is another purchase.
      const own = bought(
        await purchaseItem(b.owner, b.workspaceId, purchaseBody(), key).expect(200),
      );
      expect(own.invoice.id).not.toBe(invoiceId);
      expect(await licencesOf(b.workspaceId)).toHaveLength(1);
      expect(await detailOf(b.owner, b.workspaceId)).toMatchObject({ owned: true });
      expect((await invoicesOf(b.owner, b.workspaceId)).items.map((item) => item.id)).toEqual([
        own.invoice.id,
      ]);
    });
  });
});

describe('buying with payments turned off (PAYMENT_PROVIDER=none)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_mp_purchases_off', {
      env: { PAYMENT_PROVIDER: 'none', PLAN_CATALOG_FILE: BUNDLED_PLAN_CATALOG_FILE },
    });
  });

  afterAll(async () => {
    await t.close();
  });

  it('says so in the quote, and refuses a purchase after the item’s own checks', async () => {
    const { client: owner, workspaceId } = await signedUpClient(t.app);
    expect(
      marketplaceQuoteSchema.parse((await quoteItem(owner, workspaceId).expect(200)).body),
    ).toMatchObject({ paymentsEnabled: false, paymentMethodRequired: true });
    const free = await purchaseItem(
      owner,
      workspaceId,
      purchaseBody({ itemId: FREE_ITEM_ID, expectedAmount: 0 }),
    ).expect(409);
    expect(problemSchema.parse(free.body).code).toBe('item_free');
    const off = await purchaseItem(owner, workspaceId, purchaseBody({ version: 9 })).expect(503);
    expect(problemSchema.parse(off.body).code).toBe('payments_disabled');
  });
});
