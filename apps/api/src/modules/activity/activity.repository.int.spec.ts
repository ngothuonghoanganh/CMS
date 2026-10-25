import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient } from '../../../test/client.js';
import { createSite, scopeOf } from '../../../test/resources.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { ActivityRepository } from './activity.repository.js';
import type { ActivityRecord } from './activity.schema.js';

describe('ActivityRepository', () => {
  let t: TestApp;
  let repository: ActivityRepository;
  let scope: WorkspaceScope;
  let siteId: Types.ObjectId;
  let otherScope: WorkspaceScope;
  let otherSiteId: Types.ObjectId;

  beforeAll(async () => {
    t = await createTestApp('plp_test_activity_repo');
    repository = t.app.get(ActivityRepository);

    const a = await signedUpClient(t.app);
    scope = await scopeOf(t, a.me, a.workspaceId);
    siteId = new Types.ObjectId((await createSite(a.client, a.workspaceId)).id);

    const b = await signedUpClient(t.app);
    otherScope = await scopeOf(t, b.me, b.workspaceId);
    otherSiteId = new Types.ObjectId((await createSite(b.client, b.workspaceId)).id);
  });

  afterAll(async () => {
    await t.close();
  });

  function recordFor(
    pageId: Types.ObjectId,
    type: ActivityRecord['type'],
    inScope: WorkspaceScope = scope,
    site: Types.ObjectId = siteId,
  ): Promise<Types.ObjectId> {
    return repository.record(inScope, { siteId: site, type, page: { id: pageId, title: 'Trang' } });
  }

  describe('record', () => {
    it('stores the scope user as actor and fills unused data with defaults', async () => {
      const id = await repository.record(scope, { siteId, type: 'site.created' });
      const stored = await repository.findById(scope, id);
      expect(stored).toMatchObject({
        workspaceId: scope.workspaceId,
        siteId,
        actorId: scope.userId,
        pageId: null,
        pageTitle: null,
        reason: null,
        data: {
          version: null,
          fromVersion: null,
          toVersion: null,
          fromReleaseId: null,
          toReleaseId: null,
          revalidationFailed: false,
        },
      });
    });

    it('rolls back with the transaction it joins', async () => {
      const marker = `rolled back ${new Types.ObjectId().toHexString()}`;
      await expect(
        t.connection.transaction(async (tx) => {
          await repository.record(scope, { siteId, type: 'site.created', reason: marker }, tx);
          throw new Error('abort');
        }),
      ).rejects.toThrow('abort');
      expect(await t.connection.collection('activity').countDocuments({ reason: marker })).toBe(0);
    });
  });

  describe('latestPointerEvents', () => {
    it('returns the newest pointer event of each page in one call', async () => {
      const published = new Types.ObjectId();
      await recordFor(published, 'page.published');
      const publishedLatest = await recordFor(published, 'page.published');

      const rolledBack = new Types.ObjectId();
      await recordFor(rolledBack, 'page.published');
      const rollback = await recordFor(rolledBack, 'page.rolled_back');
      await recordFor(rolledBack, 'page.draft_restored');
      await recordFor(rolledBack, 'page.created');

      const unpublished = new Types.ObjectId();
      await recordFor(unpublished, 'page.rolled_back');
      await recordFor(unpublished, 'page.rollback_undone');
      const unpublish = await recordFor(unpublished, 'page.unpublished');

      const neverLive = new Types.ObjectId();
      await recordFor(neverLive, 'page.created');

      const latest = await repository.latestPointerEvents(scope, [
        published,
        rolledBack,
        unpublished,
        neverLive,
        published,
      ]);
      expect(
        new Map([...latest].map(([page, record]) => [page, record._id.toHexString()])),
      ).toEqual(
        new Map([
          [published.toHexString(), publishedLatest.toHexString()],
          [rolledBack.toHexString(), rollback.toHexString()],
          [unpublished.toHexString(), unpublish.toHexString()],
        ]),
      );
      expect(latest.get(rolledBack.toHexString())?.type).toBe('page.rolled_back');
    });

    it('ignores events of other workspaces and handles an empty list', async () => {
      const page = new Types.ObjectId();
      await recordFor(page, 'page.published', otherScope, otherSiteId);
      expect((await repository.latestPointerEvents(scope, [page])).size).toBe(0);
      expect((await repository.latestPointerEvents(otherScope, [page])).size).toBe(1);
      expect((await repository.latestPointerEvents(scope, [])).size).toBe(0);
    });
  });

  describe('listForPage', () => {
    it('pages through the events of one page, optionally filtered by type', async () => {
      const page = new Types.ObjectId();
      const created = await recordFor(page, 'page.created');
      const v1 = await recordFor(page, 'page.published');
      const restored = await recordFor(page, 'page.draft_restored');
      const v2 = await recordFor(page, 'page.published');
      await recordFor(new Types.ObjectId(), 'page.published');

      const first = await repository.listForPage(scope, page, undefined, 3);
      expect(first.items.map((item) => item._id)).toEqual([v2, restored, v1]);
      expect(first.nextCursor).not.toBeNull();
      const second = await repository.listForPage(scope, page, first.nextCursor ?? undefined, 3);
      expect(second.items.map((item) => item._id)).toEqual([created]);
      expect(second.nextCursor).toBeNull();

      const pointerOnly = await repository.listForPage(scope, page, undefined, 10, [
        'page.published',
      ]);
      expect(pointerOnly.items.map((item) => item._id)).toEqual([v2, v1]);

      expect((await repository.listForPage(otherScope, page, undefined, 10)).items).toEqual([]);
    });
  });

  describe('lookups', () => {
    it('finds by id only in the owning workspace and exposes an access ref', async () => {
      const id = await repository.record(scope, { siteId, type: 'site.created' });
      expect(await repository.findById(otherScope, id)).toBeNull();
      expect(await repository.findAccessRef(id)).toEqual({
        id,
        workspaceId: scope.workspaceId,
        siteId,
      });
      expect(await repository.findAccessRef(new Types.ObjectId())).toBeNull();
    });
  });

  describe('markRevalidationFailed', () => {
    it('flags the event and fails loudly for an unknown id', async () => {
      const id = await recordFor(new Types.ObjectId(), 'page.published');
      await repository.markRevalidationFailed(id);
      expect((await repository.findById(scope, id))?.data.revalidationFailed).toBe(true);
      await expect(repository.markRevalidationFailed(new Types.ObjectId())).rejects.toThrow(
        /does not exist/,
      );
    });
  });

  it('exposes no way to edit or delete history besides the revalidation flag', () => {
    const methods = Object.getOwnPropertyNames(ActivityRepository.prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(methods.filter((name) => /update|delete|remove|replace|set/i.test(name))).toEqual([]);
    expect(methods).toContain('markRevalidationFailed');
  });
});
