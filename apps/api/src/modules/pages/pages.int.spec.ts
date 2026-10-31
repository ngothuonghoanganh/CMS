import { Logger } from '@nestjs/common';
import {
  type ActivityItem,
  activityListResponseSchema,
  compositionSchema,
  MAX_PAGES_PER_SITE,
  pageCountResponseSchema,
  pageDetailResponseSchema,
  problemSchema,
  type Site,
  slugAvailabilitySchema,
} from '@plp/contracts';
import { validateComposition } from '@plp/sections/schema';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import {
  cleanSeo,
  composition,
  heroSection,
  publishableDraft,
} from '../../../test/compositions.js';
import {
  createLivePage,
  createPage,
  editHeroHeading,
  getPage,
  listPages,
  publish,
  RecordingRevalidationClient,
  replaceDraft,
  saveDraft,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { addEditor, createSite, uploadImage } from '../../../test/resources.js';

describe('pages and drafts', () => {
  let t: TestApp;
  let client: TestClient;
  let workspaceId: string;
  let userId: string;
  let site: Site;

  beforeAll(async () => {
    t = await createTestApp(
      'plp_test_pages',
      withRevalidationRecorder(new RecordingRevalidationClient()),
    );
    const owner = await signedUpClient(t.app);
    client = owner.client;
    workspaceId = owner.workspaceId;
    userId = owner.me.user.id;
    site = await createSite(client, workspaceId, { name: 'Nha khoa Smile Care' });
  });

  afterAll(async () => {
    await t.close();
  });

  /** Stores `count` blank draft pages in the site directly, bypassing the API's page limit. */
  async function insertPages(siteId: string, count: number): Promise<void> {
    const now = new Date();
    await t.connection.collection('pages').insertMany(
      Array.from({ length: count }, (_unused, index) => ({
        workspaceId: new Types.ObjectId(workspaceId),
        siteId: new Types.ObjectId(siteId),
        title: `Trang ${index}`,
        goal: null,
        draft: {
          slug: `trang-${index}`,
          composition: { version: 1, sections: [] },
          seo: cleanSeo(),
          revision: 0,
          updatedAt: now,
          updatedBy: new Types.ObjectId(userId),
        },
        publishedReleaseId: null,
        publishedSlug: null,
        releaseSeq: 0,
        createdBy: new Types.ObjectId(userId),
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  async function activity(siteId: string): Promise<ActivityItem[]> {
    const response = await client.get(`/sites/${siteId}/activity?limit=50`).expect(200);
    return activityListResponseSchema.parse(response.body).items;
  }

  describe('POST /sites/:siteId/pages', () => {
    it('creates a blank page as a draft with an empty composition', async () => {
      const slug = uniqueSlug('trang-trang');
      const detail = await createPage(client, site.id, { title: 'Trang trống', slug });
      expect(detail.page).toMatchObject({
        siteId: site.id,
        title: 'Trang trống',
        slug,
        goal: null,
        status: { kind: 'draft', changeCount: 0, changes: [] },
        liveRelease: null,
        latestVersion: 0,
        lastPointerEvent: null,
        liveUrl: null,
      });
      expect(detail.draft).toMatchObject({
        slug,
        composition: { version: 1, sections: [] },
        seo: { title: '', description: '', shareImageAssetId: null, noindex: false },
        revision: 0,
      });
      expect(detail.checks.blocking.map((item) => item.code)).toEqual([
        'no_visible_section_desktop',
        'no_visible_section_mobile',
      ]);
      expect(detail.page.checks).toEqual({ blocking: 2, warnings: 2 });
      const [created] = await activity(site.id);
      expect(created).toMatchObject({
        type: 'page.created',
        page: { id: detail.page.id, title: 'Trang trống' },
      });
    });

    it('builds a page for a goal with the brief as real content and sample paths elsewhere', async () => {
      const detail = await createPage(client, site.id, {
        title: 'Ưu đãi tháng 11',
        slug: uniqueSlug('uu-dai'),
        start: {
          kind: 'goal',
          goal: 'promo',
          brief: { offer: 'Giảm 30% niềng răng', audience: 'người đi làm', phone: '0901234567' },
          style: 'bold',
        },
      });
      expect(detail.page.goal).toBe('promo');
      expect(compositionSchema.safeParse(detail.draft.composition).success).toBe(true);
      expect(validateComposition(detail.draft.composition)).toEqual([]);
      const sections = detail.draft.composition.sections;
      expect(sections[0]?.type).toBe('navbar');
      expect(sections.at(-1)?.type).toBe('footer');
      for (const section of sections) {
        expect(section.id).toMatch(/^[a-z0-9]{12}$/);
      }
      const hero = sections.find((section) => section.type === 'hero');
      expect(hero?.content['heading']).toBe('Giảm 30% niềng răng');
      expect(hero?.samplePaths).not.toContain('heading');
      expect(sections.some((section) => section.samplePaths.length > 0)).toBe(true);
      expect(detail.checks.warnings.some((item) => item.code === 'sample_content')).toBe(true);
    });

    it('rejects a draft slug another page already uses', async () => {
      const slug = uniqueSlug('trung');
      await createPage(client, site.id, { slug });
      const response = await client
        .post(`/sites/${site.id}/pages`, { title: 'Trùng', slug, start: { kind: 'blank' } })
        .expect(409);
      const problem = problemSchema.parse(response.body);
      expect(problem.code).toBe('slug_taken');
      expect(problem.issues?.[0]?.path).toEqual(['slug']);
    });

    it('validates the body with the contract messages', async () => {
      const response = await client
        .post(`/sites/${site.id}/pages`, { title: '', slug: 'Có Dấu', start: { kind: 'blank' } })
        .expect(422);
      const issues = problemSchema.parse(response.body).issues ?? [];
      expect(issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          'Nhập tên trang',
          'Chỉ dùng chữ thường không dấu, số và dấu gạch ngang',
        ]),
      );
    });

    it(`stops at ${MAX_PAGES_PER_SITE} pages per site`, async () => {
      const full = await createSite(client, workspaceId);
      await insertPages(full.id, MAX_PAGES_PER_SITE);
      const response = await client
        .post(`/sites/${full.id}/pages`, { title: 'Thêm', slug: 'them', start: { kind: 'blank' } })
        .expect(409);
      expect(problemSchema.parse(response.body)).toMatchObject({
        code: 'page_limit_reached',
        title: `Mỗi site có tối đa ${MAX_PAGES_PER_SITE} trang`,
      });
    });
  });

  describe('page limit under concurrency', () => {
    it('creates only one of several racing pages when one slot is left', async () => {
      const almostFull = await createSite(client, workspaceId);
      await insertPages(almostFull.id, MAX_PAGES_PER_SITE - 1);
      const responses = await Promise.all(
        ['dua-1', 'dua-2', 'dua-3'].map((slug) =>
          client.post(`/sites/${almostFull.id}/pages`, {
            title: slug,
            slug,
            start: { kind: 'blank' },
          }),
        ),
      );
      expect(responses.map((response) => response.status).sort()).toEqual([201, 409, 409]);
      for (const response of responses.filter(({ status }) => status === 409)) {
        expect(problemSchema.parse(response.body).code).toBe('page_limit_reached');
      }
      expect(
        await t.connection
          .collection('pages')
          .countDocuments({ siteId: new Types.ObjectId(almostFull.id) }),
      ).toBe(MAX_PAGES_PER_SITE);
      expect((await listPages(client, almostFull.id)).counts.all).toBe(MAX_PAGES_PER_SITE);
    });

    it('fails loudly instead of hiding pages when a site holds more than the limit', async () => {
      const overfull = await createSite(client, workspaceId);
      await insertPages(overfull.id, MAX_PAGES_PER_SITE + 1);
      const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      try {
        const response = await client.get(`/sites/${overfull.id}/pages`).expect(500);
        expect(problemSchema.parse(response.body).code).toBe('internal');
        const [entry, message]: unknown[] = logged.mock.calls[0] ?? [];
        expect(message).toBe('Unhandled error');
        expect(entry).toMatchObject({
          err: {
            message: `Site ${overfull.id} holds more than ${MAX_PAGES_PER_SITE} pages (ADR-014)`,
          },
        });
      } finally {
        logged.mockRestore();
      }
    });
  });

  describe('PUT /pages/:pageId/draft', () => {
    it('saves the draft, increments the revision and returns status and checks', async () => {
      const page = await createPage(client, site.id);
      const draft = publishableDraft(page.page.slug);
      const saved = await saveDraft(client, page.page.id, { baseRevision: 0, ...draft });
      expect(saved.revision).toBe(1);
      expect(saved.page.status.kind).toBe('draft');
      expect(saved.checks).toMatchObject({ revision: 1, blocking: [], warnings: [] });
      expect(saved.checks.passed).toHaveLength(8);

      const again = await saveDraft(client, page.page.id, { baseRevision: 1, ...draft });
      expect(again.revision).toBe(2);
      const detail = await getPage(client, page.page.id);
      expect(detail.draft.composition).toEqual(draft.composition);
      expect(detail.draft.seo).toEqual(draft.seo);
      expect(detail.draft.revision).toBe(2);
    });

    it('answers a stale base revision with 409 and the current revision', async () => {
      const page = await createPage(client, site.id);
      const draft = publishableDraft(page.page.slug);
      await saveDraft(client, page.page.id, { baseRevision: 0, ...draft });
      const response = await client
        .put(`/pages/${page.page.id}/draft`, { baseRevision: 0, ...draft })
        .expect(409);
      expect(problemSchema.parse(response.body)).toMatchObject({
        code: 'revision_conflict',
        context: { currentRevision: 1 },
      });
      expect((await getPage(client, page.page.id)).draft.revision).toBe(1);
    });

    it('rejects an invalid composition with the path of the problem', async () => {
      const page = await createPage(client, site.id);
      const hero = heroSection();
      const response = await client
        .put(`/pages/${page.page.id}/draft`, {
          baseRevision: 0,
          slug: page.page.slug,
          composition: composition([
            { ...hero, content: { ...hero.content, heading: 'x'.repeat(81) } },
          ]),
          seo: cleanSeo(),
        })
        .expect(422);
      const issues = problemSchema.parse(response.body).issues ?? [];
      expect(issues[0]).toMatchObject({
        path: ['composition', 'sections', 0, 'content', 'heading'],
        message: 'Tối đa 80 ký tự',
      });
    });

    it('rejects a navigation bar that is not first', async () => {
      const page = await createPage(client, site.id);
      const draft = publishableDraft(page.page.slug);
      const navbar = (
        await createPage(client, site.id, {
          slug: uniqueSlug('goal'),
          start: {
            kind: 'goal',
            goal: 'about',
            brief: { offer: '', audience: '', phone: '' },
            style: 'calm',
          },
        })
      ).draft.composition.sections[0];
      if (!navbar) {
        throw new Error('The goal page has no navigation bar');
      }
      const response = await client
        .put(`/pages/${page.page.id}/draft`, {
          baseRevision: 0,
          ...draft,
          composition: composition([...draft.composition.sections, navbar]),
        })
        .expect(422);
      expect(problemSchema.parse(response.body).issues?.[0]?.path).toEqual([
        'composition',
        'sections',
        1,
        'type',
      ]);
    });

    it('rejects an image or share image that is not in this site', async () => {
      const otherSite = await createSite(client, workspaceId);
      const foreign = await uploadImage(client, otherSite.id);
      const own = await uploadImage(client, site.id);
      const page = await createPage(client, site.id);
      const response = await client
        .put(`/pages/${page.page.id}/draft`, {
          baseRevision: 0,
          slug: page.page.slug,
          composition: composition([
            heroSection({ image: { assetId: own.id, alt: 'Phòng khám', decorative: false } }),
            heroSection({ image: { assetId: foreign.id, alt: 'Ảnh', decorative: false } }),
          ]),
          seo: cleanSeo({ shareImageAssetId: foreign.id }),
        })
        .expect(422);
      const issues = problemSchema.parse(response.body).issues ?? [];
      expect(issues.map((issue) => issue.path)).toEqual([
        ['composition', 'sections', 1, 'content', 'image'],
        ['seo', 'shareImageAssetId'],
      ]);
      expect(issues[0]?.message).toBe('Ảnh không có trong thư viện của site này');
      expect((await getPage(client, page.page.id)).draft.revision).toBe(0);
    });

    it('rejects a draft slug another page uses', async () => {
      const first = await createPage(client, site.id);
      const second = await createPage(client, site.id);
      const response = await client
        .put(`/pages/${second.page.id}/draft`, {
          baseRevision: 0,
          ...publishableDraft(first.page.slug),
        })
        .expect(409);
      expect(problemSchema.parse(response.body).code).toBe('slug_taken');
    });

    it('never changes what is live', async () => {
      const { pageId, published } = await createLivePage(client, site.id, uniqueSlug('live'));
      const saved = await editHeroHeading(client, pageId, 'Tiêu đề mới');
      expect(saved.page.liveRelease?.id).toBe(published.release.id);
      expect(saved.page.status).toMatchObject({
        kind: 'live_with_changes',
        changeCount: 1,
        changes: [{ kind: 'modified', label: 'Sửa: Hero' }],
      });
      const stored = await t.connection
        .collection<{ publishedReleaseId: Types.ObjectId | null }>('pages')
        .findOne({ _id: new Types.ObjectId(pageId) });
      expect(stored?.publishedReleaseId?.toHexString()).toBe(published.release.id);
    });
  });

  describe('GET /sites/:siteId/page-count', () => {
    it('counts the pages of the site, whatever their status, without listing them', async () => {
      const countSite = await createSite(client, workspaceId);
      const count = async () =>
        pageCountResponseSchema.parse(
          (await client.get(`/sites/${countSite.id}/page-count`).expect(200)).body,
        ).count;
      expect(await count()).toBe(0);
      await createPage(client, countSite.id);
      await createLivePage(client, countSite.id, uniqueSlug('dem'));
      expect(await count()).toBe(2);
      expect((await listPages(client, countSite.id)).counts.all).toBe(2);
    });
  });

  describe('GET /sites/:siteId/pages', () => {
    it('lists pages with status, counts, attention, filters and a cursor', async () => {
      const listSite = await createSite(client, workspaceId);
      const draft = await createPage(client, listSite.id, { title: 'Bản nháp trống' });
      const live = await createLivePage(
        client,
        listSite.id,
        'gia-uu-dai',
        'Giá ưu đãi',
        'Bảng giá',
      );
      const changed = await createLivePage(
        client,
        listSite.id,
        'khai-truong',
        'Khai trương',
        'Khai trương',
      );
      await editHeroHeading(client, changed.pageId, 'Khai trương chi nhánh 2');

      const all = await listPages(client, listSite.id);
      expect(all.items.map((item) => item.title)).toEqual([
        'Khai trương',
        'Bảng giá',
        'Bản nháp trống',
      ]);
      // "Live" counts every page that is currently live, including the one with changes.
      expect(all.counts).toEqual({
        all: 3,
        live: 2,
        live_with_changes: 1,
        draft: 1,
        unpublished: 0,
      });
      expect(all.attention).toEqual({
        pagesWithChanges: 1,
        pagesWithBlockingErrors: 1,
        firstPage: { id: changed.pageId, title: 'Khai trương' },
      });
      const liveItem = all.items.find((item) => item.id === live.pageId);
      expect(liveItem).toMatchObject({
        status: { kind: 'live' },
        latestVersion: 1,
        liveRelease: { id: live.published.release.id, version: 1, slug: 'gia-uu-dai' },
        lastPointerEvent: { type: 'published', version: 1 },
        liveUrl: `${listSite.defaultOrigin}/gia-uu-dai`,
        checks: { blocking: 0, warnings: 0 },
      });
      expect(all.items.find((item) => item.id === draft.page.id)?.checks.blocking).toBe(2);

      const filtered = await listPages(client, listSite.id, '?status=live_with_changes');
      expect(filtered.items.map((item) => item.id)).toEqual([changed.pageId]);
      expect(filtered.counts.all).toBe(3);
      const allLive = await listPages(client, listSite.id, '?status=live');
      expect(allLive.items.map((item) => item.id)).toEqual([changed.pageId, live.pageId]);
      const drafts = await listPages(client, listSite.id, '?status=draft');
      expect(drafts.items.map((item) => item.id)).toEqual([draft.page.id]);
      const searched = await listPages(client, listSite.id, `?q=${encodeURIComponent('BẢNG')}`);
      expect(searched.items.map((item) => item.id)).toEqual([live.pageId]);
      const bySlug = await listPages(client, listSite.id, '?q=khai-tr');
      expect(bySlug.items.map((item) => item.id)).toEqual([changed.pageId]);
      const regex = await listPages(client, listSite.id, `?q=${encodeURIComponent('.*')}`);
      expect(regex.items).toEqual([]);

      const first = await listPages(client, listSite.id, '?limit=2');
      expect(first.items).toHaveLength(2);
      const second = await listPages(
        client,
        listSite.id,
        `?limit=2&cursor=${first.nextCursor ?? ''}`,
      );
      expect([...first.items, ...second.items].map((item) => item.id)).toEqual(
        all.items.map((item) => item.id),
      );
      expect(second.nextCursor).toBeNull();
    });

    it('lists the home page live URL as the site origin', async () => {
      const homeSite = await createSite(client, workspaceId);
      await createLivePage(client, homeSite.id, '');
      const [home] = (await listPages(client, homeSite.id)).items;
      expect(home?.liveUrl).toBe(homeSite.defaultOrigin);
    });

    it('leads "Xem site live" to the home page, or to a live page while there is none', async () => {
      const liveSite = await createSite(client, workspaceId);
      expect((await listPages(client, liveSite.id)).liveSiteUrl).toBeNull();
      const slug = uniqueSlug('uu-dai');
      await createLivePage(client, liveSite.id, slug);
      // Even when the filter lists none of the live pages.
      expect((await listPages(client, liveSite.id, '?status=draft')).liveSiteUrl).toBe(
        `${liveSite.defaultOrigin}/${slug}`,
      );
      await createLivePage(client, liveSite.id, '');
      expect((await listPages(client, liveSite.id)).liveSiteUrl).toBe(liveSite.defaultOrigin);
    });
  });

  describe('POST /pages/:pageId/draft/restore', () => {
    it('copies a release into the draft without touching releases or the pointer', async () => {
      const { pageId, published } = await createLivePage(
        client,
        site.id,
        uniqueSlug('khoi-phuc'),
        'Bản 1',
      );
      await replaceDraft(client, pageId, publishableDraft(published.release.slug, 'Bản nháp'));
      const before = await getPage(client, pageId);
      const response = await client
        .post(`/pages/${pageId}/draft/restore`, {
          baseRevision: before.draft.revision,
          releaseId: published.release.id,
        })
        .expect(200);
      const restored = pageDetailResponseSchema.parse(response.body);
      expect(restored.draft.revision).toBe(before.draft.revision + 1);
      expect(restored.draft.composition.sections[0]?.content['heading']).toBe('Bản 1');
      expect(restored.page.liveRelease?.id).toBe(published.release.id);
      expect(restored.page.latestVersion).toBe(1);
      const [event] = await activity(site.id);
      expect(event).toMatchObject({
        type: 'page.draft_restored',
        data: { version: 1 },
        page: { id: pageId },
      });
    });

    it('guards the revision and the release owner', async () => {
      const a = await createLivePage(client, site.id, uniqueSlug('a'));
      const b = await createLivePage(client, site.id, uniqueSlug('b'));
      const stale = await client
        .post(`/pages/${a.pageId}/draft/restore`, {
          baseRevision: 0,
          releaseId: a.published.release.id,
        })
        .expect(409);
      expect(problemSchema.parse(stale.body).code).toBe('revision_conflict');
      const current = await getPage(client, a.pageId);
      const foreign = await client
        .post(`/pages/${a.pageId}/draft/restore`, {
          baseRevision: current.draft.revision,
          releaseId: b.published.release.id,
        })
        .expect(404);
      expect(problemSchema.parse(foreign.body).title).toBe('Không tìm thấy phiên bản');
    });
  });

  describe('GET /sites/:siteId/slug-availability', () => {
    it('reports invalid, reserved, taken (draft or live) and free slugs', async () => {
      const page = await createPage(client, site.id, { slug: uniqueSlug('dung-roi') });
      const { pageId: livePageId, published } = await createLivePage(
        client,
        site.id,
        uniqueSlug('live'),
      );
      await replaceDraft(client, livePageId, publishableDraft(uniqueSlug('doi-slug')));

      async function check(slug: string, pageId?: string) {
        const query = new URLSearchParams({ slug, ...(pageId ? { pageId } : {}) });
        const response = await client
          .get(`/sites/${site.id}/slug-availability?${query.toString()}`)
          .expect(200);
        return slugAvailabilitySchema.parse(response.body);
      }

      expect(await check('Có Dấu')).toMatchObject({ available: false, reason: 'invalid' });
      expect(await check('api')).toMatchObject({
        available: false,
        reason: 'reserved',
        message: 'Đường dẫn này được hệ thống giữ lại',
      });
      expect(await check(page.page.slug)).toMatchObject({
        available: false,
        reason: 'taken',
        message: `Đường dẫn này đang được trang “${page.page.title}” dùng`,
      });
      expect(await check(published.release.slug)).toMatchObject({
        available: false,
        reason: 'taken',
      });
      expect(await check(published.release.slug, livePageId)).toMatchObject({ available: true });
      expect(await check(page.page.slug, page.page.id)).toEqual({
        slug: page.page.slug,
        available: true,
        reason: null,
        message: null,
      });
      expect(await check(uniqueSlug('trong'))).toMatchObject({ available: true });
    });
  });

  it('lets an editor of the workspace edit and publish', async () => {
    const editor = await addEditor(t, workspaceId);
    const page = await createPage(editor.client, site.id);
    await replaceDraft(editor.client, page.page.id, publishableDraft(page.page.slug));
    const published = await publish(editor.client, page.page.id);
    expect(published.release.createdBy.name).toBe(editor.me.user.name);
  });
});
