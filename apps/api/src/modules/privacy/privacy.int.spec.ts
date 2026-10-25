import { getModelToken } from '@nestjs/mongoose';
import {
  activityListResponseSchema,
  consentVersionListResponseSchema,
  privacySettingsSchema,
  problemSchema,
  type Site,
} from '@plp/contracts';
import type { Model } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import {
  CONSENT_TEXTS,
  PRIVACY_SETTINGS,
  saveConsentVersion,
  savePrivacy,
} from '../../../test/privacy.js';
import { addEditor, createSite } from '../../../test/resources.js';
import { CONSENT_VERSION_MODEL, type ConsentVersionRecord } from './consent-version.schema.js';

/** ADR-017: personal data settings and immutable consent versions, read by members, owner-only. */
describe('privacy settings and consent versions', () => {
  let t: TestApp;
  let owner: TestClient;
  let editor: TestClient;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_privacy');
    const signedUp = await signedUpClient(t.app);
    owner = signedUp.client;
    workspaceId = signedUp.workspaceId;
    editor = (await addEditor(t, workspaceId)).client;
  });

  afterAll(async () => {
    await t.close();
  });

  async function activityTypes(site: Site): Promise<{ type: string; version: number | null }[]> {
    const response = await owner.get(`/sites/${site.id}/activity`).expect(200);
    return activityListResponseSchema
      .parse(response.body)
      .items.map((item) => ({ type: item.type, version: item.data.version }));
  }

  it('has no settings and no consent text on a new site', async () => {
    const site = await createSite(owner, workspaceId);
    const response = await owner.get(`/sites/${site.id}/privacy`).expect(200);
    expect(privacySettingsSchema.parse(response.body)).toEqual({
      privacy: null,
      currentConsent: null,
    });
  });

  it('saves the settings for the owner and records it', async () => {
    const site = await createSite(owner, workspaceId);
    const saved = await savePrivacy(owner, site.id, { requestEmail: ' DuLieu@SmileCare.vn ' });
    expect(saved.privacy).toMatchObject({
      controllerName: PRIVACY_SETTINGS.controllerName,
      requestEmail: 'dulieu@smilecare.vn',
      policyUrl: PRIVACY_SETTINGS.policyUrl,
      retentionMonths: 12,
    });

    const cleared = await savePrivacy(owner, site.id, { requestEmail: '', retentionMonths: null });
    expect(cleared.privacy).toMatchObject({ requestEmail: null, retentionMonths: null });
    const read = privacySettingsSchema.parse(
      (await owner.get(`/sites/${site.id}/privacy`).expect(200)).body,
    );
    expect(read).toEqual(cleared);
    expect(await activityTypes(site)).toEqual([
      { type: 'privacy.updated', version: null },
      { type: 'privacy.updated', version: null },
      { type: 'site.created', version: null },
    ]);
  });

  it('refuses a policy link that is not http(s)', async () => {
    const site = await createSite(owner, workspaceId);
    const response = await owner
      .put(`/sites/${site.id}/privacy`, { ...PRIVACY_SETTINGS, policyUrl: 'smilecare.vn' })
      .expect(422);
    const problem = problemSchema.parse(response.body);
    expect(problem.code).toBe('validation_failed');
    expect(problem.issues?.[0]?.path).toEqual(['policyUrl']);
  });

  it('lets editors read but not change the settings or the consent text', async () => {
    const site = await createSite(owner, workspaceId);
    await savePrivacy(owner, site.id);
    await saveConsentVersion(owner, site.id, 0);

    const read = privacySettingsSchema.parse(
      (await editor.get(`/sites/${site.id}/privacy`).expect(200)).body,
    );
    expect(read.currentConsent?.version).toBe(1);
    await editor.get(`/sites/${site.id}/consent-versions`).expect(200);
    for (const response of [
      await editor.put(`/sites/${site.id}/privacy`, PRIVACY_SETTINGS).expect(403),
      await editor
        .post(`/sites/${site.id}/consent-versions`, { baseVersion: 1, ...CONSENT_TEXTS })
        .expect(403),
    ]) {
      expect(problemSchema.parse(response.body).code).toBe('forbidden');
    }
  });

  it('saves each consent text as the next version and lists them newest first', async () => {
    const site = await createSite(owner, workspaceId);
    const v1 = await saveConsentVersion(owner, site.id, 0, { marketingText: null });
    const v2 = await saveConsentVersion(owner, site.id, 1, { requiredText: 'Tôi đồng ý.' });
    expect([v1.version, v2.version]).toEqual([1, 2]);
    expect(v1.marketingText).toBeNull();

    const current = privacySettingsSchema.parse(
      (await owner.get(`/sites/${site.id}/privacy`).expect(200)).body,
    );
    expect(current.currentConsent).toEqual(v2);

    const first = consentVersionListResponseSchema.parse(
      (await owner.get(`/sites/${site.id}/consent-versions?limit=1`).expect(200)).body,
    );
    expect(first.items).toEqual([v2]);
    expect(first.nextCursor).not.toBeNull();
    const second = consentVersionListResponseSchema.parse(
      (
        await owner
          .get(`/sites/${site.id}/consent-versions?limit=1&cursor=${first.nextCursor ?? ''}`)
          .expect(200)
      ).body,
    );
    expect(second).toEqual({ items: [v1], nextCursor: null });
    expect(await activityTypes(site)).toEqual([
      { type: 'consent.version_created', version: 2 },
      { type: 'consent.version_created', version: 1 },
      { type: 'site.created', version: null },
    ]);
  });

  it('answers 409 instead of replacing a version saved in the meantime', async () => {
    const site = await createSite(owner, workspaceId);
    await saveConsentVersion(owner, site.id, 0);
    await saveConsentVersion(owner, site.id, 1);

    const response = await owner
      .post(`/sites/${site.id}/consent-versions`, { baseVersion: 1, ...CONSENT_TEXTS })
      .expect(409);
    const problem = problemSchema.parse(response.body);
    expect(problem.code).toBe('conflict');
    expect(problem.context).toEqual({ currentVersion: 2 });
  });

  it('keeps one version when two saves race for the same number', async () => {
    const site = await createSite(owner, workspaceId);
    const body = { baseVersion: 0, ...CONSENT_TEXTS };
    const responses = await Promise.all([
      owner.post(`/sites/${site.id}/consent-versions`, body),
      owner.post(`/sites/${site.id}/consent-versions`, body),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const list = consentVersionListResponseSchema.parse(
      (await owner.get(`/sites/${site.id}/consent-versions`).expect(200)).body,
    );
    expect(list.items.map((version) => version.version)).toEqual([1]);
  });

  it('refuses any query that would change a stored version', async () => {
    const site = await createSite(owner, workspaceId);
    const v1 = await saveConsentVersion(owner, site.id, 0);
    const model = t.app.get<Model<ConsentVersionRecord>>(getModelToken(CONSENT_VERSION_MODEL));
    await expect(
      model.updateOne({ _id: v1.id }, { $set: { requiredText: 'Đã sửa' } }).exec(),
    ).rejects.toThrow('Consent versions are immutable (ADR-017)');
    await expect(model.deleteOne({ _id: v1.id }).exec()).rejects.toThrow('immutable');
  });
});
