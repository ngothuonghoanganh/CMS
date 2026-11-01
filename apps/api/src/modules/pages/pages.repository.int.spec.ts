import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient } from '../../../test/client.js';
import { explainFindOne, indexScans, recordCalls } from '../../../test/explain.js';
import { scopeOf } from '../../../test/resources.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { PAGES_PUBLISHED_SLUG_INDEX } from './page.schema.js';
import { PagesRepository } from './pages.repository.js';

/**
 * Live-slug lookups run for every page the renderer resolves and every view it relays (ADR-009,
 * ADR-019): one probe of the partial unique index, however many pages the site has.
 */
describe('PagesRepository live-slug lookups', () => {
  let t: TestApp;
  let scope: WorkspaceScope;
  let workspaceId: Types.ObjectId;

  beforeAll(async () => {
    t = await createTestApp('plp_test_pages_repository');
    const signedUp = await signedUpClient(t.app);
    scope = await scopeOf(t, signedUp.me, signedUp.workspaceId);
    workspaceId = new Types.ObjectId(signedUp.workspaceId);
  });

  afterAll(async () => {
    await t.close();
  });

  /** A page as the repository stores it; `live` gives it a release and a live slug. */
  function storedPage(siteId: Types.ObjectId, slug: string, live: boolean) {
    const now = new Date();
    const userId = new Types.ObjectId();
    return {
      workspaceId,
      siteId,
      title: `Trang ${slug}`,
      goal: null,
      draft: {
        slug,
        composition: { sections: [] },
        seo: {},
        revision: 0,
        updatedAt: now,
        updatedBy: userId,
      },
      publishedReleaseId: live ? new Types.ObjectId() : null,
      publishedSlug: live ? slug : null,
      releaseSeq: live ? 1 : 0,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };
  }

  it('finds a live page in its unique index, without reading the pages of the site', async () => {
    const siteId = new Types.ObjectId();
    const otherSiteId = new Types.ObjectId();
    await t.connection.collection('pages').insertMany([
      // Live pages, and drafts that were never published.
      ...Array.from({ length: 40 }, (_, index) =>
        storedPage(siteId, `trang-${index}`, index % 4 !== 0),
      ),
      // The same slug live on another site belongs to that site.
      storedPage(otherSiteId, 'chi-o-site-khac', true),
    ]);
    const pages = t.app.get(PagesRepository);

    const sent = await recordCalls(t.connection, 'pages', async () => {
      expect(await pages.findPublicLiveBySlug(siteId, 'trang-7')).toMatchObject({
        publishedSlug: 'trang-7',
      });
      // A draft that is not live, an unknown slug, and another site's live page.
      expect(await pages.findPublicLiveBySlug(siteId, 'trang-8')).toBeNull();
      expect(await pages.findPublicLiveBySlug(siteId, 'khong-co')).toBeNull();
      expect(await pages.findPublicLiveBySlug(siteId, 'chi-o-site-khac')).toBeNull();
      expect(await pages.findLiveBySlug(scope, siteId, 'trang-7')).toMatchObject({
        title: 'Trang trang-7',
      });
      expect(await pages.findLiveBySlug(scope, siteId, 'khong-co')).toBeNull();
    });

    // Each lookup explained exactly as it was sent.
    expect(sent.map((call) => call.method)).toEqual(Array.from({ length: 6 }, () => 'findOne'));
    for (const call of sent) {
      const explained = await explainFindOne(t.connection, call);
      expect(indexScans(explained.queryPlanner.winningPlan)).toEqual([PAGES_PUBLISHED_SLUG_INDEX]);
      expect(explained.executionStats.totalKeysExamined).toBeLessThanOrEqual(1);
      expect(explained.executionStats.totalDocsExamined).toBeLessThanOrEqual(1);
    }
  });
});
