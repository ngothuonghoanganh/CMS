import {
  activityListResponseSchema,
  type MeResponse,
  pointerMoveResponseSchema,
  problemSchema,
  resolveResponseSchema,
  type Site,
} from '@plp/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, TestClient } from '../../../test/client.js';
import { createLiveFormPage, leadBody, submitLead } from '../../../test/leads.js';
import {
  createLivePage,
  currentPublishBody,
  editHeroHeading,
  getPage,
  publish,
  publishRequest,
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { configurePrivacy, saveConsentVersion } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import { addEditor, createSite } from '../../../test/resources.js';

/**
 * An Editor publishes, rolls back, undoes and unpublishes pages the Owner made (ADR-004): the
 * live page follows, and the activity names who did what.
 */
describe('an editor on the owner’s pages', () => {
  let t: TestApp;
  let owner: TestClient;
  let ownerMe: MeResponse;
  let editor: TestClient;
  let editorMe: MeResponse;
  let workspaceId: string;
  let site: Site;
  const revalidation = new RecordingRevalidationClient();

  beforeAll(async () => {
    t = await createTestApp('plp_test_editor_role', withRevalidationRecorder(revalidation));
    const signedUp = await signedUpClient(t.app);
    owner = signedUp.client;
    ownerMe = signedUp.me;
    workspaceId = signedUp.workspaceId;
    const added = await addEditor(t, workspaceId);
    editor = added.client;
    editorMe = added.me;
    site = await createSite(owner, workspaceId);
  });

  afterAll(async () => {
    await t.close();
  });

  /** The release a visitor gets at `slug`; null for a 404. */
  async function liveRelease(slug: string): Promise<string | null> {
    const response = await new TestClient(t.app).get(
      `/public/sites/${site.subdomain}/resolve?path=${slug}`,
    );
    if (response.status === 404) {
      return null;
    }
    const resolved = resolveResponseSchema.parse(response.body);
    if (resolved.kind !== 'page') {
      throw new Error(`Expected a page at ${slug}, got a redirect`);
    }
    return resolved.data.releaseId;
  }

  async function moveAs(
    client: TestClient,
    pageId: string,
    targetReleaseId: string | null,
    reason: string,
  ) {
    const detail = await getPage(client, site.id, pageId);
    const response = await client
      .post(`/sites/${site.id}/pages/${pageId}/pointer`, {
        targetReleaseId,
        expectedCurrentReleaseId: detail.page.liveRelease?.id ?? null,
        reason,
      })
      .expect(200);
    return pointerMoveResponseSchema.parse(response.body);
  }

  async function pointerActivity(pageId: string) {
    const response = await owner
      .get(
        `/sites/${site.id}/activity?types=page.published,page.rolled_back,page.rollback_undone,page.unpublished`,
      )
      .expect(200);
    return activityListResponseSchema
      .parse(response.body)
      .items.filter((item) => item.page?.id === pageId)
      .map((item) => ({ type: item.type, by: item.actor.id, reason: item.reason }))
      .reverse();
  }

  it('publishes, rolls back, undoes and unpublishes a page the owner made', async () => {
    const slug = uniqueSlug('chu-tao');
    const { pageId, published: v1 } = await createLivePage(owner, site.id, slug, 'Bản của Owner');

    await editHeroHeading(editor, site.id, pageId, 'Bản của Editor');
    const v2 = await publish(editor, site.id, pageId, 'Editor publish');
    expect(v2.release).toMatchObject({ version: 2, createdBy: { id: editorMe.user.id } });
    expect(await liveRelease(slug)).toBe(v2.release.id);

    const rollback = await moveAs(editor, pageId, v1.release.id, 'Bản 2 sai giá');
    expect(rollback.page.liveRelease?.id).toBe(v1.release.id);
    expect(await liveRelease(slug)).toBe(v1.release.id);

    const undone = pointerMoveResponseSchema.parse(
      (await editor.post(`/sites/${site.id}/activity/${rollback.activityId}/undo`).expect(200))
        .body,
    );
    expect(undone.page.liveRelease?.id).toBe(v2.release.id);
    expect(await liveRelease(slug)).toBe(v2.release.id);

    // A rollback the owner made, the editor undoes.
    const ownerRollback = await moveAs(owner, pageId, v1.release.id, 'Owner thử lại bản 1');
    await editor.post(`/sites/${site.id}/activity/${ownerRollback.activityId}/undo`).expect(200);
    expect(await liveRelease(slug)).toBe(v2.release.id);

    await moveAs(editor, pageId, null, 'Hết chương trình');
    expect(await liveRelease(slug)).toBeNull();
    expect((await getPage(owner, site.id, pageId)).page.status.kind).toBe('unpublished');

    expect(await pointerActivity(pageId)).toEqual([
      { type: 'page.published', by: ownerMe.user.id, reason: null },
      { type: 'page.published', by: editorMe.user.id, reason: null },
      { type: 'page.rolled_back', by: editorMe.user.id, reason: 'Bản 2 sai giá' },
      {
        type: 'page.rollback_undone',
        by: editorMe.user.id,
        reason: 'Hoàn tác khôi phục: Bản 2 sai giá',
      },
      { type: 'page.rolled_back', by: ownerMe.user.id, reason: 'Owner thử lại bản 1' },
      {
        type: 'page.rollback_undone',
        by: editorMe.user.id,
        reason: 'Hoàn tác khôi phục: Owner thử lại bản 1',
      },
      { type: 'page.unpublished', by: editorMe.user.id, reason: 'Hết chương trình' },
    ]);
    expect(revalidation.calls.filter((subdomain) => subdomain === site.subdomain)).toHaveLength(7);
  });

  it('publishes a page with a form once the owner set consent and a recipient, the snapshot the owner’s', async () => {
    const formSite = await createSite(owner, workspaceId);
    const slug = uniqueSlug('dang-ky');
    // The editor cannot set what a form needs; the owner does.
    await editor
      .put(`/sites/${formSite.id}/privacy`, {
        controllerName: 'X',
        requestEmail: '',
        policyUrl: 'https://x.vn',
        retentionMonths: 12,
      })
      .expect(403);
    await configurePrivacy(owner, formSite.id);
    await addConfirmedRecipient(t, owner, formSite.id);
    const { pageId, published } = await createLiveFormPage(editor, formSite.id, slug);
    expect(published.release.createdBy.id).toBe(editorMe.user.id);
    await submitLead(t, formSite.subdomain, leadBody(published.release.id)).expect(201);

    // The owner changes the consent text: the editor's next publish must acknowledge it.
    await saveConsentVersion(owner, formSite.id, 1, {
      requiredText: 'Tôi đồng ý cho {Tên doanh nghiệp} liên hệ.',
    });
    await editHeroHeading(editor, formSite.id, pageId, 'Ưu đãi mới');
    const detail = await getPage(editor, formSite.id, pageId);
    expect(detail.page.siteChanges.map((change) => change.label)).toEqual([
      'Dữ liệu cá nhân: nội dung đồng ý',
    ]);
    const stale = await publishRequest(editor, formSite.id, pageId, {
      ...(await currentPublishBody(editor, formSite.id, pageId)),
      acknowledgedSiteChanges: [],
    }).expect(409);
    expect(problemSchema.parse(stale.body).code).toBe('site_changed');
    const v2 = await publish(editor, formSite.id, pageId);
    expect(v2.release.version).toBe(2);
  });
});
