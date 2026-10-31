import { type DataRequestDetail, dataRequestDetailSchema } from '@plp/contracts';
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

/**
 * The log of a data request keeps its newest 50 entries (ADR-017), through every step that writes
 * to it: exports (`$push` with `$slice`), the answer, and the completion (an update pipeline).
 */
describe('the 50-entry log of a data request', () => {
  let t: TestApp;
  let owner: TestClient;
  let workspaceId: string;

  beforeAll(async () => {
    t = await createTestApp('plp_test_data_request_log', {
      ...withRevalidationRecorder(new RecordingRevalidationClient()),
    });
    const signedUp = await signedUpClient(t.app);
    owner = signedUp.client;
    workspaceId = signedUp.workspaceId;
  });

  afterAll(async () => {
    await t.close();
  });

  async function detail(requestId: string): Promise<DataRequestDetail> {
    const response = await owner.get(`/data-requests/${requestId}`).expect(200);
    return dataRequestDetailSchema.parse(response.body);
  }

  it('drops the oldest entries past 50, the record of its creation first', async () => {
    const site = await createSite(owner, workspaceId);
    await configurePrivacy(owner, site.id);
    await addConfirmedRecipient(t, owner, site.id);
    const { pageId, published } = await createLiveFormPage(owner, site.id, uniqueSlug('nhat-ky'));
    const ids = { workspaceId, siteId: site.id, pageId, releaseId: published.release.id };
    await insertLeads(t, [
      storedLead({ ...ids, name: 'Lê Mai Anh', phone: '+84987106223' }),
      storedLead({ ...ids, name: 'Lê Mai Anh', phone: '+84987106223' }),
    ]);
    const created = await owner
      .post(`/sites/${site.id}/data-requests`, {
        name: 'Lê Mai Anh',
        phone: '0987 106 223',
        email: '',
        type: 'access',
        receivedAt: new Date(Date.now() - 3_600_000).toISOString(),
      })
      .expect(201);
    const requestId = dataRequestDetailSchema.parse(created.body).id;

    for (let index = 0; index < 49; index += 1) {
      await owner
        .post(`/data-requests/${requestId}/export`, { format: index % 2 === 0 ? 'json' : 'csv' })
        .expect(200);
    }
    const full = await detail(requestId);
    expect(full.log).toHaveLength(50);
    expect(full.log[0]).toMatchObject({ action: 'created', count: null });
    expect(
      full.log.slice(1).every((entry) => entry.action === 'exported' && entry.count === 2),
    ).toBe(true);

    // The 51st entry pushes out the first: the record of the creation.
    await owner.post(`/data-requests/${requestId}/export`, { format: 'json' }).expect(200);
    const pushed = await detail(requestId);
    expect(pushed.log).toHaveLength(50);
    expect(pushed.log.map((entry) => entry.action)).toEqual(Array(50).fill('exported'));
    expect(pushed.log[0]?.at).toBe(full.log[1]?.at);

    await owner.post(`/data-requests/${requestId}/respond`).expect(200);
    const responded = await detail(requestId);
    expect(responded.log).toHaveLength(50);
    expect(responded.log.at(-1)).toMatchObject({ action: 'responded', count: null });
    expect(responded.respondedAt).not.toBeNull();

    await owner.post(`/data-requests/${requestId}/complete`).expect(200);
    const completed = await detail(requestId);
    expect(completed.log).toHaveLength(50);
    expect(completed.log.slice(-2).map((entry) => entry.action)).toEqual([
      'responded',
      'completed',
    ]);
    expect(completed.log.slice(0, 48).every((entry) => entry.action === 'exported')).toBe(true);
    // Oldest first, as "Xem nhật ký" shows it.
    const times = completed.log.map((entry) => Date.parse(entry.at));
    expect(times).toEqual([...times].sort((x, y) => x - y));
    // Created, responded and completed stay on the request itself.
    expect(completed).toMatchObject({ status: 'completed', createdAt: full.createdAt });
  });
});
