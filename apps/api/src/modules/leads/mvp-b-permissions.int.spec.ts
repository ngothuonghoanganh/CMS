import { leadRecipientListResponseSchema, problemSchema, type Site } from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { createLiveFormPage, insertLeads, storedLead } from '../../../test/leads.js';
import {
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { CONSENT_TEXTS, configurePrivacy, PRIVACY_SETTINGS } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import { addEditor, createSite } from '../../../test/resources.js';

/** What one row of the matrix acts on: a site with a live form, leads, addresses and a request. */
interface Fixture {
  site: Site;
  leadId: string;
  failedLeadId: string;
  pendingRecipientId: string;
  requestId: string;
}

interface Row {
  /** The action as board 10, 11 or 12 names it. */
  action: string;
  /** Who may do it (ADR-004, ADR-017, ADR-018, ADR-019). */
  editor: 'allowed' | 'owner_only';
  /** The status of a call that works. */
  status: number;
  call: (client: TestClient, fixture: Fixture) => ReturnType<TestClient['get']>;
}

const DAY_MS = 86_400_000;

/**
 * Every endpoint of MVP B, for an editor of the workspace: what they may do (the inbox: read,
 * triage, note, spam, "Gửi lại"; read the settings and the report) and what only the owner may do
 * (settings, consent versions, lead recipients, exports, a person's data, data requests). A
 * refused call changes nothing, and someone from another workspace finds nothing (404, ADR-003).
 */
const ROWS: Row[] = [
  {
    action: 'Xem hộp thư',
    editor: 'allowed',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/leads?range=all`),
  },
  {
    action: 'Tìm trong hộp thư',
    editor: 'allowed',
    status: 200,
    call: (client, { site }) =>
      client.post(`/sites/${site.id}/leads/search`, { q: '0987', range: 'all' }),
  },
  {
    action: 'Số lead mới, lead 7 ngày',
    editor: 'allowed',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/lead-counts`),
  },
  {
    action: 'Trang trong bộ lọc của hộp thư',
    editor: 'allowed',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/page-refs`),
  },
  {
    action: 'Xem chi tiết lead',
    editor: 'allowed',
    status: 200,
    call: (client, { leadId }) => client.get(`/leads/${leadId}`),
  },
  {
    action: 'Đổi trạng thái lead',
    editor: 'allowed',
    status: 200,
    call: (client, { leadId }) => client.patch(`/leads/${leadId}`, { status: 'contacted' }),
  },
  {
    action: 'Ghi chú nội bộ',
    editor: 'allowed',
    status: 200,
    call: (client, { leadId }) => client.patch(`/leads/${leadId}`, { note: 'Gọi lại sau 18h' }),
  },
  {
    action: 'Chuyển vào Nghi ngờ spam',
    editor: 'allowed',
    status: 200,
    call: (client, { leadId }) => client.patch(`/leads/${leadId}`, { spam: true }),
  },
  {
    action: 'Gửi lại email thông báo',
    editor: 'allowed',
    status: 200,
    call: (client, { failedLeadId }) => client.post(`/leads/${failedLeadId}/notification/retry`),
  },
  {
    action: 'Xem nơi nhận lead',
    editor: 'allowed',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/lead-recipients`),
  },
  {
    action: 'Xem cài đặt dữ liệu cá nhân',
    editor: 'allowed',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/privacy`),
  },
  {
    action: 'Xem các phiên bản đồng ý',
    editor: 'allowed',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/consent-versions`),
  },
  {
    action: 'Xem Hiệu quả',
    editor: 'allowed',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/analytics`),
  },
  {
    action: 'Xuất Excel / CSV',
    editor: 'owner_only',
    status: 200,
    call: (client, { site }) => client.post(`/sites/${site.id}/leads/export`, { range: 'all' }),
  },
  {
    action: 'Sửa thông tin liên hệ',
    editor: 'owner_only',
    status: 200,
    call: (client, { leadId }) =>
      client.patch(`/leads/${leadId}/contact`, {
        name: 'Lê Mai Anh',
        phone: '0987 106 224',
        email: '',
      }),
  },
  {
    action: 'Xuất dữ liệu người này',
    editor: 'owner_only',
    status: 200,
    call: (client, { leadId }) => client.post(`/leads/${leadId}/person/export`, { format: 'json' }),
  },
  {
    action: 'Xóa dữ liệu người này',
    editor: 'owner_only',
    status: 200,
    call: (client, { leadId }) => client.delete(`/leads/${leadId}/person`),
  },
  {
    action: 'Thêm nơi nhận lead',
    editor: 'owner_only',
    status: 201,
    call: (client, { site }) =>
      client.post(`/sites/${site.id}/lead-recipients`, {
        email: `moi-${site.subdomain}@smilecare.vn`,
      }),
  },
  {
    action: 'Gửi lại thư xác nhận',
    editor: 'owner_only',
    status: 200,
    call: (client, { site, pendingRecipientId }) =>
      client.post(`/sites/${site.id}/lead-recipients/${pendingRecipientId}/resend`),
  },
  {
    action: 'Bỏ nơi nhận lead',
    editor: 'owner_only',
    status: 204,
    call: (client, { site, pendingRecipientId }) =>
      client.delete(`/sites/${site.id}/lead-recipients/${pendingRecipientId}`),
  },
  {
    action: 'Sửa cài đặt dữ liệu cá nhân',
    editor: 'owner_only',
    status: 200,
    call: (client, { site }) =>
      client.put(`/sites/${site.id}/privacy`, { ...PRIVACY_SETTINGS, retentionMonths: 6 }),
  },
  {
    action: 'Lưu phiên bản đồng ý mới',
    editor: 'owner_only',
    status: 201,
    call: (client, { site }) =>
      client.post(`/sites/${site.id}/consent-versions`, { baseVersion: 1, ...CONSENT_TEXTS }),
  },
  {
    action: 'Xem yêu cầu về dữ liệu',
    editor: 'owner_only',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/data-requests`),
  },
  {
    action: 'Ghi nhận yêu cầu',
    editor: 'owner_only',
    status: 201,
    call: (client, { site }) =>
      client.post(`/sites/${site.id}/data-requests`, {
        name: 'Phạm Gia Huy',
        phone: '0912 448 019',
        email: '',
        type: 'delete',
        receivedAt: new Date(Date.now() - DAY_MS).toISOString(),
      }),
  },
  {
    action: 'Xem một yêu cầu',
    editor: 'owner_only',
    status: 200,
    call: (client, { requestId }) => client.get(`/data-requests/${requestId}`),
  },
  {
    action: 'Đã phản hồi người yêu cầu',
    editor: 'owner_only',
    status: 200,
    call: (client, { requestId }) => client.post(`/data-requests/${requestId}/respond`),
  },
  {
    action: 'Xuất dữ liệu cho yêu cầu',
    editor: 'owner_only',
    status: 200,
    call: (client, { requestId }) =>
      client.post(`/data-requests/${requestId}/export`, { format: 'csv' }),
  },
  {
    action: 'Hoàn tất yêu cầu',
    editor: 'owner_only',
    status: 200,
    call: (client, { requestId }) => client.post(`/data-requests/${requestId}/complete`),
  },
];

describe('MVP B permissions of an editor', () => {
  let t: TestApp;
  let stranger: TestClient;

  beforeAll(async () => {
    t = await createTestApp('plp_test_mvp_b_roles', {
      ...withRevalidationRecorder(new RecordingRevalidationClient()),
    });
    stranger = (await signedUpClient(t.app)).client;
  });

  afterAll(async () => {
    await t.close();
  });

  /**
   * A workspace of its own for each row, with its owner and an editor: the daily caps on
   * confirmation emails (50 per workspace) would otherwise stop the later rows.
   */
  async function fixture(): Promise<Fixture & { owner: TestClient; editor: TestClient }> {
    const { client: owner, workspaceId } = await signedUpClient(t.app);
    const editor = (await addEditor(t, workspaceId)).client;
    const site = await createSite(owner, workspaceId);
    await configurePrivacy(owner, site.id);
    // Every address gets at most 30 links a day: addresses of their own for each row.
    await addConfirmedRecipient(t, owner, site.id, `nhan-${site.subdomain}@smilecare.vn`);
    await owner
      .post(`/sites/${site.id}/lead-recipients`, { email: `cho-${site.subdomain}@smilecare.vn` })
      .expect(201);
    const recipients = leadRecipientListResponseSchema.parse(
      (await owner.get(`/sites/${site.id}/lead-recipients`).expect(200)).body,
    ).items;
    const pending = recipients.find((item) => item.status === 'pending');
    const { pageId, published } = await createLiveFormPage(owner, site.id, uniqueSlug('quyen'));
    const ids = { workspaceId, siteId: site.id, pageId, releaseId: published.release.id };
    const lead = storedLead({
      ...ids,
      name: 'Lê Mai Anh',
      phone: '+84987106223',
      email: 'mai.anh@gmail.com',
    });
    const failed = storedLead({
      ...ids,
      name: 'Gửi lỗi',
      phone: '+84912000111',
      notification: { status: 'failed', attempts: 3 },
    });
    await insertLeads(t, [lead, failed]);
    const request = await owner
      .post(`/sites/${site.id}/data-requests`, {
        name: 'Lê Mai Anh',
        phone: '0987 106 223',
        email: '',
        type: 'access',
        receivedAt: new Date(Date.now() - DAY_MS).toISOString(),
      })
      .expect(201);
    const idOf = (record: Record<string, unknown>): string => {
      const id = record['_id'];
      if (!(id instanceof Types.ObjectId)) {
        throw new Error('insertMany did not set an id');
      }
      return id.toHexString();
    };
    return {
      owner,
      editor,
      site,
      leadId: idOf(lead),
      failedLeadId: idOf(failed),
      pendingRecipientId: pending?.id ?? '',
      requestId: (request.body as { id: string }).id,
    };
  }

  /** Everything the endpoints of MVP B can change about the fixture's site. */
  async function stateOf({ site }: Fixture): Promise<string> {
    const siteId = new Types.ObjectId(site.id);
    const [siteRecord, leads, requests, versions, activity, limits] = await Promise.all([
      t.connection.collection('sites').findOne({ _id: siteId }),
      t.connection.collection('leads').find({ siteId }).sort({ _id: 1 }).toArray(),
      t.connection.collection('data_requests').find({ siteId }).sort({ _id: 1 }).toArray(),
      t.connection.collection('consent_versions').find({ siteId }).sort({ _id: 1 }).toArray(),
      t.connection.collection('activity').countDocuments({ siteId }),
      t.connection.collection('lead_limits').find().sort({ key: 1 }).toArray(),
    ]);
    return JSON.stringify({ siteRecord, leads, requests, versions, activity, limits });
  }

  it.each(ROWS)('$action: $editor', async (row) => {
    const { owner, editor, ...target } = await fixture();
    const before = await stateOf(target);

    const foreign = await row.call(stranger, target);
    expect(foreign.status).toBe(404);
    expect(await stateOf(target)).toBe(before);

    const asEditor = await row.call(editor, target);
    if (row.editor === 'allowed') {
      expect(asEditor.status).toBe(row.status);
      return;
    }
    expect(asEditor.status).toBe(403);
    expect(problemSchema.parse(asEditor.body)).toMatchObject({
      code: 'forbidden',
      title: 'Chỉ Owner của workspace được thực hiện thao tác này',
    });
    expect(await stateOf(target)).toBe(before);

    expect((await row.call(owner, target)).status).toBe(row.status);
  });
});
