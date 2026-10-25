import { randomUUID } from 'node:crypto';
import {
  activityListResponseSchema,
  checksResultSchema,
  type PageSummary,
  pointerMoveResponseSchema,
  problemSchema,
  publishResponseSchema,
  type Site,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, TestClient } from '../../../test/client.js';
import { cleanSeo, publishableDraft } from '../../../test/compositions.js';
import {
  createLivePage,
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
import { createSite } from '../../../test/resources.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { RELEASE_MODEL } from './release.schema.js';

describe('publishing', () => {
  let t: TestApp;
  let client: TestClient;
  let workspaceId: string;
  let site: Site;
  const revalidation = new RecordingRevalidationClient();

  beforeAll(async () => {
    t = await createTestApp('plp_test_publishing', withRevalidationRecorder(revalidation));
    const owner = await signedUpClient(t.app);
    client = owner.client;
    workspaceId = owner.workspaceId;
    site = await createSite(client, workspaceId);
  });

  afterEach(() => {
    revalidation.result = 'ok';
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await t.close();
  });

  function releasesOf(pageId: string) {
    return t.connection
      .collection('releases')
      .find({ pageId: new Types.ObjectId(pageId) })
      .sort({ version: 1 })
      .toArray();
  }

  async function storedPage(pageId: string) {
    const page = await t.connection
      .collection('pages')
      .findOne({ _id: new Types.ObjectId(pageId) });
    if (!page) {
      throw new Error(`Page ${pageId} not found`);
    }
    return page;
  }

  async function summaryOf(siteId: string, pageId: string): Promise<PageSummary> {
    const summary = (await listPages(client, siteId)).items.find((item) => item.id === pageId);
    if (!summary) {
      throw new Error(`Page ${pageId} is not listed`);
    }
    return summary;
  }

  async function moveTo(pageId: string, targetReleaseId: string | null, reason: string) {
    const detail = await getPage(client, pageId);
    const response = await client
      .post(`/pages/${pageId}/pointer`, {
        targetReleaseId,
        expectedCurrentReleaseId: detail.page.liveRelease?.id ?? null,
        reason,
      })
      .expect(200);
    return pointerMoveResponseSchema.parse(response.body);
  }

  it('walks the status lifecycle through the page list', async () => {
    const lifecycleSite = await createSite(client, workspaceId);
    const slug = uniqueSlug('vong-doi');
    const page = await createPage(client, lifecycleSite.id, { slug });
    const pageId = page.page.id;
    expect((await summaryOf(lifecycleSite.id, pageId)).status.kind).toBe('draft');

    await replaceDraft(client, pageId, publishableDraft(slug, 'Bản 1'));
    expect((await summaryOf(lifecycleSite.id, pageId)).status.kind).toBe('draft');

    const v1 = await publish(client, pageId, 'Bản đầu tiên');
    expect(v1.release).toMatchObject({ version: 1, note: 'Bản đầu tiên', slug });
    expect(v1.release.changeSummary.map((change) => change.label)).toEqual([
      'Thêm: Hero',
      'SEO: tiêu đề',
      'SEO: mô tả',
    ]);
    expect(v1.liveUrl).toBe(`${lifecycleSite.defaultOrigin}/${slug}`);
    expect(v1.page.status.kind).toBe('live');
    expect(await summaryOf(lifecycleSite.id, pageId)).toMatchObject({
      status: { kind: 'live', changeCount: 0 },
      latestVersion: 1,
      lastPointerEvent: { type: 'published', version: 1 },
    });

    await editHeroHeading(client, pageId, 'Bản 2');
    const detail = await getPage(client, pageId);
    await replaceDraft(client, pageId, {
      slug,
      composition: detail.draft.composition,
      seo: cleanSeo({ title: 'Tiêu đề mới' }),
    });
    expect((await summaryOf(lifecycleSite.id, pageId)).status).toEqual({
      kind: 'live_with_changes',
      changeCount: 2,
      changes: [
        {
          kind: 'modified',
          label: 'Sửa: Hero',
          sectionId: detail.draft.composition.sections[0]?.id,
        },
        { kind: 'seo', label: 'SEO: tiêu đề', sectionId: null },
      ],
    });

    const v2 = await publish(client, pageId);
    expect(v2.release.version).toBe(2);
    expect(v2.release.changeSummary.map((change) => change.label)).toEqual([
      'Sửa: Hero',
      'SEO: tiêu đề',
    ]);
    expect((await summaryOf(lifecycleSite.id, pageId)).status.kind).toBe('live');

    const rollback = await moveTo(pageId, v1.release.id, 'Bản 2 sai giá');
    expect(rollback.page.liveRelease?.version).toBe(1);
    expect(await summaryOf(lifecycleSite.id, pageId)).toMatchObject({
      status: { kind: 'live_with_changes', changeCount: 2 },
      lastPointerEvent: { type: 'rolled_back', version: 1 },
      latestVersion: 2,
    });

    const undo = await client.post(`/activity/${rollback.activityId}/undo`).expect(200);
    expect(pointerMoveResponseSchema.parse(undo.body).page.liveRelease?.version).toBe(2);
    expect(await summaryOf(lifecycleSite.id, pageId)).toMatchObject({
      status: { kind: 'live' },
      lastPointerEvent: { type: 'rollback_undone', version: 2 },
    });

    await moveTo(pageId, null, 'Hết chương trình');
    expect(await summaryOf(lifecycleSite.id, pageId)).toMatchObject({
      status: { kind: 'unpublished', changeCount: 0 },
      liveRelease: null,
      liveUrl: null,
      lastPointerEvent: { type: 'unpublished', version: null },
    });
    await new TestClient(t.app)
      .get(`/public/sites/${lifecycleSite.subdomain}/resolve?path=${slug}`)
      .expect(404);
  });

  describe('POST /pages/:pageId/releases', () => {
    it('refuses to publish with blocking checks and returns them', async () => {
      const page = await createPage(client, site.id);
      const body = await currentPublishBody(client, page.page.id);
      const response = await publishRequest(client, page.page.id, body).expect(422);
      const problem = problemSchema.parse(response.body);
      expect(problem.code).toBe('publish_blocked');
      const checks = checksResultSchema.parse(problem.context?.['checks']);
      expect(checks.blocking.map((item) => item.code)).toEqual([
        'no_visible_section_desktop',
        'no_visible_section_mobile',
      ]);
      expect(await releasesOf(page.page.id)).toHaveLength(0);
    });

    it('refuses unacknowledged warnings and accepts them once acknowledged', async () => {
      const slug = uniqueSlug('canh-bao');
      const page = await createPage(client, site.id, { slug });
      await replaceDraft(client, page.page.id, {
        ...publishableDraft(slug),
        seo: cleanSeo({ title: '' }),
      });
      const body = await currentPublishBody(client, page.page.id);
      expect(body.acknowledgedWarnings).toEqual(['seo_title_missing:seo:title']);

      const blocked = await publishRequest(client, page.page.id, {
        ...body,
        acknowledgedWarnings: [],
      }).expect(422);
      const checks = checksResultSchema.parse(
        problemSchema.parse(blocked.body).context?.['checks'],
      );
      expect(checks.warnings.map((item) => item.fingerprint)).toEqual([
        'seo_title_missing:seo:title',
      ]);

      const published = await publishRequest(client, page.page.id, body).expect(201);
      expect(publishResponseSchema.parse(published.body).release.version).toBe(1);
      const [release] = await releasesOf(page.page.id);
      expect(release?.['checks']).toEqual({
        warningsAcknowledged: ['seo_title_missing:seo:title'],
      });
    });

    it('requires a valid Idempotency-Key header', async () => {
      const page = await createPage(client, site.id);
      const body = await currentPublishBody(client, page.page.id);
      const missing = await publishRequest(client, page.page.id, body, null).expect(422);
      expect(problemSchema.parse(missing.body).issues?.[0]?.path).toEqual([
        'headers',
        'idempotency-key',
      ]);
      await publishRequest(client, page.page.id, body, 'short').expect(422);
    });

    it('returns the same result for the same Idempotency-Key and creates one release', async () => {
      const slug = uniqueSlug('idem');
      const page = await createPage(client, site.id, { slug });
      await replaceDraft(client, page.page.id, publishableDraft(slug));
      const body = await currentPublishBody(client, page.page.id);
      const key = randomUUID();
      const first = await publishRequest(client, page.page.id, body, key).expect(201);
      const calls = revalidation.calls.length;
      const second = await publishRequest(client, page.page.id, body, key).expect(200);
      expect(second.body).toEqual(first.body);
      expect(await releasesOf(page.page.id)).toHaveLength(1);
      expect(revalidation.calls).toHaveLength(calls);
      const events = await client.get(`/sites/${site.id}/activity?limit=50`).expect(200);
      const published = activityListResponseSchema
        .parse(events.body)
        .items.filter((item) => item.type === 'page.published' && item.page?.id === page.page.id);
      expect(published).toHaveLength(1);
    });

    it('answers two concurrent publishes with the same key with one release and one result', async () => {
      const slug = uniqueSlug('idem-dong-thoi');
      const page = await createPage(client, site.id, { slug });
      await replaceDraft(client, page.page.id, publishableDraft(slug));
      const body = await currentPublishBody(client, page.page.id);
      const key = randomUUID();
      const responses = await Promise.all([
        publishRequest(client, page.page.id, body, key),
        publishRequest(client, page.page.id, body, key),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
      const [first, second] = responses;
      expect(first.body).toEqual(second.body);
      expect(await releasesOf(page.page.id)).toHaveLength(1);
    });

    it('lets exactly one of two concurrent publishes win', async () => {
      const slug = uniqueSlug('dong-thoi');
      const page = await createPage(client, site.id, { slug });
      await replaceDraft(client, page.page.id, publishableDraft(slug));
      const body = await currentPublishBody(client, page.page.id);
      const responses = await Promise.all([
        publishRequest(client, page.page.id, body, randomUUID()),
        publishRequest(client, page.page.id, body, randomUUID()),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      const loser = responses.find((response) => response.status === 409);
      expect(['pointer_conflict', 'revision_conflict']).toContain(
        problemSchema.parse(loser?.body).code,
      );
      expect(await releasesOf(page.page.id)).toHaveLength(1);
      expect((await storedPage(page.page.id))['releaseSeq']).toBe(1);
    });

    it('answers 409 when the draft revision or the live pointer moved', async () => {
      const { pageId, published } = await createLivePage(client, site.id, uniqueSlug('lech'));
      await editHeroHeading(client, pageId, 'Bản 2');
      const body = await currentPublishBody(client, pageId);

      const staleRevision = await publishRequest(client, pageId, {
        ...body,
        expectedRevision: body.expectedRevision - 1,
      }).expect(409);
      expect(problemSchema.parse(staleRevision.body)).toMatchObject({
        code: 'revision_conflict',
        context: { currentRevision: body.expectedRevision },
      });

      const stalePointer = await publishRequest(client, pageId, {
        ...body,
        expectedPublishedReleaseId: null,
      }).expect(409);
      expect(problemSchema.parse(stalePointer.body).code).toBe('pointer_conflict');
      expect(await releasesOf(pageId)).toHaveLength(1);
      expect((await getPage(client, pageId)).page.liveRelease?.id).toBe(published.release.id);
    });

    it('blocks a slug another page is live at through the checks', async () => {
      const slug = uniqueSlug('dang-dung');
      const owner = await createLivePage(client, site.id, slug, 'Trang A', 'Trang A');
      await replaceDraft(client, owner.pageId, publishableDraft(uniqueSlug('trang-a-moi')));
      const page = await createPage(client, site.id);
      await replaceDraft(client, page.page.id, publishableDraft(slug));
      const body = await currentPublishBody(client, page.page.id);
      const response = await publishRequest(client, page.page.id, body).expect(422);
      const checks = checksResultSchema.parse(
        problemSchema.parse(response.body).context?.['checks'],
      );
      expect(checks.blocking).toEqual([
        expect.objectContaining({
          code: 'slug_taken',
          title: `Đường dẫn /${slug} đang được trang “Trang A” dùng`,
        }),
      ]);
    });

    it('rolls the whole transaction back when another page went live at the slug meanwhile', async () => {
      const slug = uniqueSlug('chay-dua');
      const owner = await createLivePage(client, site.id, slug, 'Trang A', 'Trang A');
      await replaceDraft(client, owner.pageId, publishableDraft(uniqueSlug('trang-a-moi')));
      const page = await createPage(client, site.id);
      await replaceDraft(client, page.page.id, publishableDraft(slug));
      const body = await currentPublishBody(client, page.page.id);
      const before = await storedPage(page.page.id);

      // The checks ran before the other page went live: they see no live page at the slug.
      vi.spyOn(t.app.get(PagesRepository), 'listLiveForSite').mockResolvedValueOnce([]);
      const response = await publishRequest(client, page.page.id, body).expect(409);
      expect(problemSchema.parse(response.body)).toMatchObject({
        code: 'slug_taken',
        title: `Đường dẫn /${slug} đang được trang “Trang A” dùng`,
      });
      expect(await releasesOf(page.page.id)).toHaveLength(0);
      const after = await storedPage(page.page.id);
      expect(after['releaseSeq']).toBe(0);
      expect(after['publishedReleaseId']).toBeNull();
      expect(after['updatedAt']).toEqual(before['updatedAt']);
      const events = await client.get(`/sites/${site.id}/activity?limit=50`).expect(200);
      expect(
        activityListResponseSchema
          .parse(events.body)
          .items.some((item) => item.type === 'page.published' && item.page?.id === page.page.id),
      ).toBe(false);
    });
  });

  describe('release immutability', () => {
    it('rejects any update or delete query on releases at the model level', async () => {
      const { pageId } = await createLivePage(client, site.id, uniqueSlug('bat-bien'));
      const releases = t.connection.model(RELEASE_MODEL);
      const filter = { pageId: new Types.ObjectId(pageId) };
      await expect(releases.updateOne(filter, { $set: { note: 'Sửa lén' } })).rejects.toThrow(
        'Releases are immutable',
      );
      await expect(releases.findOneAndUpdate(filter, { $set: { version: 9 } })).rejects.toThrow(
        'Releases are immutable',
      );
      await expect(releases.deleteMany(filter)).rejects.toThrow('Releases are immutable');
      const [release] = await releasesOf(pageId);
      expect(release).toMatchObject({ version: 1, note: '' });
    });
  });

  describe('GET /pages/:pageId/checks', () => {
    it('returns the checks of the current draft', async () => {
      const page = await createPage(client, site.id);
      const response = await client.get(`/pages/${page.page.id}/checks`).expect(200);
      expect(checksResultSchema.parse(response.body)).toMatchObject({
        revision: 0,
        blocking: [{ code: 'no_visible_section_desktop' }, { code: 'no_visible_section_mobile' }],
      });
    });
  });

  describe('revalidation', () => {
    it('refreshes the site after publish, rollback, undo and unpublish', async () => {
      const revalidationSite = await createSite(client, workspaceId);
      revalidation.calls.length = 0;
      const { pageId, published } = await createLivePage(
        client,
        revalidationSite.id,
        uniqueSlug('rv'),
      );
      await editHeroHeading(client, pageId, 'Bản 2');
      await publish(client, pageId);
      const rollback = await moveTo(pageId, published.release.id, 'Quay lại');
      await client.post(`/activity/${rollback.activityId}/undo`).expect(200);
      await moveTo(pageId, null, 'Gỡ');
      expect(revalidation.calls).toEqual(Array(5).fill(revalidationSite.subdomain));
    });

    it('reports a failed revalidation and flags the activity, while the publish succeeds', async () => {
      const slug = uniqueSlug('rv-loi');
      const page = await createPage(client, site.id, { slug });
      await replaceDraft(client, page.page.id, publishableDraft(slug));
      revalidation.result = 'failed';
      const published = await publish(client, page.page.id);
      expect(published.revalidation).toBe('failed');
      expect(published.page.status.kind).toBe('live');
      const events = await client.get(`/sites/${site.id}/activity?limit=50`).expect(200);
      const event = activityListResponseSchema
        .parse(events.body)
        .items.find((item) => item.type === 'page.published' && item.page?.id === page.page.id);
      expect(event?.data.revalidationFailed).toBe(true);

      const rollbackTarget = published.release.id;
      revalidation.result = 'ok';
      await editHeroHeading(client, page.page.id, 'Bản 2');
      await publish(client, page.page.id);
      revalidation.result = 'failed';
      const moved = await moveTo(page.page.id, rollbackTarget, 'Thử lại');
      expect(moved.revalidation).toBe('failed');
    });
  });
});
