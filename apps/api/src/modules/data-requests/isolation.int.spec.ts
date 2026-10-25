import {
  dataRequestDetailSchema,
  leadDetailSchema,
  problemSchema,
  type Site,
} from '@plp/contracts';
import type { Test } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { createLiveFormPage, insertLeads, storedLead } from '../../../test/leads.js';
import {
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { configurePrivacy } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import { createSite } from '../../../test/resources.js';

/** ADR-003: another workspace's data requests answer 404, never 403, and stay untouched. */
describe('workspace isolation of data requests', () => {
  let t: TestApp;
  let ownerA: TestClient;
  let siteA: Site;
  let requestId: string;
  let leadId: string;
  let ownerB: TestClient;

  beforeAll(async () => {
    t = await createTestApp(
      'plp_test_isolation_data_requests',
      withRevalidationRecorder(new RecordingRevalidationClient()),
    );
    const a = await signedUpClient(t.app);
    ownerA = a.client;
    siteA = await createSite(ownerA, a.workspaceId);
    await configurePrivacy(ownerA, siteA.id);
    await addConfirmedRecipient(t, ownerA, siteA.id);
    const { pageId, published } = await createLiveFormPage(ownerA, siteA.id, uniqueSlug('tu-van'));
    const lead = storedLead({
      workspaceId: a.workspaceId,
      siteId: siteA.id,
      pageId,
      releaseId: published.release.id,
      name: 'Lê Mai Anh',
      phone: '+84987106223',
    });
    await insertLeads(t, [lead]);
    leadId = String(lead['_id']);
    const created = await ownerA
      .post(`/sites/${siteA.id}/data-requests`, {
        name: 'Lê Mai Anh',
        phone: '0987 106 223',
        email: '',
        type: 'delete',
        receivedAt: new Date().toISOString(),
      })
      .expect(201);
    requestId = dataRequestDetailSchema.parse(created.body).id;
    ownerB = (await signedUpClient(t.app)).client;
  });

  afterAll(async () => {
    await t.close();
  });

  async function expectNotFound(test: Test): Promise<void> {
    const response = await test.expect(404);
    expect(problemSchema.parse(response.body).code).toBe('not_found');
  }

  it('hides the requests of site A from the owner of workspace B', async () => {
    await expectNotFound(ownerB.get(`/sites/${siteA.id}/data-requests`));
    await expectNotFound(
      ownerB.post(`/sites/${siteA.id}/data-requests`, {
        name: 'Chen Ngang',
        phone: '0987 106 223',
        email: '',
        type: 'access',
        receivedAt: new Date().toISOString(),
      }),
    );
  });

  it('refuses to read or handle a request of site A', async () => {
    await expectNotFound(ownerB.get(`/data-requests/${requestId}`));
    await expectNotFound(ownerB.post(`/data-requests/${requestId}/respond`));
    await expectNotFound(ownerB.post(`/data-requests/${requestId}/export`, { format: 'json' }));
    await expectNotFound(ownerB.post(`/data-requests/${requestId}/complete`));
  });

  it('refuses to correct a lead of site A', async () => {
    await expectNotFound(
      ownerB.patch(`/leads/${leadId}/contact`, {
        name: 'Chen Ngang',
        phone: '0909 000 111',
        email: '',
      }),
    );
  });

  it('leaves the request and the lead of site A untouched', async () => {
    const request = dataRequestDetailSchema.parse(
      (await ownerA.get(`/data-requests/${requestId}`).expect(200)).body,
    );
    expect(request).toMatchObject({ status: 'open', leads: { count: 1, capped: false } });
    const lead = leadDetailSchema.parse((await ownerA.get(`/leads/${leadId}`).expect(200)).body);
    expect(lead).toMatchObject({ name: 'Lê Mai Anh', phone: '+84987106223' });
  });
});
