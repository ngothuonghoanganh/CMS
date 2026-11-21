import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { Logger } from '@nestjs/common';
import {
  endpoints,
  type GatewayEvent,
  type InvoiceSummary,
  marketplaceItemDetailSchema,
  type MarketplacePurchaseResponse,
  marketplacePurchaseResponseSchema,
  marketplaceSuggestionResponseSchema,
  problemSchema,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { setReadOnly } from '../../../test/billing.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { TEST_ADMIN_ORIGIN } from '../../../test/env.js';
import {
  claimPath,
  DRAFT_ITEM_ID,
  FREE_ITEM_ID,
  grantLicence,
  licenceVersionPath,
  marketplaceCatalogFile,
  PAID_ITEM_ID,
  purchaseBody,
  purchaseItem,
  testMarketplaceCatalog,
  TWO_VERSIONS_ITEM_ID,
  WITHDRAWN_ITEM_ID,
} from '../../../test/marketplace.js';
import {
  addCard,
  CARD_DECLINED,
  CARD_OK,
  fakeGateway,
  newEventId,
  payInvoice,
  postGatewayEvent,
} from '../../../test/payments.js';
import { addMember } from '../../../test/resources.js';
import { BUNDLED_PLAN_CATALOG_FILE } from '../../config/env.js';

/** The items of the test catalog the file uses; the last is a paid item with two versions. */
const PAID_NAME = 'Khai trương phòng tập';
const TWO_VERSIONS_NAME = 'Mẫu có hai phiên bản';

describe('the emails of the marketplace (ADR-036, MP3)', () => {
  let t: TestApp;
  const catalog = testMarketplaceCatalog();
  const catalogFile = marketplaceCatalogFile(catalog);

  beforeAll(async () => {
    t = await createTestApp('plp_test_mp_emails', {
      env: { PLAN_CATALOG_FILE: BUNDLED_PLAN_CATALOG_FILE, MARKETPLACE_CATALOG_FILE: catalogFile },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await t.close();
    rmSync(dirname(catalogFile), { recursive: true, force: true });
  });

  const oid = (id: string) => new Types.ObjectId(id);
  const emailsTo = (address: string, template: string) =>
    t.emails.sent.filter((sent) => sent.template === template && sent.to.includes(address));
  /** One field of an email's data, whatever its template. */
  const dataField = (sent: { data: object }, name: string): unknown =>
    Object.entries(sent.data).find(([key]) => key === name)?.[1];
  const noticesOf = (workspaceId: string) =>
    t.connection
      .collection('billing_notices')
      .find({ workspaceId: oid(workspaceId) })
      .sort({ _id: 1 })
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

  function chargeSucceeded(invoice: Pick<InvoiceSummary, 'id' | 'amount'>): GatewayEvent {
    return {
      kind: 'charge_succeeded',
      eventId: newEventId(),
      occurredAt: new Date().toISOString(),
      reference: invoice.id,
      idempotencyKey: `${invoice.id}-1`,
      amount: invoice.amount,
    };
  }

  describe('the receipt of an item bought', () => {
    it('goes to the owner once for a paid invoice, with its item, and is not the plan’s receipt', async () => {
      const { owner, workspaceId, email } = await owning();
      const { invoice } = bought(await purchaseItem(owner, workspaceId).expect(200));
      expect(emailsTo(email, 'billing-receipt')).toEqual([]);
      const [receipt] = emailsTo(email, 'marketplace-receipt');
      expect(emailsTo(email, 'marketplace-receipt')).toHaveLength(1);
      expect(receipt).toMatchObject({
        idempotencyKey: `marketplace-receipt:${invoice.id}`,
        data: {
          workspaceName: expect.any(String) as unknown,
          invoiceNumber: invoice.number,
          itemName: PAID_NAME,
          version: 1,
          amount: '399.000 ₫',
          paidOn: expect.stringMatching(/^\d{2}\/\d{2}\/\d{4}$/) as unknown,
          method: 'Thẻ Visa •••• 4242',
          receiptUrl: `${TEST_ADMIN_ORIGIN}/workspaces/${workspaceId}/billing/receipts/${invoice.id}`,
          templateUrl: `${TEST_ADMIN_ORIGIN}/workspaces/${workspaceId}/templates/${PAID_ITEM_ID}`,
        },
      });
      expect(receipt?.subject).toBe(`Biên nhận ${invoice.number} · Mẫu “${PAID_NAME}”`);
      expect(await noticesOf(workspaceId)).toEqual([
        expect.objectContaining({
          _id: `marketplace-receipt:${invoice.id}`,
          template: 'marketplace-receipt',
        }),
      ]);
    });

    it('is not sent again when the same invoice is paid again by the event of its charge', async () => {
      const { owner, workspaceId, email } = await owning();
      const charge = vi
        .spyOn(fakeGateway(t), 'charge')
        .mockRejectedValueOnce(new Error('socket hang up'));
      const unknown = await purchaseItem(owner, workspaceId).expect(503);
      const invoiceId = String(problemSchema.parse(unknown.body).context?.['invoiceId']);
      expect(emailsTo(email, 'marketplace-receipt')).toEqual([]);

      // "Thanh toán lại" asks the gateway again and pays it.
      const retried = await payInvoice(owner, workspaceId, invoiceId).expect(200);
      expect(charge).toHaveBeenCalledTimes(2);
      const invoice = (retried.body as { invoice: InvoiceSummary }).invoice;
      expect(invoice.status).toBe('paid');
      expect(emailsTo(email, 'marketplace-receipt')).toHaveLength(1);

      // The gateway's own event for that charge comes after, twice.
      const event = chargeSucceeded(invoice);
      await postGatewayEvent(t, event).expect(200);
      await postGatewayEvent(t, event).expect(200);
      await postGatewayEvent(t, chargeSucceeded(invoice)).expect(200);
      expect(emailsTo(email, 'marketplace-receipt')).toHaveLength(1);
      // Buying it again is refused as owned, and sends nothing.
      await purchaseItem(owner, workspaceId).expect(409);
      expect(emailsTo(email, 'marketplace-receipt')).toHaveLength(1);
    });

    it('goes out when the gateway’s event pays the invoice, once however often it arrives', async () => {
      const { owner, workspaceId, email } = await owning();
      vi.spyOn(fakeGateway(t), 'charge').mockResolvedValueOnce({ status: 'pending' });
      const { invoice } = bought(await purchaseItem(owner, workspaceId).expect(202));
      expect(emailsTo(email, 'marketplace-receipt')).toEqual([]);
      const event = chargeSucceeded(invoice);
      await postGatewayEvent(t, event).expect(200);
      await postGatewayEvent(t, event).expect(200);
      await postGatewayEvent(t, chargeSucceeded(invoice)).expect(200);
      expect(emailsTo(email, 'marketplace-receipt')).toEqual([
        expect.objectContaining({
          idempotencyKey: `marketplace-receipt:${invoice.id}`,
          data: expect.objectContaining({ invoiceNumber: invoice.number, version: 1 }) as unknown,
        }),
      ]);
    });

    it('names each invoice: two items bought are two receipts', async () => {
      const { owner, workspaceId, email } = await owning();
      bought(await purchaseItem(owner, workspaceId).expect(200));
      bought(
        await purchaseItem(
          owner,
          workspaceId,
          purchaseBody({ itemId: TWO_VERSIONS_ITEM_ID, version: 2, expectedAmount: 150_000 }),
        ).expect(200),
      );
      expect(
        emailsTo(email, 'marketplace-receipt').map((sent) => dataField(sent, 'itemName')),
      ).toEqual([PAID_NAME, TWO_VERSIONS_NAME]);
      expect(
        emailsTo(email, 'marketplace-receipt').map((sent) => dataField(sent, 'version')),
      ).toEqual([1, 2]);
    });

    it('is not sent for a payment that granted nothing: the workspace held the item already', async () => {
      const { owner, workspaceId, ownerId, email } = await owning();
      vi.spyOn(fakeGateway(t), 'charge').mockResolvedValueOnce({ status: 'pending' });
      const { invoice } = bought(await purchaseItem(owner, workspaceId).expect(202));
      await grantLicence(t, workspaceId, PAID_ITEM_ID, {
        version: 1,
        grantedBy: ownerId,
        source: 'free',
      });
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      await postGatewayEvent(t, chargeSucceeded(invoice)).expect(200);
      expect(emailsTo(email, 'marketplace-receipt')).toEqual([]);
      expect(await noticesOf(workspaceId)).toEqual([]);
    });

    it('is not sent for a refused purchase', async () => {
      const { owner, workspaceId, email } = await owning(CARD_DECLINED);
      await purchaseItem(owner, workspaceId).expect(402);
      expect(emailsTo(email, 'marketplace-receipt')).toEqual([]);
      expect(emailsTo(email, 'billing-charge-failed')).toEqual([]);
    });

    it('gives its key back when it cannot be sent, and the purchase still stands', async () => {
      const { owner, workspaceId, email } = await owning();
      t.emails.failNext('smtp_unavailable');
      const warned = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { invoice, licence } = bought(await purchaseItem(owner, workspaceId).expect(200));
      expect(licence).not.toBeNull();
      expect(emailsTo(email, 'marketplace-receipt')).toEqual([]);
      expect(await noticesOf(workspaceId)).toEqual([]);
      expect(warned).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId, template: 'marketplace-receipt' }),
        'Email of the plan not sent',
      );
      expect(
        (await owner.get(endpoints.getInvoiceReceipt.path(workspaceId, invoice.id)).expect(200))
          .body,
      ).toMatchObject({ invoice: { number: invoice.number } });
    });

    it('is not sent for a free item claimed, nor for a licence moved to a new version', async () => {
      const { owner, workspaceId, ownerId, email } = await owning(null);
      await owner
        .post(claimPath(workspaceId, FREE_ITEM_ID), { version: 1, termsVersion: 1 })
        .expect(200);
      await grantLicence(t, workspaceId, TWO_VERSIONS_ITEM_ID, { version: 1, grantedBy: ownerId });
      await owner
        .post(licenceVersionPath(workspaceId, TWO_VERSIONS_ITEM_ID), { baseVersion: 1 })
        .expect(200);
      expect(t.emails.to(email).map((sent) => sent.template)).toEqual([]);
      expect(await noticesOf(workspaceId)).toEqual([]);
    });
  });

  describe('"Đề xuất {tên} mua"', () => {
    const suggestionPath = (workspaceId: string, itemId = PAID_ITEM_ID) =>
      endpoints.suggestMarketplaceItem.path(workspaceId, itemId);

    /** A workspace with its owner and an editor, who cannot buy. */
    async function workspace() {
      const owning = await signedUpClient(t.app);
      const editor = await addMember(t, owning.workspaceId, 'editor');
      return {
        owner: owning.client,
        workspaceId: owning.workspaceId,
        ownerId: owning.me.user.id,
        ownerEmail: owning.me.user.email,
        ownerName: owning.me.user.name,
        editor: editor.client,
        editorId: editor.me.user.id,
        editorName: editor.me.user.name,
      };
    }

    async function detailOf(client: TestClient, workspaceId: string, itemId = PAID_ITEM_ID) {
      return marketplaceItemDetailSchema.parse(
        (await client.get(endpoints.getMarketplaceItem.path(workspaceId, itemId)).expect(200)).body,
      );
    }

    it('emails the owner once per member and item, and the repeat answers 200 and sends nothing', async () => {
      const { editor, workspaceId, ownerEmail, ownerName, editorId, editorName } =
        await workspace();
      expect((await detailOf(editor, workspaceId)).suggested).toBe(false);

      const first = marketplaceSuggestionResponseSchema.parse(
        (await editor.post(suggestionPath(workspaceId)).expect(200)).body,
      );
      expect(first).toEqual({
        alreadySuggested: false,
        message: `Đã gửi đề xuất tới ${ownerName}.`,
      });
      expect(emailsTo(ownerEmail, 'marketplace-suggestion')).toEqual([
        expect.objectContaining({
          idempotencyKey: `marketplace-suggestion:${workspaceId}:${editorId}:${PAID_ITEM_ID}`,
          subject: `${editorName} đề xuất mua mẫu “${PAID_NAME}”`,
          data: {
            workspaceName: expect.any(String) as unknown,
            memberName: editorName,
            itemName: PAID_NAME,
            price: '399.000 ₫',
            itemUrl: `${TEST_ADMIN_ORIGIN}/workspaces/${workspaceId}/marketplace/${PAID_ITEM_ID}`,
          },
        }),
      ]);
      expect(await detailOf(editor, workspaceId)).toMatchObject({ suggested: true });

      const again = marketplaceSuggestionResponseSchema.parse(
        (await editor.post(suggestionPath(workspaceId)).expect(200)).body,
      );
      expect(again).toEqual({
        alreadySuggested: true,
        message: `Bạn đã đề xuất ${ownerName} mua mẫu này trước đó.`,
      });
      expect(emailsTo(ownerEmail, 'marketplace-suggestion')).toHaveLength(1);

      // Another item is another suggestion.
      await editor.post(suggestionPath(workspaceId, TWO_VERSIONS_ITEM_ID)).expect(200);
      expect(emailsTo(ownerEmail, 'marketplace-suggestion')).toHaveLength(2);
      expect(await detailOf(editor, workspaceId, TWO_VERSIONS_ITEM_ID)).toMatchObject({
        suggested: true,
      });
    });

    it('is the member’s own: another member and the owner see no suggestion of theirs', async () => {
      const { editor, editorName, owner, workspaceId, ownerEmail } = await workspace();
      const viewer = await addMember(t, workspaceId, 'viewer');
      await editor.post(suggestionPath(workspaceId)).expect(200);
      expect((await detailOf(viewer.client, workspaceId)).suggested).toBe(false);
      expect((await detailOf(owner, workspaceId)).suggested).toBe(false);
      // The viewer's own request is a second email, from them.
      await viewer.client.post(suggestionPath(workspaceId)).expect(200);
      expect(
        emailsTo(ownerEmail, 'marketplace-suggestion').map((sent) => dataField(sent, 'memberName')),
      ).toEqual([editorName, viewer.me.user.name]);
      expect((await detailOf(viewer.client, workspaceId)).suggested).toBe(true);
    });

    it('sends one email for requests made at once', async () => {
      const { editor, workspaceId, ownerEmail } = await workspace();
      const answers = await Promise.all(
        Array.from({ length: 4 }, () => editor.post(suggestionPath(workspaceId))),
      );
      expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200, 200]);
      expect(
        answers
          .map((answer) => marketplaceSuggestionResponseSchema.parse(answer.body))
          .filter((answer) => !answer.alreadySuggested),
      ).toHaveLength(1);
      expect(emailsTo(ownerEmail, 'marketplace-suggestion')).toHaveLength(1);
    });

    it('is refused to the owner, who buys, and to a stranger, who finds nothing', async () => {
      const { owner, workspaceId, ownerEmail } = await workspace();
      const refused = await owner.post(suggestionPath(workspaceId)).expect(403);
      expect(problemSchema.parse(refused.body)).toMatchObject({
        code: 'forbidden',
        title: 'Chủ sở hữu mua mẫu trực tiếp ở Marketplace, không cần đề xuất',
      });
      const stranger = (await signedUpClient(t.app)).client;
      expect(
        problemSchema.parse((await stranger.post(suggestionPath(workspaceId)).expect(404)).body),
      ).toMatchObject({ title: 'Không tìm thấy workspace' });
      expect(emailsTo(ownerEmail, 'marketplace-suggestion')).toEqual([]);
      expect(await noticesOf(workspaceId)).toEqual([]);
    });

    it('is open to every role that cannot buy, a member kept to a site and a read-only workspace', async () => {
      const { workspaceId, ownerEmail } = await workspace();
      const roles = ['admin', 'editor', 'contributor', 'viewer'] as const;
      const asked: string[] = [];
      for (const role of roles) {
        const member = await addMember(t, workspaceId, role);
        await member.client.post(suggestionPath(workspaceId)).expect(200);
        asked.push(member.me.user.name);
      }
      const kept = await addMember(t, workspaceId, 'editor', [new Types.ObjectId().toHexString()]);
      await kept.client.post(suggestionPath(workspaceId)).expect(200);
      asked.push(kept.me.user.name);
      await setReadOnly(t, workspaceId, true);
      const late = await addMember(t, workspaceId, 'viewer');
      await late.client.post(suggestionPath(workspaceId)).expect(200);
      asked.push(late.me.user.name);
      await setReadOnly(t, workspaceId, false);
      expect(
        emailsTo(ownerEmail, 'marketplace-suggestion').map((sent) => dataField(sent, 'memberName')),
      ).toEqual(asked);
    });

    it('finds nothing for an item not on sale, and says what an item owned or free is', async () => {
      const { editor, workspaceId, ownerId, ownerEmail } = await workspace();
      for (const id of [DRAFT_ITEM_ID, WITHDRAWN_ITEM_ID, 'mp-khong-co', 'nha-khoa-uu-dai']) {
        const missing = await editor.post(suggestionPath(workspaceId, id)).expect(404);
        expect(problemSchema.parse(missing.body).title, id).toBe('Không tìm thấy mẫu');
      }
      const free = await editor.post(suggestionPath(workspaceId, FREE_ITEM_ID)).expect(409);
      expect(problemSchema.parse(free.body)).toMatchObject({ code: 'item_free' });

      await grantLicence(t, workspaceId, PAID_ITEM_ID, { version: 1, grantedBy: ownerId });
      await grantLicence(t, workspaceId, WITHDRAWN_ITEM_ID, { version: 1, grantedBy: ownerId });
      for (const id of [PAID_ITEM_ID, WITHDRAWN_ITEM_ID]) {
        const owned = await editor.post(suggestionPath(workspaceId, id)).expect(409);
        expect(problemSchema.parse(owned.body), id).toMatchObject({
          code: 'item_owned',
          context: { licence: { source: 'purchase', version: 1 } },
        });
      }
      expect(emailsTo(ownerEmail, 'marketplace-suggestion')).toEqual([]);
      expect(await noticesOf(workspaceId)).toEqual([]);
    });

    it('gives back what it could not send, so the member may ask again', async () => {
      const { editor, workspaceId, ownerEmail } = await workspace();
      t.emails.failNext('smtp_unavailable');
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const failed = await editor.post(suggestionPath(workspaceId)).expect(503);
      expect(problemSchema.parse(failed.body)).toMatchObject({
        code: 'suggestion_not_sent',
        title: 'Chưa gửi được đề xuất',
      });
      expect((await detailOf(editor, workspaceId)).suggested).toBe(false);
      expect(await noticesOf(workspaceId)).toEqual([]);
      const retried = marketplaceSuggestionResponseSchema.parse(
        (await editor.post(suggestionPath(workspaceId)).expect(200)).body,
      );
      expect(retried.alreadySuggested).toBe(false);
      expect(emailsTo(ownerEmail, 'marketplace-suggestion')).toHaveLength(1);
    });

    it('stays inside its workspace: a suggestion in one is not one in another', async () => {
      const first = await workspace();
      const second = await workspace();
      await first.editor.post(suggestionPath(first.workspaceId)).expect(200);
      // The other workspace's editor is not a member of the first, and has not asked in theirs.
      await second.editor.post(suggestionPath(first.workspaceId)).expect(404);
      expect((await detailOf(second.editor, second.workspaceId)).suggested).toBe(false);
      expect(emailsTo(second.ownerEmail, 'marketplace-suggestion')).toEqual([]);
    });
  });
});
