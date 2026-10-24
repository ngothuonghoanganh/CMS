import { randomUUID } from 'node:crypto';
import {
  type Asset,
  pointerMoveResponseSchema,
  problemSchema,
  type PublishResponse,
  type Site,
} from '@plp/contracts';
import { Types } from 'mongoose';
import type { Test } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  publish,
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { createSite, uploadImage } from '../../../test/resources.js';

/** ADR-003: another workspace's pages, releases, activity and previews answer 404, never 403. */
describe('workspace isolation of pages, publishing and previews', () => {
  let t: TestApp;
  let ownerA: TestClient;
  let siteA: Site;
  let assetA: Asset;
  let pageA: string;
  let v1: PublishResponse;
  let v2: PublishResponse;
  let rollbackId: string;
  let userB: TestClient;
  let workspaceB: string;
  const revalidation = new RecordingRevalidationClient();

  beforeAll(async () => {
    t = await createTestApp('plp_test_isolation_pages', withRevalidationRecorder(revalidation));
    const a = await signedUpClient(t.app);
    ownerA = a.client;
    siteA = await createSite(ownerA, a.workspaceId);
    assetA = await uploadImage(ownerA, siteA.id);
    const live = await createLivePage(ownerA, siteA.id, uniqueSlug('a'), 'Bản 1');
    pageA = live.pageId;
    v1 = live.published;
    await editHeroHeading(ownerA, pageA, 'Bản 2');
    v2 = await publish(ownerA, pageA);
    const rollback = await ownerA
      .post(`/pages/${pageA}/pointer`, {
        targetReleaseId: v1.release.id,
        expectedCurrentReleaseId: v2.release.id,
        reason: 'Sai giá',
      })
      .expect(200);
    rollbackId = pointerMoveResponseSchema.parse(rollback.body).activityId;
    const b = await signedUpClient(t.app);
    userB = b.client;
    workspaceB = b.workspaceId;
  });

  afterAll(async () => {
    await t.close();
  });

  async function expectNotFound(test: Test): Promise<void> {
    const response = await test.expect(404);
    expect(problemSchema.parse(response.body).code).toBe('not_found');
  }

  it('hides the pages and drafts of workspace A from user B', async () => {
    const draft = { baseRevision: 0, ...publishableDraft(uniqueSlug('chen')) };
    await expectNotFound(userB.get(`/sites/${siteA.id}/pages`));
    await expectNotFound(
      userB.post(`/sites/${siteA.id}/pages`, {
        title: 'Chen',
        slug: 'chen',
        start: { kind: 'blank' },
      }),
    );
    await expectNotFound(userB.get(`/sites/${siteA.id}/slug-availability?slug=chen`));
    await expectNotFound(userB.get(`/pages/${pageA}`));
    await expectNotFound(userB.put(`/pages/${pageA}/draft`, draft));
    await expectNotFound(
      userB.post(`/pages/${pageA}/draft/restore`, { baseRevision: 0, releaseId: v1.release.id }),
    );
  });

  it('hides publishing of workspace A from user B', async () => {
    await expectNotFound(userB.get(`/pages/${pageA}/checks`));
    await expectNotFound(
      userB.agent
        .post(`/pages/${pageA}/releases`)
        .set('Origin', 'http://localhost:3100')
        .set('idempotency-key', randomUUID())
        .send({
          expectedRevision: 0,
          expectedPublishedReleaseId: null,
          acknowledgedWarnings: [],
          note: '',
        }),
    );
    await expectNotFound(userB.get(`/pages/${pageA}/history`));
    await expectNotFound(
      userB.post(`/pages/${pageA}/pointer`, {
        targetReleaseId: null,
        expectedCurrentReleaseId: v1.release.id,
        reason: 'Gỡ trộm',
      }),
    );
    await expectNotFound(userB.post(`/activity/${rollbackId}/undo`));
  });

  it('hides preview links of workspace A from user B', async () => {
    await expectNotFound(userB.post(`/pages/${pageA}/preview-links`, { kind: 'draft' }));
    await expectNotFound(
      userB.post(`/pages/${pageA}/preview-links`, { kind: 'release', releaseId: v1.release.id }),
    );
  });

  it('does not let user B use a page or release of workspace A from their own page', async () => {
    const siteB = await createSite(userB, workspaceB);
    const pageB = await createPage(userB, siteB.id);
    await expectNotFound(
      userB.post(`/pages/${pageB.page.id}/draft/restore`, {
        baseRevision: 0,
        releaseId: v1.release.id,
      }),
    );
    await expectNotFound(
      userB.post(`/pages/${pageB.page.id}/preview-links`, {
        kind: 'release',
        releaseId: v1.release.id,
      }),
    );
    const response = await userB
      .put(`/pages/${pageB.page.id}/draft`, {
        baseRevision: 0,
        slug: pageB.page.slug,
        composition: composition([
          heroSection({ image: { assetId: assetA.id, alt: 'Ảnh của A', decorative: false } }),
        ]),
        seo: cleanSeo(),
      })
      .expect(422);
    expect(problemSchema.parse(response.body).issues?.[0]?.path).toEqual([
      'composition',
      'sections',
      0,
      'content',
      'image',
    ]);
  });

  it('leaves workspace A untouched', async () => {
    const detail = await getPage(ownerA, pageA);
    expect(detail.page.liveRelease?.id).toBe(v1.release.id);
    expect(detail.page.latestVersion).toBe(2);
    const releases = await t.connection
      .collection('releases')
      .countDocuments({ pageId: new Types.ObjectId(pageA) });
    expect(releases).toBe(2);
    const undo = await ownerA.post(`/activity/${rollbackId}/undo`).expect(200);
    expect(pointerMoveResponseSchema.parse(undo.body).page.liveRelease?.id).toBe(v2.release.id);
  });
});
