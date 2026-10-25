import { problemSchema, privacySettingsSchema, type Site } from '@plp/contracts';
import type { Test } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { CONSENT_TEXTS, configurePrivacy, PRIVACY_SETTINGS } from '../../../test/privacy.js';
import { createSite } from '../../../test/resources.js';

/** ADR-003: another workspace's privacy settings and consent versions answer 404, never 403. */
describe('workspace isolation of privacy settings', () => {
  let t: TestApp;
  let ownerA: TestClient;
  let siteA: Site;
  let userB: TestClient;

  beforeAll(async () => {
    t = await createTestApp('plp_test_isolation_privacy');
    const a = await signedUpClient(t.app);
    ownerA = a.client;
    siteA = await createSite(ownerA, a.workspaceId);
    await configurePrivacy(ownerA, siteA.id);
    userB = (await signedUpClient(t.app)).client;
  });

  afterAll(async () => {
    await t.close();
  });

  async function expectNotFound(test: Test): Promise<void> {
    const response = await test.expect(404);
    expect(problemSchema.parse(response.body).code).toBe('not_found');
  }

  it('hides the settings and consent versions of site A from user B', async () => {
    await expectNotFound(userB.get(`/sites/${siteA.id}/privacy`));
    await expectNotFound(
      userB.put(`/sites/${siteA.id}/privacy`, {
        ...PRIVACY_SETTINGS,
        controllerName: 'Chen ngang',
      }),
    );
    await expectNotFound(userB.get(`/sites/${siteA.id}/consent-versions`));
    await expectNotFound(
      userB.post(`/sites/${siteA.id}/consent-versions`, { baseVersion: 1, ...CONSENT_TEXTS }),
    );
  });

  it('leaves site A untouched', async () => {
    const settings = privacySettingsSchema.parse(
      (await ownerA.get(`/sites/${siteA.id}/privacy`).expect(200)).body,
    );
    expect(settings.privacy?.controllerName).toBe(PRIVACY_SETTINGS.controllerName);
    expect(settings.currentConsent?.version).toBe(1);
  });
});
