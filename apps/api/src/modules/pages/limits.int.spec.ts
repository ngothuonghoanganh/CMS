import {
  type HistoryEntry,
  historyResponseSchema,
  MAX_PAGES_PER_SITE,
  MAX_SECTIONS,
  MAX_SITES_PER_WORKSPACE,
  problemSchema,
  resolveResponseSchema,
  type Site,
  siteListResponseSchema,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, TestClient } from '../../../test/client.js';
import { cleanSeo, composition, heroSection } from '../../../test/compositions.js';
import {
  createLivePage,
  createPage,
  editHeroHeading,
  getPage,
  listPages,
  publish,
  RecordingRevalidationClient,
  saveDraft,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { createSite, uniqueSubdomain } from '../../../test/resources.js';

/** The limits of ADR-014 at their edges: the last item allowed and the first refused. */
describe('limits at the edges', () => {
  let t: TestApp;
  let client: TestClient;
  let workspaceId: string;
  let userId: string;
  let site: Site;

  beforeAll(async () => {
    t = await createTestApp(
      'plp_test_limits',
      withRevalidationRecorder(new RecordingRevalidationClient()),
    );
    const owner = await signedUpClient(t.app);
    client = owner.client;
    workspaceId = owner.workspaceId;
    userId = owner.me.user.id;
    site = await createSite(client, workspaceId);
  });

  afterAll(async () => {
    await t.close();
  });

  describe(`${MAX_SECTIONS} sections per page`, () => {
    it('saves, publishes and serves the last section allowed and refuses the next', async () => {
      const slug = uniqueSlug('ba-muoi');
      const page = await createPage(client, site.id, { slug });
      const full = composition(
        Array.from({ length: MAX_SECTIONS }, (_unused, index) =>
          heroSection({ heading: `Phần ${String(index + 1)}` }),
        ),
      );
      const saved = await saveDraft(client, page.page.id, {
        baseRevision: 0,
        slug,
        composition: full,
        seo: cleanSeo(),
      });
      expect(saved.checks.blocking).toEqual([]);
      expect((await getPage(client, page.page.id)).draft.composition.sections).toHaveLength(
        MAX_SECTIONS,
      );

      const published = await publish(client, page.page.id);
      const resolved = resolveResponseSchema.parse(
        (
          await new TestClient(t.app)
            .get(`/public/sites/${site.subdomain}/resolve?path=${slug}`)
            .expect(200)
        ).body,
      );
      expect(resolved.kind === 'page' && resolved.data.page.composition.sections).toHaveLength(
        MAX_SECTIONS,
      );
      expect(resolved.kind === 'page' && resolved.data.releaseId).toBe(published.release.id);

      const response = await client
        .put(`/pages/${page.page.id}/draft`, {
          baseRevision: saved.revision,
          slug,
          composition: composition([...full.sections, heroSection({ heading: 'Một phần nữa' })]),
          seo: cleanSeo(),
        })
        .expect(422);
      expect(problemSchema.parse(response.body).issues).toEqual([
        expect.objectContaining({
          path: ['composition', 'sections'],
          message: `Một trang có tối đa ${MAX_SECTIONS} section`,
        }),
      ]);
      expect((await getPage(client, page.page.id)).draft.revision).toBe(saved.revision);
    });
  });

  describe(`${MAX_PAGES_PER_SITE} pages per site`, () => {
    it('creates the last page allowed, lists every page and refuses the next', async () => {
      const full = await createSite(client, workspaceId);
      const now = new Date();
      await t.connection.collection('pages').insertMany(
        Array.from({ length: MAX_PAGES_PER_SITE - 1 }, (_unused, index) => ({
          workspaceId: new Types.ObjectId(workspaceId),
          siteId: new Types.ObjectId(full.id),
          title: `Trang ${String(index)}`,
          goal: null,
          draft: {
            slug: `trang-${String(index)}`,
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

      await createPage(client, full.id, { title: 'Trang cuối cùng', slug: 'trang-cuoi' });
      const refused = await client
        .post(`/sites/${full.id}/pages`, { title: 'Thừa', slug: 'thua', start: { kind: 'blank' } })
        .expect(409);
      expect(problemSchema.parse(refused.body)).toMatchObject({
        code: 'page_limit_reached',
        title: `Mỗi site có tối đa ${MAX_PAGES_PER_SITE} trang`,
      });

      // Every page once, page after page of the list.
      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        const listed = await listPages(
          client,
          full.id,
          cursor === null ? '?limit=50' : `?limit=50&cursor=${cursor}`,
        );
        expect(listed.counts.all).toBe(MAX_PAGES_PER_SITE);
        ids.push(...listed.items.map((item) => item.id));
        cursor = listed.nextCursor;
      } while (cursor !== null);
      expect(ids).toHaveLength(MAX_PAGES_PER_SITE);
      expect(new Set(ids).size).toBe(MAX_PAGES_PER_SITE);
    });
  });

  describe(`${MAX_SITES_PER_WORKSPACE} sites per workspace`, () => {
    it('creates the last site allowed, lists every site and refuses the next', async () => {
      const owner = await signedUpClient(t.app);
      const now = new Date();
      await t.connection.collection('sites').insertMany(
        Array.from({ length: MAX_SITES_PER_WORKSPACE - 1 }, (_unused, index) => ({
          workspaceId: new Types.ObjectId(owner.workspaceId),
          name: `Site ${String(index)}`,
          subdomain: uniqueSubdomain('gioi-han'),
          themePresetId: 'mint',
          logoAssetId: null,
          defaultShareImageAssetId: null,
          pageSeq: 0,
          createdBy: new Types.ObjectId(owner.me.user.id),
          createdAt: now,
          updatedAt: now,
        })),
      );

      const last = await createSite(owner.client, owner.workspaceId, { name: 'Site cuối cùng' });
      const refused = await owner.client
        .post(`/workspaces/${owner.workspaceId}/sites`, {
          name: 'Thừa',
          subdomain: uniqueSubdomain('thua'),
        })
        .expect(409);
      expect(problemSchema.parse(refused.body)).toMatchObject({
        code: 'site_limit_reached',
        title: `Mỗi workspace có tối đa ${MAX_SITES_PER_WORKSPACE} site`,
      });
      const listed = siteListResponseSchema.parse(
        (await owner.client.get(`/workspaces/${owner.workspaceId}/sites`).expect(200)).body,
      );
      expect(listed.items).toHaveLength(MAX_SITES_PER_WORKSPACE);
      expect(new Set(listed.items.map((item) => item.id)).size).toBe(MAX_SITES_PER_WORKSPACE);
      expect(listed.items.map((item) => item.id)).toContain(last.id);
    });
  });

  describe('history past one page', () => {
    function entryId(entry: HistoryEntry): string {
      return entry.kind === 'release' ? entry.release.id : entry.activityId;
    }

    /** Every history entry of the page, paged with `limit` (the default when undefined). */
    async function pageThrough(pageId: string, limit?: number): Promise<string[][]> {
      const pages: string[][] = [];
      let cursor: string | null = null;
      do {
        const params = new URLSearchParams();
        if (limit !== undefined) {
          params.set('limit', String(limit));
        }
        if (cursor !== null) {
          params.set('cursor', cursor);
        }
        const history = historyResponseSchema.parse(
          (await client.get(`/pages/${pageId}/history?${params.toString()}`).expect(200)).body,
        );
        pages.push(history.items.map(entryId));
        cursor = history.nextCursor;
      } while (cursor !== null && pages.length < 50);
      return pages;
    }

    /** What the history must list: releases and pointer moves, newest first, then larger id. */
    async function expectedOrder(pageId: string): Promise<string[]> {
      const id = new Types.ObjectId(pageId);
      const [releases, events] = await Promise.all([
        t.connection.collection('releases').find({ pageId: id }).toArray(),
        t.connection
          .collection('activity')
          .find({
            pageId: id,
            type: { $in: ['page.rolled_back', 'page.rollback_undone', 'page.unpublished'] },
          })
          .toArray(),
      ]);
      return [...releases, ...events]
        .map((row) => ({ id: row._id.toHexString(), at: (row['createdAt'] as Date).getTime() }))
        .sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1))
        .map((row) => row.id);
    }

    it('lists every entry once across pages, even when entries share a time', async () => {
      const { pageId, published: v1 } = await createLivePage(client, site.id, uniqueSlug('ls'));
      for (let version = 2; version <= 12; version += 1) {
        await editHeroHeading(client, pageId, `Bản ${String(version)}`);
        await publish(client, pageId);
      }
      for (let round = 0; round < 5; round += 1) {
        const live = (await getPage(client, pageId)).page.liveRelease?.id ?? null;
        const rollback = await client
          .post(`/pages/${pageId}/pointer`, {
            targetReleaseId: v1.release.id,
            expectedCurrentReleaseId: live,
            reason: `Lần ${String(round)}`,
          })
          .expect(200);
        const { activityId } = rollback.body as { activityId: string };
        await client.post(`/activity/${activityId}/undo`).expect(200);
      }
      await client
        .post(`/pages/${pageId}/pointer`, {
          targetReleaseId: null,
          expectedCurrentReleaseId: (await getPage(client, pageId)).page.liveRelease?.id ?? null,
          reason: 'Tạm gỡ',
        })
        .expect(200);

      const id = new Types.ObjectId(pageId);
      const total = 12 + 5 * 2 + 1;
      const distinct = await expectedOrder(pageId);
      expect(distinct).toHaveLength(total);
      expect((await pageThrough(pageId)).flat()).toEqual(distinct);

      // A publish and its pointer move, or a burst of moves, can land in the same millisecond.
      // Ties are the hard case for a cursor; make every entry of both lists share one time.
      const sameTime = new Date('2026-10-30T09:00:00.000Z');
      await t.connection
        .collection('releases')
        .updateMany({ pageId: id }, { $set: { createdAt: sameTime } });
      await t.connection
        .collection('activity')
        .updateMany({ pageId: id }, { $set: { createdAt: sameTime } });
      const tied = await expectedOrder(pageId);
      expect(new Set(tied)).toEqual(new Set(distinct));

      const byDefault = await pageThrough(pageId);
      expect(byDefault.map((page) => page.length)).toEqual([20, total - 20]);
      expect(byDefault.flat()).toEqual(tied);
      for (const limit of [1, 4, 7, 22, 23, 50]) {
        const paged = (await pageThrough(pageId, limit)).flat();
        expect(paged).toEqual(tied);
      }
    });
  });
});
