import {
  activityListResponseSchema,
  analyticsReportSchema,
  approvalResponseSchema,
  CONSENT_SNAPSHOT_MISSING_LABEL,
  dataRequestDetailSchema,
  leadDetailSchema,
  leadListResponseSchema,
  pageListResponseSchema,
  pathStatusResponseSchema,
  personExportFileSchema,
  pointerMoveResponseSchema,
  previewLinkResponseSchema,
  problemSchema,
  type Site,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { pageView, sendPageView } from '../../../test/analytics.js';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, TestClient } from '../../../test/client.js';
import { publishableDraft } from '../../../test/compositions.js';
import { gate } from '../../../test/gate.js';
import {
  createLiveFormPage,
  insertLeads,
  leadBody,
  storedLead,
  submitLead,
} from '../../../test/leads.js';
import {
  createLivePage,
  createPage,
  currentPublishBody,
  editHeroHeading,
  getPage,
  publish,
  publishRequest,
  RecordingRevalidationClient,
  replaceDraft,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { configurePrivacy } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import { addMember, createSite } from '../../../test/resources.js';
import { LeadsRepository } from '../leads/leads.repository.js';
import { LeadNotifier } from '../notifications/lead-notifier.service.js';
import { RedirectsRepository } from '../publishing/redirects.repository.js';
import { ReleaseErasureRepository } from '../publishing/release-erasure.repository.js';
import { ReleasesRepository } from '../publishing/releases.repository.js';
import { PagesRepository } from './pages.repository.js';

const DAY_MS = 86_400_000;

/** "Xóa trang" (ADR-027): only a page that is not live; leads keep their consent evidence. */
describe('DELETE /sites/:siteId/pages/:pageId', () => {
  let t: TestApp;
  let owner: TestClient;
  let workspaceId: string;
  const revalidation = new RecordingRevalidationClient();

  beforeAll(async () => {
    t = await createTestApp('plp_test_page_deletion', withRevalidationRecorder(revalidation));
    const signedUp = await signedUpClient(t.app);
    owner = signedUp.client;
    workspaceId = signedUp.workspaceId;
  });

  afterAll(async () => {
    await t.close();
  });

  const db = () => t.workspaceDb(workspaceId);
  const oid = (id: string) => new Types.ObjectId(id);

  function remove(client: TestClient, siteId: string, pageId: string) {
    return client.delete(`/sites/${siteId}/pages/${pageId}`);
  }

  function unpublish(siteId: string, pageId: string, currentReleaseId: string) {
    return owner
      .post(`/sites/${siteId}/pages/${pageId}/pointer`, {
        targetReleaseId: null,
        expectedCurrentReleaseId: currentReleaseId,
        reason: 'Hết chương trình',
      })
      .expect(200);
  }

  async function documentsOf(collection: string, pageId: string) {
    return db()
      .collection(collection)
      .find({ pageId: oid(pageId) })
      .sort({ _id: 1 })
      .toArray();
  }

  /** A site whose forms may be published: consent settings and a confirmed address. */
  async function formSite(): Promise<Site> {
    const site = await createSite(owner, workspaceId);
    await configurePrivacy(owner, site.id);
    await addConfirmedRecipient(t, owner, site.id, `nhan-${site.subdomain}@smilecare.vn`);
    return site;
  }

  it('deletes a draft never published, and records who deleted it, with its title and slug', async () => {
    const site = await createSite(owner, workspaceId);
    const slug = uniqueSlug('nhap');
    const page = await createPage(owner, site.id, { title: 'Ưu đãi tháng 11', slug });

    await remove(owner, site.id, page.page.id).expect(204);

    const missing = await owner.get(`/sites/${site.id}/pages/${page.page.id}`).expect(404);
    expect(problemSchema.parse(missing.body).title).toBe('Không tìm thấy trang');
    const list = pageListResponseSchema.parse(
      (await owner.get(`/sites/${site.id}/pages`).expect(200)).body,
    );
    expect(list.counts.all).toBe(0);
    const { items } = activityListResponseSchema.parse(
      (await owner.get(`/sites/${site.id}/activity`).expect(200)).body,
    );
    expect(items.map((item) => item.type)).toEqual([
      'page.deleted',
      'page.created',
      'site.created',
    ]);
    expect(items[0]).toMatchObject({
      page: { id: page.page.id, title: 'Ưu đãi tháng 11', deleted: true },
      data: { slug },
    });
    // The page's earlier events stay, and say it is gone: nothing links to it.
    expect(items[1]?.page).toEqual({ id: page.page.id, title: 'Ưu đãi tháng 11', deleted: true });
    // Deleting it again finds nothing.
    await remove(owner, site.id, page.page.id).expect(404);
    // Nothing was live: the renderer has nothing to forget.
    expect(revalidation.calls).not.toContain(site.subdomain);
  });

  it('refuses a live page until it is unpublished, and changes nothing', async () => {
    const site = await createSite(owner, workspaceId);
    const { pageId, published } = await createLivePage(owner, site.id, uniqueSlug('live'));
    const before = JSON.stringify(await documentsOf('releases', pageId));

    const refused = await remove(owner, site.id, pageId).expect(409);
    expect(problemSchema.parse(refused.body)).toMatchObject({
      code: 'page_live',
      title: 'Gỡ trang khỏi live trước khi xóa',
    });
    expect((await getPage(owner, site.id, pageId)).page.liveRelease?.id).toBe(published.release.id);
    expect(JSON.stringify(await documentsOf('releases', pageId))).toBe(before);

    await unpublish(site.id, pageId, published.release.id);
    await remove(owner, site.id, pageId).expect(204);
  });

  it('deletes the versions, redirects and requests to publish of an unpublished page', async () => {
    const site = await createSite(owner, workspaceId);
    const oldSlug = uniqueSlug('cu');
    const newSlug = uniqueSlug('moi');
    const { pageId } = await createLivePage(owner, site.id, oldSlug);
    await replaceDraft(owner, site.id, pageId, publishableDraft(newSlug, 'Bản mới'));
    const v2 = await publish(owner, site.id, pageId);
    // The old address redirects to the page while it is live (ADR-006).
    const path = (slug: string) =>
      owner.get(
        `/public/sites/${site.subdomain}/path-status?path=${encodeURIComponent(`/${slug}`)}`,
      );
    expect(pathStatusResponseSchema.parse((await path(oldSlug).expect(200)).body).kind).toBe(
      'redirect',
    );
    const { client: contributor } = await addMember(t, workspaceId, 'contributor');
    await editHeroHeading(owner, site.id, pageId, 'Bản chờ duyệt');
    const detail = await getPage(owner, site.id, pageId);
    approvalResponseSchema.parse(
      (
        await contributor
          .post(`/sites/${site.id}/pages/${pageId}/approval`, {
            expectedRevision: detail.draft.revision,
            expectedPublishedReleaseId: v2.release.id,
            approvalId: null,
            note: 'Nhờ duyệt',
          })
          .expect(200)
      ).body,
    );
    await unpublish(site.id, pageId, v2.release.id);
    expect(await documentsOf('releases', pageId)).toHaveLength(2);
    expect(await documentsOf('redirects', pageId)).toHaveLength(1);
    expect(await documentsOf('publish_approvals', pageId)).toHaveLength(1);

    await remove(owner, site.id, pageId).expect(204);

    for (const collection of ['pages', 'releases', 'redirects', 'publish_approvals']) {
      const left = await db()
        .collection(collection)
        .countDocuments(collection === 'pages' ? { _id: oid(pageId) } : { pageId: oid(pageId) });
      expect(left, collection).toBe(0);
    }
    await path(oldSlug).expect(404);
    await path(newSlug).expect(404);
    // The history of the page is gone with it; its activity stays.
    await owner.get(`/sites/${site.id}/pages/${pageId}/history`).expect(404);
    expect(await documentsOf('activity', pageId)).not.toHaveLength(0);
  });

  it('keeps the versions leads agreed to, unchanged, and their leads and numbers readable', async () => {
    const site = await formSite();
    const slug = uniqueSlug('dang-ky');
    const { pageId, published: v1 } = await createLiveFormPage(owner, site.id, slug);
    await sendPageView(t, site.subdomain, pageView(`/${slug}`)).expect(204);
    await submitLead(t, site.subdomain, leadBody(v1.release.id, { name: 'Lê Mai Anh' })).expect(
      201,
    );
    await editHeroHeading(owner, site.id, pageId, 'Ưu đãi mới');
    await publish(owner, site.id, pageId);
    await editHeroHeading(owner, site.id, pageId, 'Ưu đãi cuối');
    const v3 = await publish(owner, site.id, pageId);
    const releaseLink = previewLinkResponseSchema.parse(
      (
        await owner
          .post(`/sites/${site.id}/pages/${pageId}/preview-links`, {
            kind: 'release',
            releaseId: v1.release.id,
          })
          .expect(201)
      ).body,
    );
    const draftLink = previewLinkResponseSchema.parse(
      (
        await owner
          .post(`/sites/${site.id}/pages/${pageId}/preview-links`, { kind: 'draft' })
          .expect(201)
      ).body,
    );
    const tokenOf = (url: string) => url.split('/_preview/')[1] ?? '';
    await owner.get(`/public/preview/${tokenOf(releaseLink.url)}/status`).expect(200);
    await unpublish(site.id, pageId, v3.release.id);
    const kept = await db()
      .collection('releases')
      .findOne({ _id: oid(v1.release.id) });

    await remove(owner, site.id, pageId).expect(204);

    // The release the lead agreed to stays as it was; the others are gone.
    const releases = await documentsOf('releases', pageId);
    expect(releases.map((release) => String(release['_id']))).toEqual([v1.release.id]);
    expect(releases[0]).toEqual(kept);
    // It is never shown again, not even through a preview signed before.
    for (const token of [tokenOf(releaseLink.url), tokenOf(draftLink.url)]) {
      await owner.get(`/public/preview/${token}/status`).expect(404);
      await owner.get(`/public/preview/${token}`).expect(404);
    }

    const inbox = leadListResponseSchema.parse(
      (await owner.get(`/sites/${site.id}/leads?range=all`).expect(200)).body,
    );
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]?.page).toEqual({ id: pageId, title: null });
    const lead = leadDetailSchema.parse(
      (await owner.get(`/sites/${site.id}/leads/${inbox.items[0]?.id ?? ''}`).expect(200)).body,
    );
    expect(lead).toMatchObject({ page: { id: pageId, title: null }, releaseVersion: 1 });
    expect(lead.consent.snapshot?.version).toBe(1);
    const csv = await owner.post(`/sites/${site.id}/leads/export`, { range: 'all' }).expect(200);
    expect(csv.text).toContain('Trang đã xóa');
    const person = await owner
      .post(`/sites/${site.id}/leads/${lead.id}/person/export`, { format: 'json' })
      .expect(200);
    expect(JSON.stringify(person.body)).toContain('Trang đã xóa');
    const request = dataRequestDetailSchema.parse(
      (
        await owner
          .post(`/sites/${site.id}/data-requests`, {
            name: 'Lê Mai Anh',
            phone: '0901 234 567',
            email: '',
            type: 'access',
            receivedAt: new Date(Date.now() - DAY_MS).toISOString(),
          })
          .expect(201)
      ).body,
    );
    expect(request.matches.map((match) => match.page)).toEqual([{ id: pageId, title: null }]);

    const report = analyticsReportSchema.parse(
      (await owner.get(`/sites/${site.id}/analytics?range=7d`).expect(200)).body,
    );
    expect(report.totals).toMatchObject({ views: 1, visitors: 1, leads: 1 });
    expect(report.pages).toEqual([{ page: { id: pageId, title: null }, visitors: 1, leads: 1 }]);
    const onePage = analyticsReportSchema.parse(
      (await owner.get(`/sites/${site.id}/analytics?range=7d&pageId=${pageId}`).expect(200)).body,
    );
    expect(onePage.totals).toMatchObject({ views: 1, leads: 1 });
  });

  it('emails a lead of a deleted page, naming the page "Trang đã xóa"', async () => {
    const site = await formSite();
    const recipient = `nhan-${site.subdomain}@smilecare.vn`;
    const { pageId, published } = await createLiveFormPage(owner, site.id, uniqueSlug('thu'));
    await unpublish(site.id, pageId, published.release.id);
    const lead = storedLead({
      workspaceId,
      siteId: site.id,
      pageId,
      releaseId: published.release.id,
      name: 'Chờ gửi thư',
      notification: { status: 'pending', updatedAt: new Date(Date.now() - DAY_MS) },
    });
    await insertLeads(t, [lead]);
    await remove(owner, site.id, pageId).expect(204);

    await t.app.get(LeadNotifier).onApplicationBootstrap();

    await vi.waitFor(() => {
      expect(t.emails.to(recipient).some((email) => email.text.includes('Chờ gửi thư'))).toBe(true);
    });
    const email = t.emails.to(recipient).find((item) => item.text.includes('Chờ gửi thư'));
    expect(email?.text).toContain('Trang đã xóa (v1)');
  });

  describe('a publish and a deletion at the same moment', () => {
    /** A page that is not live with a draft ready to publish, and the publish request's body. */
    async function readyPage(site: Site) {
      const slug = uniqueSlug('dua');
      const page = await createPage(owner, site.id, { slug });
      await replaceDraft(owner, site.id, page.page.id, publishableDraft(slug, 'Cùng lúc'));
      return { pageId: page.page.id, body: await currentPublishBody(owner, site.id, page.page.id) };
    }

    it('lets one of the two win while the publish holds the page, normally the publish', async () => {
      const site = await createSite(owner, workspaceId);
      const { pageId, body } = await readyPage(site);
      const releases = t.app.get(ReleasesRepository);
      const pages = t.app.get(PagesRepository);
      const insert = releases.insert.bind(releases);
      const deleteIfNotLive = pages.deleteIfNotLive.bind(pages);
      const publishing = gate();
      const held = gate();
      const deleting = gate();
      // The publish has claimed the version (a write to the page) and waits before its release.
      const insertSpy = vi.spyOn(releases, 'insert').mockImplementation(async (...args) => {
        held.open();
        await publishing.opened;
        return insert(...args);
      });
      const deleteSpy = vi.spyOn(pages, 'deleteIfNotLive').mockImplementation((...args) => {
        deleting.open();
        return deleteIfNotLive(...args);
      });
      let outcome;
      try {
        const published = publishRequest(owner, site.id, pageId, body).then((response) => response);
        await held.opened;
        const deleted = remove(owner, site.id, pageId).then((response) => response);
        // The deletion tried the page while the publish's write on it was not committed yet.
        await deleting.opened;
        publishing.open();
        outcome = { published: await published, deleted: await deleted };
      } finally {
        insertSpy.mockRestore();
        deleteSpy.mockRestore();
      }
      const { published, deleted } = outcome;
      expect([published.status === 201, deleted.status === 204].filter(Boolean)).toHaveLength(1);
      const winner = published.status === 201 ? 'publish' : 'deletion';
      // Which order ran: the deletion only wins when MongoDB aborted the publish's transaction
      // (a transient error, e.g. under memory pressure) and retried it after the deletion.
      console.info(`A publish and a deletion of one page at the same moment: the ${winner} won`);
      if (winner === 'publish') {
        expect(deleted.status).toBe(409);
        expect(problemSchema.parse(deleted.body).code).toBe('page_live');
        expect((await getPage(owner, site.id, pageId)).page.liveRelease?.version).toBe(1);
        expect(await documentsOf('releases', pageId)).toHaveLength(1);
      } else {
        expect(published.status).toBe(404);
        expect(problemSchema.parse(published.body).code).toBe('not_found');
        expect(deleted.status).toBe(204);
        // Never a release without its page.
        expect(
          await db()
            .collection('pages')
            .findOne({ _id: oid(pageId) }),
        ).toBeNull();
        expect(await documentsOf('releases', pageId)).toHaveLength(0);
      }
    });

    it('lets one of the two win while the deletion holds the page, normally the deletion', async () => {
      const site = await createSite(owner, workspaceId);
      const { pageId, body } = await readyPage(site);
      const redirects = t.app.get(RedirectsRepository);
      const pages = t.app.get(PagesRepository);
      const deleteForPage = redirects.deleteForPage.bind(redirects);
      const claim = pages.claimReleaseVersion.bind(pages);
      const deletion = gate();
      const held = gate();
      const claiming = gate();
      // The deletion has deleted the page and waits before the rest of its transaction.
      const redirectSpy = vi
        .spyOn(redirects, 'deleteForPage')
        .mockImplementation(async (...args) => {
          held.open();
          await deletion.opened;
          return deleteForPage(...args);
        });
      const claimSpy = vi.spyOn(pages, 'claimReleaseVersion').mockImplementation((...args) => {
        claiming.open();
        return claim(...args);
      });
      let outcome;
      try {
        const deleted = remove(owner, site.id, pageId).then((response) => response);
        await held.opened;
        const published = publishRequest(owner, site.id, pageId, body).then((response) => response);
        // The publish tried to claim a version of the page the deletion has not committed yet.
        await claiming.opened;
        deletion.open();
        outcome = { published: await published, deleted: await deleted };
      } finally {
        redirectSpy.mockRestore();
        claimSpy.mockRestore();
      }
      const { published, deleted } = outcome;
      expect([published.status === 201, deleted.status === 204].filter(Boolean)).toHaveLength(1);
      const winner = deleted.status === 204 ? 'deletion' : 'publish';
      // The publish only wins when MongoDB aborted the deletion's transaction (a transient error)
      // and retried it after the publish committed.
      console.info(`A deletion and a publish of one page at the same moment: the ${winner} won`);
      if (winner === 'deletion') {
        expect(published.status).toBe(404);
        expect(problemSchema.parse(published.body).code).toBe('not_found');
        // Never a release without its page.
        expect(
          await db()
            .collection('pages')
            .findOne({ _id: oid(pageId) }),
        ).toBeNull();
        expect(await documentsOf('releases', pageId)).toHaveLength(0);
      } else {
        expect(deleted.status).toBe(409);
        expect(problemSchema.parse(deleted.body).code).toBe('page_live');
        expect((await getPage(owner, site.id, pageId)).page.liveRelease?.version).toBe(1);
        expect(await documentsOf('releases', pageId)).toHaveLength(1);
      }
    });
  });

  describe('a lead sent while its page is unpublished and deleted', () => {
    it('removes the lead stored after the deletion took its release, and answers 404', async () => {
      const site = await formSite();
      const { pageId, published } = await createLiveFormPage(owner, site.id, uniqueSlug('giua'));
      const leads = t.app.get(LeadsRepository);
      const insert = leads.insertPublic.bind(leads);
      // Intake read the page as live; it is unpublished and deleted before the lead is stored, so
      // the deletion found no lead referring to the release and deleted it too.
      const spy = vi.spyOn(leads, 'insertPublic').mockImplementation(async (...args) => {
        await unpublish(site.id, pageId, published.release.id);
        await remove(owner, site.id, pageId).expect(204);
        return insert(...args);
      });
      try {
        const refused = await submitLead(
          t,
          site.subdomain,
          leadBody(published.release.id, { name: 'Gửi lúc xóa' }),
        ).expect(404);
        expect(problemSchema.parse(refused.body).title).toBe('Form này không còn nhận đăng ký');
      } finally {
        spy.mockRestore();
      }
      expect(await documentsOf('leads', pageId)).toHaveLength(0);
      expect(await documentsOf('releases', pageId)).toHaveLength(0);
    });

    it('shows the consent evidence as missing for a lead stored before the deletion committed', async () => {
      const site = await formSite();
      const recipient = `nhan-${site.subdomain}@smilecare.vn`;
      const { pageId, published } = await createLiveFormPage(owner, site.id, uniqueSlug('sot'));
      const leads = t.app.get(LeadsRepository);
      const releases = t.app.get(ReleaseErasureRepository);
      const insert = leads.insertPublic.bind(leads);
      const deleteForPage = releases.deleteForPage.bind(releases);
      const deleting = gate();
      const commit = gate();
      let deleted: Promise<number> = Promise.resolve(0);
      // The deletion has deleted the release in its transaction and waits before committing.
      const releaseSpy = vi.spyOn(releases, 'deleteForPage').mockImplementation(async (...args) => {
        await deleteForPage(...args);
        deleting.open();
        await commit.opened;
      });
      // Intake read the page as live; the lead is stored, and its release read again, while the
      // deletion's transaction is open: the release is still there for anyone outside it.
      const insertSpy = vi.spyOn(leads, 'insertPublic').mockImplementation(async (...args) => {
        await unpublish(site.id, pageId, published.release.id);
        deleted = remove(owner, site.id, pageId).then((response) => response.status);
        await deleting.opened;
        return insert(...args);
      });
      try {
        await submitLead(
          t,
          site.subdomain,
          leadBody(published.release.id, { name: 'Lưu lúc xóa' }),
        ).expect(201);
        commit.open();
        expect(await deleted).toBe(204);
      } finally {
        insertSpy.mockRestore();
        releaseSpy.mockRestore();
      }
      expect(await documentsOf('releases', pageId)).toHaveLength(0);
      const [stored] = await documentsOf('leads', pageId);
      const leadId = String(stored?.['_id']);

      const lead = leadDetailSchema.parse(
        (await owner.get(`/sites/${site.id}/leads/${leadId}`).expect(200)).body,
      );
      expect(lead).toMatchObject({
        name: 'Lưu lúc xóa',
        page: { id: pageId, title: null },
        releaseVersion: 1,
        consent: { snapshot: null, marketing: false, marketingWithdrawnAt: null },
      });
      const json = await owner
        .post(`/sites/${site.id}/leads/${leadId}/person/export`, { format: 'json' })
        .expect(200);
      const file = personExportFileSchema.parse(JSON.parse(json.text));
      expect(file.leads.find((item) => item.name === 'Lưu lúc xóa')?.consent).toMatchObject({
        snapshot: null,
      });
      const csv = await owner
        .post(`/sites/${site.id}/leads/${leadId}/person/export`, { format: 'csv' })
        .expect(200);
      // When they agreed, no version, and the text column says why.
      const row = csv.text.split('\r\n').find((line) => line.includes('Lưu lúc xóa')) ?? '';
      expect(row.endsWith(`,,${CONSENT_SNAPSHOT_MISSING_LABEL}`)).toBe(true);
      expect(row.split(',').at(-3)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      // The email never needed the release.
      await vi.waitFor(() => {
        expect(t.emails.to(recipient).some((email) => email.text.includes('Lưu lúc xóa'))).toBe(
          true,
        );
      });
    });
  });

  it('answers an undo of a deleted page that it cannot be undone', async () => {
    const site = await createSite(owner, workspaceId);
    const { pageId, published: v1 } = await createLivePage(owner, site.id, uniqueSlug('hoan'));
    await editHeroHeading(owner, site.id, pageId, 'Bản 2');
    const v2 = await publish(owner, site.id, pageId);
    const rollback = pointerMoveResponseSchema.parse(
      (
        await owner
          .post(`/sites/${site.id}/pages/${pageId}/pointer`, {
            targetReleaseId: v1.release.id,
            expectedCurrentReleaseId: v2.release.id,
            reason: 'Sai giá',
          })
          .expect(200)
      ).body,
    );
    await unpublish(site.id, pageId, v1.release.id);
    await remove(owner, site.id, pageId).expect(204);

    const undo = await owner
      .post(`/sites/${site.id}/activity/${rollback.activityId}/undo`)
      .expect(409);
    expect(problemSchema.parse(undo.body).code).toBe('undo_not_available');
  });

  it('is for the roles that manage live pages, in the sites they may open (ADR-020)', async () => {
    const site = await createSite(owner, workspaceId);
    const other = await createSite(owner, workspaceId);
    const page = await createPage(owner, site.id);
    const { client: contributor } = await addMember(t, workspaceId, 'contributor');
    const { client: elsewhere } = await addMember(t, workspaceId, 'editor', [other.id]);
    const stranger = (await signedUpClient(t.app)).client;

    expect(
      problemSchema.parse((await remove(contributor, site.id, page.page.id)).body),
    ).toMatchObject({ status: 403, code: 'forbidden' });
    await remove(elsewhere, site.id, page.page.id).expect(404);
    await remove(stranger, site.id, page.page.id).expect(404);
    // A page of one site is not found through another (ADR-025).
    await remove(owner, other.id, page.page.id).expect(404);
    await remove(new TestClient(t.app), site.id, page.page.id).expect(401);
    await getPage(owner, site.id, page.page.id);

    const { client: editor } = await addMember(t, workspaceId, 'editor');
    await remove(editor, site.id, page.page.id).expect(204);
  });
});
