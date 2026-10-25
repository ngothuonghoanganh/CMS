import {
  checksResultSchema,
  type PageSummary,
  previewLinkResponseSchema,
  problemSchema,
  type PublicPageData,
  publicPreviewResponseSchema,
  publishResponseSchema,
  resolveResponseSchema,
  type Site,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, TestClient } from '../../../test/client.js';
import { formDraft } from '../../../test/compositions.js';
import { createLiveFormPage } from '../../../test/leads.js';
import {
  createLivePage,
  currentPublishBody,
  createPage,
  getPage,
  listPages,
  publish,
  publishRequest,
  replaceDraft,
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import {
  configurePrivacy,
  PRIVACY_SETTINGS,
  saveConsentVersion,
  savePrivacy,
} from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import { createSite } from '../../../test/resources.js';
import type { LeadCapture } from './domain/lead-capture.js';

/**
 * ADR-017: a release with a form snapshots the site's consent settings; a live page reminds about
 * settings that differ from its snapshot, and publish refuses settings the publisher did not see.
 * Some tests give a release a snapshot with a raw write, to vary it independently of the form.
 */
describe('consent settings snapshotted into releases', () => {
  let t: TestApp;
  let client: TestClient;
  let visitor: TestClient;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp(
      'plp_test_lead_capture',
      withRevalidationRecorder(new RecordingRevalidationClient()),
    );
    const owner = await signedUpClient(t.app);
    client = owner.client;
    workspaceId = owner.workspaceId;
    // The renderer has no session cookie.
    visitor = new TestClient(t.app);
  });

  afterAll(async () => {
    await t.close();
  });

  function storedRelease(releaseId: string) {
    return t.connection.collection('releases').findOne({ _id: new Types.ObjectId(releaseId) });
  }

  async function listed(siteId: string, pageId: string): Promise<PageSummary> {
    const summary = (await listPages(client, siteId)).items.find((item) => item.id === pageId);
    if (!summary) {
      throw new Error(`Page ${pageId} is not listed`);
    }
    return summary;
  }

  /** A live page whose release has a form showing the site's current consent settings. */
  async function liveFormPage(): Promise<{ site: Site; pageId: string; releaseId: string }> {
    const site = await createSite(client, workspaceId);
    const { consent } = await configurePrivacy(client, site.id);
    const { pageId, published } = await createLivePage(client, site.id, uniqueSlug('form'));
    const capture: LeadCapture = {
      consentVersionId: consent.id,
      consentVersion: consent.version,
      controllerName: PRIVACY_SETTINGS.controllerName,
      policyUrl: PRIVACY_SETTINGS.policyUrl,
      requiredText: consent.requiredText.replace(
        '{Tên doanh nghiệp}',
        PRIVACY_SETTINGS.controllerName,
      ),
      marketingText: consent.marketingText,
    };
    // Releases are immutable for the application; only a raw write can give one a snapshot.
    await t.connection
      .collection('releases')
      .updateOne(
        { _id: new Types.ObjectId(published.release.id) },
        { $set: { leadCapture: capture } },
      );
    return { site, pageId, releaseId: published.release.id };
  }

  it('stores no consent snapshot for a page without a form', async () => {
    const site = await createSite(client, workspaceId);
    await configurePrivacy(client, site.id);
    const { published } = await createLivePage(client, site.id, uniqueSlug('khong-form'));
    const stored = await storedRelease(published.release.id);
    expect(stored).toHaveProperty('leadCapture', null);
  });

  it('reminds about each consent setting that differs from the live snapshot', async () => {
    const { site, pageId } = await liveFormPage();
    expect((await listed(site.id, pageId)).siteChanges).toEqual([]);

    await saveConsentVersion(client, site.id, 1, { requiredText: 'Tôi đồng ý được gọi lại.' });
    await savePrivacy(client, site.id, {
      controllerName: 'Smile Care',
      policyUrl: 'https://smilecare.vn/bao-mat',
    });
    await client.patch(`/sites/${site.id}`, { themePresetId: 'sunset' }).expect(200);

    const summary = await listed(site.id, pageId);
    expect(summary.siteChanges).toEqual([
      { kind: 'site', label: 'Giao diện site: giao diện', sectionId: null },
      { kind: 'privacy', label: 'Dữ liệu cá nhân: nội dung đồng ý', sectionId: null },
      { kind: 'privacy', label: 'Dữ liệu cá nhân: tên doanh nghiệp', sectionId: null },
      { kind: 'privacy', label: 'Dữ liệu cá nhân: chính sách', sectionId: null },
    ]);
    // Reminders only: the status still compares revisions (rule 2).
    expect(summary.status.kind).toBe('live');
  });

  it('ignores changes to settings the live page does not show, like the retention period', async () => {
    const { site, pageId } = await liveFormPage();
    await savePrivacy(client, site.id, { retentionMonths: 24, requestEmail: '' });
    expect((await listed(site.id, pageId)).siteChanges).toEqual([]);
  });

  it('refuses to publish consent settings the publisher did not see', async () => {
    const { site, pageId, releaseId } = await liveFormPage();
    const seen = await currentPublishBody(client, pageId);
    expect(seen.acknowledgedSiteChanges).toEqual([]);

    await saveConsentVersion(client, site.id, 1, { marketingText: null });
    const response = await publishRequest(client, pageId, seen).expect(409);
    expect(problemSchema.parse(response.body).code).toBe('site_changed');
    expect((await getPage(client, pageId)).page.liveRelease?.id).toBe(releaseId);

    const reviewed = await currentPublishBody(client, pageId);
    expect(reviewed.acknowledgedSiteChanges).toEqual(['Dữ liệu cá nhân: nội dung đồng ý']);
    const published = publishResponseSchema.parse(
      (await publishRequest(client, pageId, reviewed).expect(201)).body,
    );
    // The draft has no form: the new release snapshots nothing and lists no consent chip.
    expect(await storedRelease(published.release.id)).toHaveProperty('leadCapture', null);
    expect(published.release.changeSummary).toEqual([]);
    expect((await listed(site.id, pageId)).siteChanges).toEqual([]);
  });

  async function resolvePage(site: Site, slug: string): Promise<PublicPageData> {
    const response = await visitor
      .get(`/public/sites/${site.subdomain}/resolve?path=${encodeURIComponent(slug)}`)
      .expect(200);
    const resolved = resolveResponseSchema.parse(response.body);
    if (resolved.kind !== 'page') {
      throw new Error(`Expected a page at "${slug}", got a redirect`);
    }
    return resolved.data;
  }

  async function preview(pageId: string, body: object): Promise<PublicPageData> {
    const link = previewLinkResponseSchema.parse(
      (await client.post(`/pages/${pageId}/preview-links`, body).expect(201)).body,
    );
    const token = link.url.split('/_preview/')[1];
    if (token === undefined) {
      throw new Error(`No token in ${link.url}`);
    }
    const response = await visitor.get(`/public/preview/${token}`).expect(200);
    return publicPreviewResponseSchema.parse(response.body).data;
  }

  const FILLED_TEXT = `Tôi đồng ý để ${PRIVACY_SETTINGS.controllerName} xử lý họ tên và số điện thoại của tôi nhằm liên hệ tư vấn dịch vụ.`;

  it('blocks a form until the site has consent settings, pointing at them', async () => {
    const site = await createSite(client, workspaceId);
    await addConfirmedRecipient(t, client, site.id);
    const slug = uniqueSlug('chua-dong-y');
    const page = await createPage(client, site.id, { slug });
    const draft = formDraft(slug);
    await replaceDraft(client, page.page.id, draft);
    const formId = draft.composition.sections[1]?.id;

    const blocked = await publishRequest(
      client,
      page.page.id,
      await currentPublishBody(client, page.page.id),
    ).expect(422);
    const checks = checksResultSchema.parse(problemSchema.parse(blocked.body).context?.['checks']);
    expect(checks.blocking).toEqual([
      expect.objectContaining({
        code: 'consent_not_configured',
        target: { kind: 'privacy', sectionId: formId },
      }),
    ]);

    await configurePrivacy(client, site.id);
    const published = await publish(client, page.page.id);
    expect(await storedRelease(published.release.id)).toMatchObject({
      leadCapture: {
        consentVersion: 1,
        controllerName: PRIVACY_SETTINGS.controllerName,
        policyUrl: PRIVACY_SETTINGS.policyUrl,
        requiredText: FILLED_TEXT,
        marketingText: 'Nhận thông tin ưu đãi qua Zalo hoặc SMS (không bắt buộc)',
      },
    });
    expect(
      (await getPage(client, page.page.id)).checks.passed.map((passed) => passed.code),
    ).toContain('privacy_policy');
  });

  it('serves the snapshot on the live page and in a release preview, the settings in a draft preview', async () => {
    const site = await createSite(client, workspaceId);
    await configurePrivacy(client, site.id);
    await addConfirmedRecipient(t, client, site.id);
    const slug = uniqueSlug('form-live');
    const { pageId, published } = await createLiveFormPage(client, site.id, slug);
    const snapshot = {
      requiredText: FILLED_TEXT,
      marketingText: 'Nhận thông tin ưu đãi qua Zalo hoặc SMS (không bắt buộc)',
      policyUrl: PRIVACY_SETTINGS.policyUrl,
    };
    const live = await resolvePage(site, slug);
    expect(live.releaseId).toBe(published.release.id);
    expect(live.leadCapture).toEqual(snapshot);

    await saveConsentVersion(client, site.id, 1, {
      requiredText: 'Tôi đồng ý để {Tên doanh nghiệp} gọi lại.',
      marketingText: null,
    });
    await savePrivacy(client, site.id, { controllerName: 'Smile Care' });
    // Saving is not publishing: the live page keeps its snapshot (rule 1).
    expect((await resolvePage(site, slug)).leadCapture).toEqual(snapshot);
    expect(
      (await preview(pageId, { kind: 'release', releaseId: published.release.id })).leadCapture,
    ).toEqual(snapshot);
    const draftPreview = await preview(pageId, { kind: 'draft' });
    expect(draftPreview.releaseId).toBeNull();
    expect(draftPreview.leadCapture).toEqual({
      requiredText: 'Tôi đồng ý để Smile Care gọi lại.',
      marketingText: null,
      policyUrl: PRIVACY_SETTINGS.policyUrl,
    });
  });

  it('applies new consent settings on publish, and rollback brings the old text back', async () => {
    const site = await createSite(client, workspaceId);
    await configurePrivacy(client, site.id);
    await addConfirmedRecipient(t, client, site.id);
    const slug = uniqueSlug('form-v2');
    const { pageId, published: v1 } = await createLiveFormPage(client, site.id, slug);
    const seen = await currentPublishBody(client, pageId);

    await saveConsentVersion(client, site.id, 1, { requiredText: 'Bản 2: {Tên doanh nghiệp}.' });
    expect((await listed(site.id, pageId)).siteChanges.map((change) => change.label)).toEqual([
      'Dữ liệu cá nhân: nội dung đồng ý',
    ]);
    const refused = await publishRequest(client, pageId, seen).expect(409);
    expect(problemSchema.parse(refused.body).code).toBe('site_changed');

    const v2 = await publish(client, pageId);
    expect(v2.release.changeSummary).toEqual([
      { kind: 'privacy', label: 'Dữ liệu cá nhân: nội dung đồng ý', sectionId: null },
    ]);
    expect((await resolvePage(site, slug)).leadCapture?.requiredText).toBe(
      `Bản 2: ${PRIVACY_SETTINGS.controllerName}.`,
    );

    await client
      .post(`/pages/${pageId}/pointer`, {
        targetReleaseId: v1.release.id,
        expectedCurrentReleaseId: v2.release.id,
        reason: 'Dùng lại nội dung cũ',
      })
      .expect(200);
    expect((await resolvePage(site, slug)).leadCapture?.requiredText).toBe(FILLED_TEXT);
    // The live page now shows version 1 again: the current version 2 is a reminder.
    expect((await listed(site.id, pageId)).siteChanges.map((change) => change.label)).toEqual([
      'Dữ liệu cá nhân: nội dung đồng ý',
    ]);
  });
});
