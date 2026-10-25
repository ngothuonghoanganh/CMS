import { leadDetailSchema, leadListResponseSchema, problemSchema, type Site } from '@plp/contracts';
import { Types } from 'mongoose';
import type { Test } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { createLiveFormPage, leadBody, submitLead } from '../../../test/leads.js';
import {
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { configurePrivacy } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import { createSite } from '../../../test/resources.js';

/** ADR-003: another workspace's leads answer 404, never 403, and stay untouched. */
describe('workspace isolation of leads', () => {
  let t: TestApp;
  let ownerA: TestClient;
  let siteA: Site;
  let leadId: string;
  let pageIdA: string;
  let ownerB: TestClient;
  let siteB: Site;

  beforeAll(async () => {
    t = await createTestApp(
      'plp_test_isolation_leads',
      withRevalidationRecorder(new RecordingRevalidationClient()),
    );
    const a = await signedUpClient(t.app);
    ownerA = a.client;
    siteA = await createSite(ownerA, a.workspaceId);
    await configurePrivacy(ownerA, siteA.id);
    await addConfirmedRecipient(t, ownerA, siteA.id);
    const { pageId, published } = await createLiveFormPage(ownerA, siteA.id, uniqueSlug('tu-van'));
    pageIdA = pageId;
    await submitLead(t, siteA.subdomain, leadBody(published.release.id)).expect(201);
    const list = leadListResponseSchema.parse(
      (await ownerA.get(`/sites/${siteA.id}/leads`).expect(200)).body,
    );
    const lead = list.items[0];
    if (!lead) {
      throw new Error('The lead of site A was not stored');
    }
    leadId = lead.id;
    const b = await signedUpClient(t.app);
    ownerB = b.client;
    siteB = await createSite(ownerB, b.workspaceId);
  });

  afterAll(async () => {
    await t.close();
  });

  async function expectNotFound(test: Test): Promise<void> {
    const response = await test.expect(404);
    expect(problemSchema.parse(response.body).code).toBe('not_found');
  }

  it('hides the inbox, counts, pages and exports of site A from the owner of workspace B', async () => {
    await expectNotFound(ownerB.get(`/sites/${siteA.id}/leads`));
    await expectNotFound(ownerB.post(`/sites/${siteA.id}/leads/search`, { q: '0901' }));
    await expectNotFound(ownerB.get(`/sites/${siteA.id}/lead-counts`));
    await expectNotFound(ownerB.get(`/sites/${siteA.id}/page-refs`));
    await expectNotFound(ownerB.post(`/sites/${siteA.id}/leads/export`, {}));
  });

  it('hides a lead of site A, and refuses to change, export or delete it', async () => {
    await expectNotFound(ownerB.get(`/leads/${leadId}`));
    await expectNotFound(ownerB.patch(`/leads/${leadId}`, { status: 'won', note: 'chen ngang' }));
    await expectNotFound(ownerB.post(`/leads/${leadId}/person/export`, { format: 'json' }));
    await expectNotFound(ownerB.delete(`/leads/${leadId}/person`));
  });

  it('refuses to send the email of a lead of site A again for workspace B', async () => {
    await t.connection.collection('leads').updateOne(
      { _id: new Types.ObjectId(leadId) },
      {
        $set: {
          'notification.status': 'failed',
          'notification.attempts': 3,
          'notification.lastErrorCode': 'smtp_unavailable',
        },
      },
    );
    await expectNotFound(ownerB.post(`/leads/${leadId}/notification/retry`));
    const lead = leadDetailSchema.parse((await ownerA.get(`/leads/${leadId}`).expect(200)).body);
    expect(lead.notification).toMatchObject({ status: 'failed', attempts: 3 });
  });

  it('does not let a filter of site B reach the pages of site A', async () => {
    const list = leadListResponseSchema.parse(
      (await ownerB.get(`/sites/${siteB.id}/leads?range=all&pageId=${pageIdA}`).expect(200)).body,
    );
    expect(list.items).toEqual([]);
  });

  it('leaves the lead of site A untouched', async () => {
    const lead = leadDetailSchema.parse((await ownerA.get(`/leads/${leadId}`).expect(200)).body);
    expect(lead).toMatchObject({ status: 'new', note: '' });
  });
});
