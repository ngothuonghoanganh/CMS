import {
  approvalResponseSchema,
  checksResultSchema,
  type MeResponse,
  type PageApproval,
  problemSchema,
  type Site,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { formDraft, publishableDraft } from '../../../test/compositions.js';
import {
  createPage,
  currentPublishBody,
  editHeroHeading,
  getPage,
  listPages,
  publish,
  publishRequest,
  RecordingRevalidationClient,
  replaceDraft,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { addMember, createSite } from '../../../test/resources.js';
import { APPROVALS_PER_DAY } from './domain/approval-rules.js';

interface Member {
  client: TestClient;
  me: MeResponse;
}

/**
 * Requests to publish (ADR-023): a Cộng tác viên sends the saved draft, Chủ sở hữu and Quản trị
 * hear of it, and publishing the page or refusing answers it.
 */
describe('requests to publish', () => {
  let t: TestApp;
  let owner: Member;
  let admin: Member;
  let editor: Member;
  let contributor: Member;
  let otherContributor: Member;
  let workspaceId: string;
  let site: Site;

  beforeAll(async () => {
    t = await createTestApp(
      'plp_test_approvals',
      withRevalidationRecorder(new RecordingRevalidationClient()),
    );
    const signedUp = await signedUpClient(t.app);
    owner = signedUp;
    workspaceId = signedUp.workspaceId;
    admin = await addMember(t, workspaceId, 'admin');
    editor = await addMember(t, workspaceId, 'editor');
    contributor = await addMember(t, workspaceId, 'contributor');
    otherContributor = await addMember(t, workspaceId, 'contributor');
    site = await createSite(owner.client, workspaceId);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(() => {
    t.emails.sent.length = 0;
  });

  /** A page with a publishable draft, made by the owner, not yet live. */
  async function draftPage(): Promise<string> {
    const page = await createPage(owner.client, site.id, { title: 'Ưu đãi tháng 11' });
    await replaceDraft(owner.client, page.page.id, publishableDraft(page.page.slug));
    return page.page.id;
  }

  function ask(member: Member, pageId: string, expectedRevision: number, note = '') {
    return member.client.post(`/pages/${pageId}/approval`, { expectedRevision, note });
  }

  /** Sends the page's saved draft for approval as `member` and returns what the page shows. */
  async function askNow(member: Member, pageId: string, note = ''): Promise<PageApproval | null> {
    const revision = (await getPage(member.client, pageId)).draft.revision;
    const response = await ask(member, pageId, revision, note).expect(200);
    return approvalResponseSchema.parse(response.body).page.approval;
  }

  function stored(pageId: string) {
    return t.connection
      .collection('publish_approvals')
      .find({ pageId: new Types.ObjectId(pageId) })
      .sort({ createdAt: 1 })
      .toArray();
  }

  it('sends the saved draft; Chủ sở hữu and Quản trị get one email, the page says it waits', async () => {
    const pageId = await draftPage();
    await editHeroHeading(contributor.client, pageId, 'Giảm 30% niềng răng');
    const revision = (await getPage(contributor.client, pageId)).draft.revision;

    const approval = await askNow(contributor, pageId, 'Đổi giá ưu đãi');
    expect(approval).toEqual({
      status: 'pending',
      id: expect.any(String) as string,
      requestedBy: { id: contributor.me.user.id, name: contributor.me.user.name },
      revision,
      note: 'Đổi giá ưu đãi',
      sentAt: expect.any(String) as string,
    });

    expect(t.emails.sent).toHaveLength(1);
    const [email] = t.emails.sent;
    expect([...(email?.to ?? [])].sort()).toEqual(
      [owner.me.user.email, admin.me.user.email].sort(),
    );
    expect(email?.subject).toBe(
      `${contributor.me.user.name} gửi yêu cầu xuất bản "Ưu đãi tháng 11"`,
    );
    expect(email?.text).toContain('Ghi chú: Đổi giá ưu đãi');
    expect(email?.text).toContain(`/sites/${site.id}/pages/${pageId}/edit`);

    // Everyone who sees the page sees it waiting, on the list too.
    const list = await listPages(owner.client, site.id);
    expect(list.items.find((item) => item.id === pageId)?.approval).toMatchObject({
      status: 'pending',
      id: approval?.id,
    });
    expect((await getPage(editor.client, pageId)).page.approval?.status).toBe('pending');
  });

  it('refuses a draft changed since, a blocking error, and roles that publish themselves', async () => {
    const pageId = await draftPage();
    const revision = (await getPage(contributor.client, pageId)).draft.revision;
    const stale = await ask(contributor, pageId, revision - 1).expect(409);
    expect(problemSchema.parse(stale.body).code).toBe('revision_conflict');

    // A form without consent settings blocks publishing, so it blocks asking too.
    const formPage = await createPage(owner.client, site.id);
    await replaceDraft(owner.client, formPage.page.id, formDraft(formPage.page.slug));
    const formRevision = (await getPage(contributor.client, formPage.page.id)).draft.revision;
    const blocked = problemSchema.parse(
      (await ask(contributor, formPage.page.id, formRevision).expect(422)).body,
    );
    expect(blocked.code).toBe('publish_blocked');
    expect(checksResultSchema.parse(blocked.context?.['checks']).blocking.length).toBeGreaterThan(
      0,
    );

    for (const member of [owner, admin, editor]) {
      const refused = await ask(member, pageId, revision).expect(403);
      expect(problemSchema.parse(refused.body).title).toBe(
        'Chỉ Cộng tác viên được thực hiện thao tác này',
      );
    }
    const elsewhere = await addMember(t, workspaceId, 'contributor', [
      (await createSite(owner.client, workspaceId)).id,
    ]);
    await ask(elsewhere, pageId, revision).expect(404);

    expect(await stored(pageId)).toEqual([]);
    expect(await stored(formPage.page.id)).toEqual([]);
    expect(t.emails.sent).toEqual([]);
  });

  it('keeps one request per page: its sender sends it again, someone else is told who waits', async () => {
    const pageId = await draftPage();
    const first = await askNow(contributor, pageId, 'Bản đầu');
    await editHeroHeading(contributor.client, pageId, 'Giảm 40%');
    const again = await askNow(contributor, pageId, 'Đã sửa giá');
    expect(again).toMatchObject({ id: first?.id, note: 'Đã sửa giá' });
    expect(again?.revision).toBe((await getPage(owner.client, pageId)).draft.revision);
    expect(t.emails.sent.map((email) => email.subject)).toEqual([
      `${contributor.me.user.name} gửi yêu cầu xuất bản "Ưu đãi tháng 11"`,
      `${contributor.me.user.name} gửi lại yêu cầu xuất bản "Ưu đãi tháng 11"`,
    ]);

    const revision = (await getPage(otherContributor.client, pageId)).draft.revision;
    const taken = await ask(otherContributor, pageId, revision).expect(409);
    expect(problemSchema.parse(taken.body)).toMatchObject({
      code: 'approval_pending',
      title: `Trang đang chờ duyệt yêu cầu của ${contributor.me.user.name}`,
    });
    expect(await stored(pageId)).toHaveLength(1);
  });

  it('is answered by publishing the page, in the same transaction, and its sender hears', async () => {
    const pageId = await draftPage();
    const approval = await askNow(contributor, pageId);
    t.emails.sent.length = 0;

    const published = await publish(admin.client, pageId, 'Duyệt giá mới');
    expect(published.page.approval).toBeNull();
    expect(await stored(pageId)).toEqual([
      expect.objectContaining({
        _id: new Types.ObjectId(approval?.id),
        status: 'published',
        decidedBy: new Types.ObjectId(admin.me.user.id),
        releaseId: new Types.ObjectId(published.release.id),
        purgeAt: expect.any(Date) as Date,
      }),
    ]);
    expect(t.emails.sent).toHaveLength(1);
    expect(t.emails.sent[0]).toMatchObject({
      to: [contributor.me.user.email],
      subject: '"Ưu đãi tháng 11" đã được xuất bản',
    });
    expect(t.emails.sent[0]?.text).toContain(
      `${admin.me.user.name} đã duyệt và xuất bản phiên bản v1.`,
    );

    // A Biên tập publishing answers it the same way.
    await editHeroHeading(contributor.client, pageId, 'Ưu đãi tháng 12');
    await askNow(contributor, pageId);
    const byEditor = await publish(editor.client, pageId);
    expect(byEditor.page.approval).toBeNull();
    expect(await stored(pageId)).toEqual([
      expect.objectContaining({ status: 'published' }),
      expect.objectContaining({ status: 'published' }),
    ]);
  });

  it('is refused only by Chủ sở hữu and Quản trị, with a reason its sender reads until a newer draft goes live', async () => {
    const pageId = await draftPage();
    const approval = await askNow(contributor, pageId);
    const approvalId = approval?.id ?? '';
    t.emails.sent.length = 0;

    await editor.client
      .post(`/pages/${pageId}/approval/reject`, { approvalId, reason: 'Giá sai' })
      .expect(403);
    await owner.client
      .post(`/pages/${pageId}/approval/reject`, { approvalId, reason: '' })
      .expect(422);
    await owner.client
      .post(`/pages/${pageId}/approval/reject`, {
        approvalId: new Types.ObjectId().toHexString(),
        reason: 'Giá sai',
      })
      .expect(404);

    const response = await owner.client
      .post(`/pages/${pageId}/approval/reject`, { approvalId, reason: 'Giá ưu đãi chưa đúng' })
      .expect(200);
    expect(approvalResponseSchema.parse(response.body).page.approval).toMatchObject({
      status: 'rejected',
      id: approvalId,
      rejectedBy: { id: owner.me.user.id },
      reason: 'Giá ưu đãi chưa đúng',
    });
    expect(t.emails.sent).toEqual([
      expect.objectContaining({
        to: [contributor.me.user.email],
        subject: 'Yêu cầu xuất bản "Ưu đãi tháng 11" chưa được duyệt',
      }),
    ]);
    expect(t.emails.sent[0]?.text).toContain('Lý do: Giá ưu đãi chưa đúng');
    await owner.client
      .post(`/pages/${pageId}/approval/reject`, { approvalId, reason: 'Lần nữa' })
      .expect(404);

    // The refusal stays on the page until that draft, or a newer one, goes live.
    expect((await getPage(contributor.client, pageId)).page.approval?.status).toBe('rejected');
    await publish(owner.client, pageId);
    expect((await getPage(contributor.client, pageId)).page.approval).toBeNull();
  });

  it('is withdrawn only by its sender', async () => {
    const pageId = await draftPage();
    await askNow(contributor, pageId);
    await otherContributor.client.delete(`/pages/${pageId}/approval`).expect(404);
    await owner.client.delete(`/pages/${pageId}/approval`).expect(403);

    const response = await contributor.client.delete(`/pages/${pageId}/approval`).expect(200);
    expect(approvalResponseSchema.parse(response.body).page.approval).toBeNull();
    expect((await stored(pageId))[0]).toMatchObject({ status: 'withdrawn' });
    await contributor.client.delete(`/pages/${pageId}/approval`).expect(404);
  });

  it('answers a refusal and a publish at the same time once', async () => {
    const pageId = await draftPage();
    const approval = await askNow(contributor, pageId);
    const body = await currentPublishBody(owner.client, pageId);
    t.emails.sent.length = 0;

    const [published, refused] = await Promise.all([
      publishRequest(admin.client, pageId, body),
      owner.client.post(`/pages/${pageId}/approval/reject`, {
        approvalId: approval?.id,
        reason: 'Chưa duyệt',
      }),
    ]);
    expect(published.status).toBe(201);
    const [record] = await stored(pageId);
    if (refused.status === 200) {
      expect(record).toMatchObject({ status: 'rejected', releaseId: null });
    } else {
      expect(refused.status).toBe(404);
      expect(record).toMatchObject({ status: 'published' });
    }
    // The sender hears one answer.
    expect(t.emails.to(contributor.me.user.email)).toHaveLength(1);
  });

  it('keeps the request when its email fails, and limits how often one member sends', async () => {
    const sender = await addMember(t, workspaceId, 'contributor');
    const pageId = await draftPage();
    t.emails.failNext('smtp_unavailable');
    expect((await askNow(sender, pageId))?.status).toBe('pending');
    expect(t.emails.sent).toEqual([]);

    // The failed email gave its count back.
    for (let sent = 0; sent < APPROVALS_PER_DAY; sent += 1) {
      await askNow(sender, pageId);
    }
    const revision = (await getPage(sender.client, pageId)).draft.revision;
    const limited = await ask(sender, pageId, revision).expect(429);
    expect(problemSchema.parse(limited.body).title).toBe('Đã gửi quá nhiều yêu cầu xuất bản');

    // The limit is per workspace: the same person elsewhere may still ask.
    const elsewhere = await signedUpClient(t.app);
    const otherSite = await createSite(elsewhere.client, elsewhere.workspaceId);
    await t.connection.collection('memberships').insertOne({
      workspaceId: new Types.ObjectId(elsewhere.workspaceId),
      userId: new Types.ObjectId(sender.me.user.id),
      role: 'contributor',
      siteIds: null,
      createdAt: new Date(),
    });
    const page = await createPage(elsewhere.client, otherSite.id, { slug: uniqueSlug('khac') });
    await replaceDraft(elsewhere.client, page.page.id, publishableDraft(page.page.slug));
    expect((await askNow(sender, page.page.id))?.status).toBe('pending');
  });
});
