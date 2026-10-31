import {
  activityListResponseSchema,
  historyResponseSchema,
  type PointerMoveResponse,
  pointerMoveResponseSchema,
  problemSchema,
  type PublishResponse,
  type ResolveResponse,
  resolveResponseSchema,
  type Site,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, TestClient } from '../../../test/client.js';
import { publishableDraft } from '../../../test/compositions.js';
import {
  createLivePage,
  editHeroHeading,
  getPage,
  publish,
  RecordingRevalidationClient,
  replaceDraft,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { createSite } from '../../../test/resources.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';

describe('rollback, undo, unpublish, redirects and history', () => {
  let t: TestApp;
  let client: TestClient;
  let visitor: TestClient;
  let workspaceId: string;
  let site: Site;

  beforeAll(async () => {
    t = await createTestApp(
      'plp_test_pointer',
      withRevalidationRecorder(new RecordingRevalidationClient()),
    );
    const owner = await signedUpClient(t.app);
    client = owner.client;
    workspaceId = owner.workspaceId;
    site = await createSite(client, workspaceId);
    visitor = new TestClient(t.app);
  });

  afterAll(async () => {
    await t.close();
  });

  function pointer(
    pageId: string,
    body: {
      targetReleaseId: string | null;
      expectedCurrentReleaseId: string | null;
      reason: string;
    },
  ) {
    return client.post(`/pages/${pageId}/pointer`, body);
  }

  async function moveTo(
    pageId: string,
    targetReleaseId: string | null,
    reason = 'Lý do',
  ): Promise<PointerMoveResponse> {
    const detail = await getPage(client, pageId);
    const response = await pointer(pageId, {
      targetReleaseId,
      expectedCurrentReleaseId: detail.page.liveRelease?.id ?? null,
      reason,
    }).expect(200);
    return pointerMoveResponseSchema.parse(response.body);
  }

  async function resolve(siteRef: Site, path: string): Promise<ResolveResponse> {
    const response = await visitor
      .get(`/public/sites/${siteRef.subdomain}/resolve?path=${encodeURIComponent(path)}`)
      .expect(200);
    return resolveResponseSchema.parse(response.body);
  }

  async function snapshotDocuments(pageId: string) {
    const id = new Types.ObjectId(pageId);
    const releases = await t.connection
      .collection('releases')
      .find({ pageId: id })
      .sort({ version: 1 })
      .toArray();
    const page = await t.connection.collection('pages').findOne({ _id: id });
    return { releases, draft: page?.['draft'] as unknown };
  }

  /** A page with v1 and v2 published, v2 live. */
  async function twoVersions(slug = uniqueSlug('hai-ban')) {
    const { pageId, published: v1 } = await createLivePage(client, site.id, slug, 'Bản 1');
    await editHeroHeading(client, pageId, 'Bản 2');
    const v2 = await publish(client, pageId);
    return { pageId, v1, v2 };
  }

  /**
   * Runs `move` while another tab publishes v3 between the move's first check and its
   * transaction, so only the conditional pointer update inside the transaction sees the conflict.
   * `published` holds that publish, which proves the race took place.
   */
  async function duringConcurrentPublish<T>(
    pageId: string,
    move: () => Promise<T>,
  ): Promise<{ result: T; published: PublishResponse[] }> {
    const runner = t.app.get(TransactionRunner, { strict: false });
    const realRun = runner.run.bind(runner);
    const published: PublishResponse[] = [];
    const spy = vi.spyOn(runner, 'run').mockImplementationOnce(async (work) => {
      await editHeroHeading(client, pageId, 'Bản 3');
      published.push(await publish(client, pageId));
      return realRun(work);
    });
    try {
      return { result: await move(), published };
    } finally {
      spy.mockRestore();
    }
  }

  /** Activity types recorded for one page, newest first. */
  async function pageActivityTypes(pageId: string): Promise<string[]> {
    const events = await client.get(`/sites/${site.id}/activity?limit=50`).expect(200);
    return activityListResponseSchema
      .parse(events.body)
      .items.filter((item) => item.page?.id === pageId)
      .map((item) => item.type);
  }

  describe('rollback', () => {
    it('moves only the pointer: releases and the draft stay byte for byte', async () => {
      const { pageId, v1 } = await twoVersions();
      await editHeroHeading(client, pageId, 'Bản nháp 3');
      const before = await snapshotDocuments(pageId);
      const moved = await moveTo(pageId, v1.release.id, 'Bản 2 sai giá');
      expect(moved.page.liveRelease?.version).toBe(1);
      expect(moved.revalidation).toBe('ok');
      const after = await snapshotDocuments(pageId);
      expect(after.releases).toEqual(before.releases);
      expect(after.draft).toEqual(before.draft);
      const events = await client.get(`/sites/${site.id}/activity?limit=5`).expect(200);
      const [event] = activityListResponseSchema.parse(events.body).items;
      expect(event).toMatchObject({
        id: moved.activityId,
        type: 'page.rolled_back',
        data: { fromVersion: 2, toVersion: 1 },
        reason: 'Bản 2 sai giá',
        undoable: true,
      });
    });

    it('refuses the release that is already live', async () => {
      const { pageId, v2 } = await twoVersions();
      const response = await pointer(pageId, {
        targetReleaseId: v2.release.id,
        expectedCurrentReleaseId: v2.release.id,
        reason: 'Không đổi',
      }).expect(409);
      expect(problemSchema.parse(response.body)).toMatchObject({
        code: 'conflict',
        title: 'Phiên bản này đang live',
      });
    });

    it('answers 404 for a release of another page', async () => {
      const { pageId, v2 } = await twoVersions();
      const other = await twoVersions();
      const response = await pointer(pageId, {
        targetReleaseId: other.v1.release.id,
        expectedCurrentReleaseId: v2.release.id,
        reason: 'Nhầm trang',
      }).expect(404);
      expect(problemSchema.parse(response.body).title).toBe('Không tìm thấy phiên bản');
    });

    it('answers 409 when the expected current release is stale', async () => {
      const { pageId, v1 } = await twoVersions();
      const response = await pointer(pageId, {
        targetReleaseId: v1.release.id,
        expectedCurrentReleaseId: v1.release.id,
        reason: 'Cũ',
      }).expect(409);
      expect(problemSchema.parse(response.body).code).toBe('pointer_conflict');
    });

    it('re-checks the pointer inside its transaction: a publish committed meanwhile stays live', async () => {
      const { pageId, v1, v2 } = await twoVersions();
      const { result: response, published } = await duringConcurrentPublish(pageId, async () =>
        pointer(pageId, {
          targetReleaseId: v1.release.id,
          expectedCurrentReleaseId: v2.release.id,
          reason: 'Bản 2 sai giá',
        }).expect(409),
      );
      expect(problemSchema.parse(response.body).code).toBe('pointer_conflict');
      expect(published.map((item) => item.release.version)).toEqual([3]);
      expect((await getPage(client, pageId)).page.liveRelease?.version).toBe(3);
      const activity = await pageActivityTypes(pageId);
      expect(activity[0]).toBe('page.published');
      expect(activity).not.toContain('page.rolled_back');
    });

    it('requires a reason', async () => {
      const { pageId, v1, v2 } = await twoVersions();
      const response = await pointer(pageId, {
        targetReleaseId: v1.release.id,
        expectedCurrentReleaseId: v2.release.id,
        reason: '  ',
      }).expect(422);
      expect(problemSchema.parse(response.body).issues?.[0]?.message).toBe('Nhập lý do');
    });
  });

  describe('undo', () => {
    it('moves the pointer back while the rollback is the latest pointer event', async () => {
      const { pageId, v1, v2 } = await twoVersions();
      const rollback = await moveTo(pageId, v1.release.id, 'Sai giá');
      const before = await snapshotDocuments(pageId);
      const response = await client.post(`/activity/${rollback.activityId}/undo`).expect(200);
      const undone = pointerMoveResponseSchema.parse(response.body);
      expect(undone.page.liveRelease?.id).toBe(v2.release.id);
      const after = await snapshotDocuments(pageId);
      expect(after).toEqual(before);
      const events = await client.get(`/sites/${site.id}/activity?limit=5`).expect(200);
      const [event, original] = activityListResponseSchema.parse(events.body).items;
      expect(event).toMatchObject({
        id: undone.activityId,
        type: 'page.rollback_undone',
        data: { fromVersion: 1, toVersion: 2 },
        reason: 'Hoàn tác khôi phục: Sai giá',
      });
      expect(original).toMatchObject({ id: rollback.activityId, undoable: false });

      const again = await client.post(`/activity/${rollback.activityId}/undo`).expect(409);
      expect(problemSchema.parse(again.body)).toMatchObject({
        code: 'undo_not_available',
        title: 'Không thể hoàn tác vì trang đã thay đổi sau lần khôi phục này',
      });
    });

    it('is not available after another publish', async () => {
      const { pageId, v1 } = await twoVersions();
      const rollback = await moveTo(pageId, v1.release.id, 'Sai giá');
      await editHeroHeading(client, pageId, 'Bản 3');
      await publish(client, pageId);
      const response = await client.post(`/activity/${rollback.activityId}/undo`).expect(409);
      expect(problemSchema.parse(response.body).code).toBe('undo_not_available');
      expect((await getPage(client, pageId)).page.liveRelease?.version).toBe(3);
    });

    it('re-checks inside its transaction: a publish and rollback committed meanwhile win', async () => {
      const { pageId, v1 } = await twoVersions();
      const rollback = await moveTo(pageId, v1.release.id, 'Sai giá');
      const runner = t.app.get(TransactionRunner, { strict: false });
      const realRun = runner.run.bind(runner);
      let concurrent: PointerMoveResponse | null = null;
      // Between the undo's first check and its transaction, another tab publishes v3 and rolls
      // back to v1 again. The pointer is on v1 as the first rollback left it, but that rollback
      // is no longer the page's latest pointer event.
      const spy = vi.spyOn(runner, 'run').mockImplementationOnce(async (work) => {
        await editHeroHeading(client, pageId, 'Bản 3');
        await publish(client, pageId);
        concurrent = await moveTo(pageId, v1.release.id, 'Lại sai giá');
        return realRun(work);
      });
      try {
        const response = await client.post(`/activity/${rollback.activityId}/undo`).expect(409);
        expect(problemSchema.parse(response.body).code).toBe('undo_not_available');
      } finally {
        spy.mockRestore();
      }
      expect(concurrent).not.toBeNull();
      const detail = await getPage(client, pageId);
      expect(detail.page.liveRelease?.version).toBe(1);
      expect(detail.page.lastPointerEvent).toMatchObject({ type: 'rolled_back', version: 1 });
      const events = await client.get(`/sites/${site.id}/activity?limit=5`).expect(200);
      expect(
        activityListResponseSchema
          .parse(events.body)
          .items.filter((item) => item.page?.id === pageId)
          .map((item) => item.type),
      ).not.toContain('page.rollback_undone');
    });

    it('is only available for rollbacks', async () => {
      const { pageId } = await twoVersions();
      const unpublished = await moveTo(pageId, null, 'Gỡ');
      const response = await client.post(`/activity/${unpublished.activityId}/undo`).expect(409);
      expect(problemSchema.parse(response.body).code).toBe('undo_not_available');
      await client.post(`/activity/${new Types.ObjectId().toHexString()}/undo`).expect(404);
      await client.post('/activity/not-an-id/undo').expect(404);
    });
  });

  describe('unpublish', () => {
    it('takes the page offline and keeps its releases', async () => {
      const slug = uniqueSlug('go');
      const { pageId, published } = await createLivePage(client, site.id, slug);
      expect((await resolve(site, slug)).kind).toBe('page');
      const moved = await moveTo(pageId, null, 'Hết chương trình');
      expect(moved.page.status.kind).toBe('unpublished');
      expect(moved.page.liveUrl).toBeNull();
      await visitor.get(`/public/sites/${site.subdomain}/resolve?path=${slug}`).expect(404);
      expect((await snapshotDocuments(pageId)).releases).toHaveLength(1);

      const again = await pointer(pageId, {
        targetReleaseId: null,
        expectedCurrentReleaseId: null,
        reason: 'Gỡ lần nữa',
      }).expect(409);
      expect(problemSchema.parse(again.body).code).toBe('conflict');

      const back = await moveTo(pageId, published.release.id, 'Mở lại');
      expect(back.page.status.kind).toBe('live');
      expect((await resolve(site, slug)).kind).toBe('page');
    });

    it('re-checks the pointer inside its transaction: a publish committed meanwhile stays online', async () => {
      const slug = uniqueSlug('go');
      const { pageId, v2 } = await twoVersions(slug);
      const { result: response, published } = await duringConcurrentPublish(pageId, async () =>
        pointer(pageId, {
          targetReleaseId: null,
          expectedCurrentReleaseId: v2.release.id,
          reason: 'Hết chương trình',
        }).expect(409),
      );
      expect(problemSchema.parse(response.body).code).toBe('pointer_conflict');
      expect(published.map((item) => item.release.version)).toEqual([3]);
      expect((await getPage(client, pageId)).page.liveRelease?.version).toBe(3);
      expect((await resolve(site, slug)).kind).toBe('page');
      const activity = await pageActivityTypes(pageId);
      expect(activity[0]).toBe('page.published');
      expect(activity).not.toContain('page.unpublished');
    });
  });

  describe('slug changes', () => {
    it('redirects the old live slug to the new one after publishing', async () => {
      const a = uniqueSlug('a');
      const b = uniqueSlug('b');
      const { pageId } = await createLivePage(client, site.id, a);
      await replaceDraft(client, pageId, publishableDraft(b));
      // The draft slug changed, but nothing is live at b and a still serves the page.
      expect((await resolve(site, a)).kind).toBe('page');
      await visitor.get(`/public/sites/${site.subdomain}/resolve?path=${b}`).expect(404);

      const v2 = await publish(client, pageId);
      expect(v2.liveUrl).toBe(`${site.defaultOrigin}/${b}`);
      expect(await resolve(site, a)).toEqual({ kind: 'redirect', location: `/${b}` });
      expect((await resolve(site, b)).kind).toBe('page');
    });

    it('drops the redirect when another page goes live at the old slug', async () => {
      const a = uniqueSlug('a');
      const { pageId } = await createLivePage(client, site.id, a);
      await replaceDraft(client, pageId, publishableDraft(uniqueSlug('b')));
      await publish(client, pageId);
      expect((await resolve(site, a)).kind).toBe('redirect');

      const other = await createLivePage(client, site.id, a, 'Trang mới', 'Trang mới');
      const resolved = await resolve(site, a);
      expect(resolved.kind === 'page' && resolved.data.page.id).toBe(other.pageId);
      const redirect = await t.connection
        .collection('redirects')
        .findOne({ siteId: new Types.ObjectId(site.id), fromSlug: a });
      expect(redirect).toBeNull();
    });

    it('moves the live slug back on rollback and redirects the newer slug', async () => {
      const a = uniqueSlug('a');
      const b = uniqueSlug('b');
      const { pageId, published: v1 } = await createLivePage(client, site.id, a);
      await replaceDraft(client, pageId, publishableDraft(b));
      await publish(client, pageId);

      const moved = await moveTo(pageId, v1.release.id, 'Giữ đường dẫn cũ');
      expect(moved.page.liveUrl).toBe(`${site.defaultOrigin}/${a}`);
      expect((await resolve(site, a)).kind).toBe('page');
      expect(await resolve(site, b)).toEqual({ kind: 'redirect', location: `/${a}` });
    });

    it('refuses a rollback to a slug another page is live at, changing nothing', async () => {
      const a = uniqueSlug('a');
      const { pageId, published: v1 } = await createLivePage(client, site.id, a);
      await replaceDraft(client, pageId, publishableDraft(uniqueSlug('b')));
      const v2 = await publish(client, pageId);
      await createLivePage(client, site.id, a, 'Trang chiếm chỗ', 'Trang chiếm chỗ');
      const before = await snapshotDocuments(pageId);

      const response = await pointer(pageId, {
        targetReleaseId: v1.release.id,
        expectedCurrentReleaseId: v2.release.id,
        reason: 'Quay lại',
      }).expect(409);
      expect(problemSchema.parse(response.body)).toMatchObject({
        code: 'slug_taken',
        title: `Đường dẫn /${a} đang được trang “Trang chiếm chỗ” dùng`,
      });
      expect(await snapshotDocuments(pageId)).toEqual(before);
      expect((await getPage(client, pageId)).page.liveRelease?.id).toBe(v2.release.id);
    });
  });

  describe('GET /pages/:pageId/history', () => {
    it('interleaves releases and pointer moves newest first, with a cursor across both', async () => {
      const { pageId, v1, v2 } = await twoVersions();
      const rollback = await moveTo(pageId, v1.release.id, 'Sai giá');
      await client.post(`/activity/${rollback.activityId}/undo`).expect(200);
      await editHeroHeading(client, pageId, 'Bản 3');
      const v3 = await publish(client, pageId, 'Bản ba');
      const unpublished = await moveTo(pageId, null, 'Tạm gỡ');

      const response = await client.get(`/pages/${pageId}/history?limit=50`).expect(200);
      const history = historyResponseSchema.parse(response.body);
      expect(history.liveReleaseId).toBeNull();
      expect(history.releaseCount).toBe(3);
      expect(
        history.items.map((item) =>
          item.kind === 'release' ? `v${item.release.version}` : item.type,
        ),
      ).toEqual(['unpublished', 'v3', 'rollback_undone', 'rolled_back', 'v2', 'v1']);
      const [first, third] = [history.items[0], history.items[1]];
      expect(first).toMatchObject({
        kind: 'pointer',
        activityId: unpublished.activityId,
        fromVersion: 3,
        toVersion: null,
        reason: 'Tạm gỡ',
        undoable: false,
      });
      expect(third).toMatchObject({
        kind: 'release',
        release: { id: v3.release.id, note: 'Bản ba', changeSummary: [{ label: 'Sửa: Hero' }] },
      });
      expect(history.items[4]).toMatchObject({ kind: 'release', release: { id: v2.release.id } });

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const query: string = cursor === null ? '?limit=4' : `?limit=4&cursor=${cursor}`;
        const page = historyResponseSchema.parse(
          (await client.get(`/pages/${pageId}/history${query}`).expect(200)).body,
        );
        seen.push(
          ...page.items.map((item) =>
            item.kind === 'release' ? item.release.id : item.activityId,
          ),
        );
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor !== null);
      expect(pages).toBe(2);
      expect(seen).toEqual(
        history.items.map((item) => (item.kind === 'release' ? item.release.id : item.activityId)),
      );
    });

    it('marks the latest rollback as undoable', async () => {
      const { pageId, v1, v2 } = await twoVersions();
      const rollback = await moveTo(pageId, v1.release.id, 'Sai giá');
      const history = historyResponseSchema.parse(
        (await client.get(`/pages/${pageId}/history`).expect(200)).body,
      );
      expect(history.liveReleaseId).toBe(v1.release.id);
      expect(history.items[0]).toMatchObject({
        kind: 'pointer',
        activityId: rollback.activityId,
        type: 'rolled_back',
        fromVersion: 2,
        toVersion: 1,
        undoable: true,
      });
      expect(history.items[1]).toMatchObject({ kind: 'release', release: { id: v2.release.id } });
    });
  });
});
