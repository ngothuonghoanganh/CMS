import { type ActivityItem, activityListResponseSchema, problemSchema } from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { addEditor, createSite, scopeOf, uploadImage } from '../../../test/resources.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { ActivityRepository } from './activity.repository.js';

describe('GET /sites/:siteId/activity', () => {
  let t: TestApp;
  let activity: ActivityRepository;

  beforeAll(async () => {
    t = await createTestApp('plp_test_activity');
    activity = t.app.get(ActivityRepository);
  });

  afterAll(async () => {
    await t.close();
  });

  async function setup(): Promise<{
    client: TestClient;
    scope: WorkspaceScope;
    siteId: string;
    siteObjectId: Types.ObjectId;
    workspaceId: string;
    userName: string;
  }> {
    const { client, me, workspaceId } = await signedUpClient(t.app);
    const site = await createSite(client, workspaceId);
    return {
      client,
      scope: await scopeOf(t, me, workspaceId),
      siteId: site.id,
      siteObjectId: new Types.ObjectId(site.id),
      workspaceId,
      userName: me.user.name,
    };
  }

  async function list(client: TestClient, siteId: string, query = ''): Promise<ActivityItem[]> {
    const response = await client.get(`/sites/${siteId}/activity${query}`).expect(200);
    return activityListResponseSchema.parse(response.body).items;
  }

  it('lists site and asset events newest first with actor names', async () => {
    const { client, siteId, workspaceId, userName } = await setup();
    const editor = await addEditor(t, workspaceId);
    await uploadImage(client, siteId);
    await uploadImage(editor.client, siteId);

    const items = await list(client, siteId);
    expect(items.map((item) => [item.type, item.actor.name])).toEqual([
      ['asset.uploaded', editor.me.user.name],
      ['asset.uploaded', userName],
      ['site.created', userName],
    ]);
    expect(items.every((item) => item.siteId === siteId && item.page === null)).toBe(true);
    expect(await list(editor.client, siteId)).toEqual(items);
  });

  it('paginates with a cursor into disjoint pages that cover every event', async () => {
    const { client, scope, siteId, siteObjectId } = await setup();
    for (let version = 1; version <= 4; version += 1) {
      await activity.record(scope, {
        siteId: siteObjectId,
        type: 'page.published',
        page: { id: new Types.ObjectId(), title: `Trang ${version}` },
        data: { version },
      });
    }
    const all = await list(client, siteId, '?limit=50');
    expect(all).toHaveLength(5);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = cursor === null ? '?limit=2' : `?limit=2&cursor=${cursor}`;
      const response = await client.get(`/sites/${siteId}/activity${query}`).expect(200);
      const page = activityListResponseSchema.parse(response.body);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor !== null);

    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(all.map((item) => item.id));
  });

  it('maps versions, reason and the page title snapshot', async () => {
    const { client, scope, siteId, siteObjectId } = await setup();
    const pageId = new Types.ObjectId();
    await activity.record(scope, {
      siteId: siteObjectId,
      type: 'page.rolled_back',
      page: { id: pageId, title: 'Khuyến mãi tháng 10' },
      data: {
        fromVersion: 3,
        toVersion: 2,
        fromReleaseId: new Types.ObjectId(),
        toReleaseId: new Types.ObjectId(),
      },
      reason: 'Bản 3 sai giá',
    });
    const [latest] = await list(client, siteId);
    expect(latest).toMatchObject({
      type: 'page.rolled_back',
      page: { id: pageId.toHexString(), title: 'Khuyến mãi tháng 10' },
      data: { version: null, fromVersion: 3, toVersion: 2, revalidationFailed: false },
      reason: 'Bản 3 sai giá',
    });
    expect(latest).not.toHaveProperty('data.fromReleaseId');
  });

  it('marks a rollback undoable only while it is the latest pointer event of its page', async () => {
    const { client, scope, siteId, siteObjectId } = await setup();
    const record = (
      pageId: Types.ObjectId,
      type: 'page.published' | 'page.rolled_back' | 'page.rollback_undone' | 'page.draft_restored',
    ) =>
      activity.record(scope, { siteId: siteObjectId, type, page: { id: pageId, title: 'Trang' } });

    const replaced = new Types.ObjectId();
    const oldRollback = await record(replaced, 'page.rolled_back');
    await record(replaced, 'page.published');

    const undone = new Types.ObjectId();
    const undoneRollback = await record(undone, 'page.rolled_back');
    await record(undone, 'page.rollback_undone');

    const current = new Types.ObjectId();
    const currentRollback = await record(current, 'page.rolled_back');
    // Not a pointer move: it does not change what is live.
    await record(current, 'page.draft_restored');

    const undoable = new Map((await list(client, siteId)).map((item) => [item.id, item.undoable]));
    expect(undoable.get(oldRollback.toHexString())).toBe(false);
    expect(undoable.get(undoneRollback.toHexString())).toBe(false);
    expect(undoable.get(currentRollback.toHexString())).toBe(true);
    expect([...undoable.values()].filter(Boolean)).toHaveLength(1);
  });

  it('rejects a forged cursor and an out-of-range limit', async () => {
    const { client, siteId } = await setup();
    const forged = await client.get(`/sites/${siteId}/activity?cursor=abc`).expect(422);
    expect(problemSchema.parse(forged.body).title).toBe('Con trỏ phân trang không hợp lệ');
    await client.get(`/sites/${siteId}/activity?limit=500`).expect(422);
  });
});
