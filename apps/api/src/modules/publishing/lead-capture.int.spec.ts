import { type PageSummary, problemSchema, publishResponseSchema, type Site } from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import {
  createLivePage,
  currentPublishBody,
  getPage,
  listPages,
  publishRequest,
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
import { createSite } from '../../../test/resources.js';
import type { LeadCapture } from './domain/lead-capture.js';

/**
 * ADR-017: a release with a form snapshots the site's consent settings; a live page reminds about
 * settings that differ from its snapshot, and publish refuses settings the publisher did not see.
 * No section collects leads before the form exists (B2), so a raw write recreates such a release.
 */
describe('consent settings snapshotted into releases', () => {
  let t: TestApp;
  let client: TestClient;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp(
      'plp_test_lead_capture',
      withRevalidationRecorder(new RecordingRevalidationClient()),
    );
    const owner = await signedUpClient(t.app);
    client = owner.client;
    workspaceId = owner.workspaceId;
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
});
