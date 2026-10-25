import {
  activityListResponseSchema,
  checksResultSchema,
  confirmLeadRecipientResponseSchema,
  type LeadRecipient,
  leadRecipientListResponseSchema,
  leadRecipientSchema,
  problemSchema,
  type Site,
  siteSchema,
} from '@plp/contracts';
import { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { formDraft } from '../../../test/compositions.js';
import {
  createPage,
  currentPublishBody,
  publish,
  publishRequest,
  RecordingRevalidationClient,
  replaceDraft,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { configurePrivacy } from '../../../test/privacy.js';
import { confirmationToken, confirmRecipient } from '../../../test/recipients.js';
import { addEditor, createSite } from '../../../test/resources.js';

/** "Nơi nhận lead" (ADR-018): confirmed addresses only, at most five, owner-managed. */
describe('lead recipients', () => {
  let t: TestApp;
  let owner: TestClient;
  let ownerName: string;
  let editor: TestClient;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp(
      'plp_test_recipients',
      withRevalidationRecorder(new RecordingRevalidationClient()),
    );
    const signedUp = await signedUpClient(t.app);
    owner = signedUp.client;
    ownerName = signedUp.me.user.name;
    workspaceId = signedUp.workspaceId;
    editor = (await addEditor(t, workspaceId)).client;
  });

  afterAll(async () => {
    await t.close();
  });

  async function add(site: Site, email: string, client = owner): Promise<LeadRecipient> {
    const response = await client.post(`/sites/${site.id}/lead-recipients`, { email }).expect(201);
    return leadRecipientSchema.parse(response.body);
  }

  async function list(site: Site, client = owner): Promise<LeadRecipient[]> {
    const response = await client.get(`/sites/${site.id}/lead-recipients`).expect(200);
    return leadRecipientListResponseSchema.parse(response.body).items;
  }

  async function recipientActivity(site: Site): Promise<Array<number | null>> {
    const response = await owner
      .get(`/sites/${site.id}/activity?types=lead.recipients_changed`)
      .expect(200);
    return activityListResponseSchema.parse(response.body).items.map((item) => item.data.count);
  }

  it('emails a confirmation link to a new address, which then confirms it once', async () => {
    const site = await createSite(owner, workspaceId);
    const added = await add(site, ' Sales@SmileCare.vn ');
    expect(added).toMatchObject({
      email: 'sales@smilecare.vn',
      status: 'pending',
      confirmedAt: null,
    });
    expect(added.invitedAt).not.toBeNull();

    const [email] = t.emails.to('sales@smilecare.vn');
    expect(email?.subject).toBe('Xác nhận nhận lead của Nha khoa Smile Care');
    expect(email?.text).toContain(`${ownerName} đã thêm địa chỉ này vào "Nơi nhận lead"`);
    const token = confirmationToken(t.emails, 'sales@smilecare.vn');
    expect(email?.text).toContain(`http://localhost:3100/lead-recipients/confirm#token=${token}`);

    // The database keeps a hash of the link's secret, never the secret.
    const stored = await t.connection
      .collection<{ leadRecipients: Array<{ tokenHash: string | null }> }>('sites')
      .findOne({ _id: new Types.ObjectId(site.id) });
    expect(stored?.leadRecipients[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(token);

    const confirmed = await confirmRecipient(t, token).expect(200);
    expect(confirmLeadRecipientResponseSchema.parse(confirmed.body)).toEqual({
      siteName: 'Nha khoa Smile Care',
      email: 'sales@smilecare.vn',
    });
    const [after] = await list(site);
    expect(after).toMatchObject({ status: 'confirmed' });
    expect(after?.confirmedAt).not.toBeNull();
    const again = await confirmRecipient(t, token).expect(404);
    expect(problemSchema.parse(again.body)).toMatchObject({
      title: 'Liên kết xác nhận không còn hiệu lực',
      detail: 'Liên kết đã được dùng hoặc đã quá 7 ngày. Nhờ chủ site gửi lại thư xác nhận.',
    });

    const siteAfter = siteSchema.parse((await owner.get(`/sites/${site.id}`).expect(200)).body);
    expect(siteAfter.confirmedLeadRecipients).toBe(1);
    expect(await recipientActivity(site)).toEqual([1]);
  });

  it('refuses a second copy of an address and a sixth address, also when added at once', async () => {
    const site = await createSite(owner, workspaceId);
    await add(site, 'hong@smilecare.vn');
    const duplicate = await owner
      .post(`/sites/${site.id}/lead-recipients`, { email: 'HONG@smilecare.vn' })
      .expect(409);
    expect(problemSchema.parse(duplicate.body)).toMatchObject({
      code: 'recipient_exists',
      title: 'Địa chỉ này đã có trong nơi nhận lead',
    });

    const busy = await createSite(owner, workspaceId);
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        owner.post(`/sites/${busy.id}/lead-recipients`, { email: `nv${index}@smilecare.vn` }),
      ),
    );
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, 201, 201, 201, 201, 409]);
    const refused = responses.find((response) => response.status === 409);
    expect(problemSchema.parse(refused?.body)).toMatchObject({
      code: 'recipient_limit_reached',
      title: 'Mỗi site có tối đa 5 địa chỉ nhận lead',
    });
    expect(await list(busy)).toHaveLength(5);
    expect(await recipientActivity(busy)).toHaveLength(5);
  });

  it('keeps an address whose email failed as unsent, and a new link replaces the old one', async () => {
    const site = await createSite(owner, workspaceId);
    t.emails.failNext('smtp_unavailable');
    const added = await add(site, 'le-tan@smilecare.vn');
    expect(added).toMatchObject({ status: 'unsent', invitedAt: null });

    const resent = await owner
      .post(`/sites/${site.id}/lead-recipients/${added.id}/resend`)
      .expect(200);
    expect(leadRecipientSchema.parse(resent.body)).toMatchObject({ status: 'pending' });
    const first = confirmationToken(t.emails, 'le-tan@smilecare.vn');
    await owner.post(`/sites/${site.id}/lead-recipients/${added.id}/resend`).expect(200);
    const second = confirmationToken(t.emails, 'le-tan@smilecare.vn');
    expect(second).not.toBe(first);
    await confirmRecipient(t, first).expect(404);
    await confirmRecipient(t, second).expect(200);

    const done = await owner
      .post(`/sites/${site.id}/lead-recipients/${added.id}/resend`)
      .expect(409);
    expect(problemSchema.parse(done.body).title).toBe('Địa chỉ này đã xác nhận nhận lead');
  });

  it('lets a link work for 7 days only', async () => {
    const site = await createSite(owner, workspaceId);
    await add(site, 'cu@smilecare.vn');
    const token = confirmationToken(t.emails, 'cu@smilecare.vn');
    await t.connection
      .collection('sites')
      .updateOne(
        { _id: new Types.ObjectId(site.id) },
        { $set: { 'leadRecipients.0.tokenExpiresAt': new Date(Date.now() - 1000) } },
      );
    expect((await list(site))[0]).toMatchObject({ status: 'expired' });
    await confirmRecipient(t, token).expect(404);
  });

  it('removes an address and logs how many are left', async () => {
    const site = await createSite(owner, workspaceId);
    const first = await add(site, 'mot@smilecare.vn');
    await add(site, 'hai@smilecare.vn');
    await owner.delete(`/sites/${site.id}/lead-recipients/${first.id}`).expect(204);
    expect((await list(site)).map((item) => item.email)).toEqual(['hai@smilecare.vn']);
    expect(await recipientActivity(site)).toEqual([1, 2, 1]);
    await owner.delete(`/sites/${site.id}/lead-recipients/${first.id}`).expect(404);
    await owner.delete(`/sites/${site.id}/lead-recipients/not-an-id`).expect(404);
  });

  it('shows the addresses to editors and lets only the owner change them', async () => {
    const site = await createSite(owner, workspaceId);
    const added = await add(site, 'chu@smilecare.vn');
    expect(await list(site, editor)).toHaveLength(1);
    await editor
      .post(`/sites/${site.id}/lead-recipients`, { email: 'nv@smilecare.vn' })
      .expect(403);
    await editor.post(`/sites/${site.id}/lead-recipients/${added.id}/resend`).expect(403);
    await editor.delete(`/sites/${site.id}/lead-recipients/${added.id}`).expect(403);
    expect(await list(site)).toHaveLength(1);
  });

  it('hides the addresses of a site from another workspace', async () => {
    const site = await createSite(owner, workspaceId);
    const added = await add(site, 'rieng@smilecare.vn');
    const stranger = (await signedUpClient(t.app)).client;
    await stranger.get(`/sites/${site.id}/lead-recipients`).expect(404);
    await stranger
      .post(`/sites/${site.id}/lead-recipients`, { email: 'x@example.com' })
      .expect(404);
    await stranger.post(`/sites/${site.id}/lead-recipients/${added.id}/resend`).expect(404);
    await stranger.delete(`/sites/${site.id}/lead-recipients/${added.id}`).expect(404);
    expect(await list(site)).toHaveLength(1);
  });

  it('refuses a malformed link, an invalid address, and a confirmation from another origin', async () => {
    const site = await createSite(owner, workspaceId);
    await confirmRecipient(t, 'short').expect(422);
    await owner
      .post(`/sites/${site.id}/lead-recipients`, { email: 'khong-phai-email' })
      .expect(422);
    await add(site, 'goc@smilecare.vn');
    const token = confirmationToken(t.emails, 'goc@smilecare.vn');
    const foreign = await request(t.app.getHttpServer())
      .post('/public/lead-recipients/confirm')
      .send({ token })
      .expect(403);
    expect(problemSchema.parse(foreign.body).code).toBe('origin_rejected');
  });

  it('blocks publishing a form until an address confirmed', async () => {
    const site = await createSite(owner, workspaceId);
    await configurePrivacy(owner, site.id);
    const slug = uniqueSlug('form');
    const page = await createPage(owner, site.id, { title: 'Đăng ký', slug });
    const draft = formDraft(slug);
    await replaceDraft(owner, page.page.id, draft);
    const formId = draft.composition.sections[1]?.id;

    const blocked = await publishRequest(
      owner,
      page.page.id,
      await currentPublishBody(owner, page.page.id),
    ).expect(422);
    const checks = checksResultSchema.parse(problemSchema.parse(blocked.body).context?.['checks']);
    expect(checks.blocking).toEqual([
      expect.objectContaining({
        code: 'lead_destination_missing',
        target: { kind: 'lead_recipients', sectionId: formId },
      }),
    ]);

    // An address that has not confirmed does not count.
    await add(site, 'cho@smilecare.vn');
    await publishRequest(owner, page.page.id, await currentPublishBody(owner, page.page.id)).expect(
      422,
    );
    await confirmRecipient(t, confirmationToken(t.emails, 'cho@smilecare.vn')).expect(200);
    expect((await publish(owner, page.page.id)).release.version).toBe(1);
  });
});
