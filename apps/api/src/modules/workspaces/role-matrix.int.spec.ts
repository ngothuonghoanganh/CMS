import {
  leadRecipientListResponseSchema,
  meResponseSchema,
  type MeResponse,
  onlyHoldersMessage,
  type Permission,
  pointerMoveResponseSchema,
  problemSchema,
  type Role,
  roleCountsSchema,
  rolesWith,
  type Site,
  siteListResponseSchema,
} from '@plp/contracts';
import { Types } from 'mongoose';
import type { Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, type TestClient } from '../../../test/client.js';
import { createLiveFormPage, insertLeads, storedLead } from '../../../test/leads.js';
import {
  currentPublishBody,
  editHeroHeading,
  getPage,
  publish,
  publishRequest,
  RecordingRevalidationClient,
  uniqueSlug,
  withRevalidationRecorder,
} from '../../../test/pages.js';
import { CONSENT_TEXTS, configurePrivacy, PRIVACY_SETTINGS } from '../../../test/privacy.js';
import { addConfirmedRecipient } from '../../../test/recipients.js';
import {
  addMember,
  createSite,
  insertMembership,
  pngImage,
  uniqueSubdomain,
  uploadImage,
  uploadRequest,
} from '../../../test/resources.js';

/** What one row of the matrix acts on: a site with live pages, a form, leads and a request. */
interface Fixture {
  owner: TestClient;
  workspaceId: string;
  site: Site;
  /** A live form page: v1 live again after a rollback from v2, the draft that of v2. */
  pageId: string;
  v1ReleaseId: string;
  v2ReleaseId: string;
  rollbackActivityId: string;
  assetId: string;
  image: Buffer;
  leadId: string;
  failedLeadId: string;
  pendingRecipientId: string;
  requestId: string;
}

interface Row {
  /** The action as the boards name it. */
  action: string;
  /** The row of board 16 that allows it (ADR-020). */
  permission: Permission;
  /** `site`: the endpoint acts on one site; `workspace`: on the workspace itself. */
  scope: 'site' | 'workspace';
  /** The status of a call that works. */
  status: number;
  call: (client: TestClient, fixture: Fixture) => PromiseLike<Response>;
}

const DAY_MS = 86_400_000;

/**
 * Every endpoint behind a session, for each of the six roles: who may do it follows board 16,
 * a refused call changes nothing and names who may (403), and a member kept to other sites or
 * someone from another workspace finds nothing (404, ADR-003).
 */
const ROWS: Row[] = [
  // Sites and settings
  {
    action: 'Xem site',
    permission: 'pages.view',
    scope: 'site',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}`),
  },
  {
    action: 'Sửa cài đặt site',
    permission: 'sites.manage',
    scope: 'site',
    status: 200,
    call: (client, { site }) => client.patch(`/sites/${site.id}`, { name: 'Smile Care Q1' }),
  },
  {
    action: 'Tạo site',
    permission: 'sites.manage',
    scope: 'workspace',
    status: 201,
    call: (client, { workspaceId }) =>
      client.post(`/workspaces/${workspaceId}/sites`, {
        name: 'Bếp Nhà Mây',
        subdomain: uniqueSubdomain('bep'),
      }),
  },
  {
    action: 'Số thành viên theo vai trò',
    permission: 'members.manage',
    scope: 'workspace',
    status: 200,
    call: (client, { workspaceId }) => client.get(`/workspaces/${workspaceId}/role-counts`),
  },
  // Pages and drafts
  {
    action: 'Xem danh sách trang',
    permission: 'pages.view',
    scope: 'site',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/pages`),
  },
  {
    action: 'Trang trong bộ lọc của hộp thư',
    permission: 'pages.view',
    scope: 'site',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/page-refs`),
  },
  {
    action: 'Số trang',
    permission: 'pages.view',
    scope: 'site',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/page-count`),
  },
  {
    action: 'Kiểm tra slug',
    permission: 'pages.view',
    scope: 'site',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/slug-availability?slug=moi`),
  },
  {
    action: 'Tạo trang',
    permission: 'pages.edit',
    scope: 'site',
    status: 201,
    call: (client, { site }) =>
      client.post(`/sites/${site.id}/pages`, {
        title: 'Trang mới',
        slug: uniqueSlug('moi'),
        start: { kind: 'blank' },
      }),
  },
  {
    action: 'Xem trang và bản nháp',
    permission: 'pages.view',
    scope: 'site',
    status: 200,
    call: (client, { pageId }) => client.get(`/pages/${pageId}`),
  },
  {
    action: 'Lưu bản nháp',
    permission: 'pages.edit',
    scope: 'site',
    status: 200,
    call: async (client, { owner, pageId }) => {
      const { draft } = await getPage(owner, pageId);
      return client.put(`/pages/${pageId}/draft`, {
        baseRevision: draft.revision,
        slug: draft.slug,
        composition: draft.composition,
        seo: { ...draft.seo, title: 'Tiêu đề mới' },
      });
    },
  },
  {
    action: 'Sao chép bản cũ vào bản nháp',
    permission: 'pages.edit',
    scope: 'site',
    status: 200,
    call: async (client, { owner, pageId, v1ReleaseId }) => {
      const { draft } = await getPage(owner, pageId);
      return client.post(`/pages/${pageId}/draft/restore`, {
        baseRevision: draft.revision,
        releaseId: v1ReleaseId,
      });
    },
  },
  {
    action: 'Kiểm tra trước khi xuất bản',
    permission: 'pages.view',
    scope: 'site',
    status: 200,
    call: (client, { pageId }) => client.get(`/pages/${pageId}/checks`),
  },
  {
    action: 'Xem trước',
    permission: 'pages.view',
    scope: 'site',
    status: 201,
    call: (client, { pageId }) => client.post(`/pages/${pageId}/preview-links`, { kind: 'draft' }),
  },
  // Publishing
  {
    action: 'Xuất bản',
    permission: 'pages.publish',
    scope: 'site',
    status: 201,
    call: async (client, { owner, pageId }) =>
      publishRequest(client, pageId, await currentPublishBody(owner, pageId)),
  },
  {
    action: 'Lịch sử phiên bản',
    permission: 'pages.view',
    scope: 'site',
    status: 200,
    call: (client, { pageId }) => client.get(`/pages/${pageId}/history`),
  },
  {
    action: 'Khôi phục một phiên bản',
    permission: 'pages.manageLive',
    scope: 'site',
    status: 200,
    call: (client, { pageId, v1ReleaseId, v2ReleaseId }) =>
      client.post(`/pages/${pageId}/pointer`, {
        targetReleaseId: v2ReleaseId,
        expectedCurrentReleaseId: v1ReleaseId,
        reason: 'Bản 2 đã sửa giá',
      }),
  },
  {
    action: 'Gỡ trang khỏi live',
    permission: 'pages.manageLive',
    scope: 'site',
    status: 200,
    call: (client, { pageId, v1ReleaseId }) =>
      client.post(`/pages/${pageId}/pointer`, {
        targetReleaseId: null,
        expectedCurrentReleaseId: v1ReleaseId,
        reason: 'Hết chương trình',
      }),
  },
  {
    action: 'Hoàn tác khôi phục',
    permission: 'pages.manageLive',
    scope: 'site',
    status: 200,
    call: (client, { rollbackActivityId }) => client.post(`/activity/${rollbackActivityId}/undo`),
  },
  {
    action: 'Nhật ký hoạt động',
    permission: 'pages.view',
    scope: 'site',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/activity`),
  },
  // Assets
  {
    action: 'Thư viện ảnh',
    permission: 'pages.view',
    scope: 'site',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/assets`),
  },
  {
    action: 'Tải ảnh lên',
    permission: 'pages.edit',
    scope: 'site',
    status: 201,
    call: (client, { site, image }) => uploadRequest(client, site.id, image),
  },
  {
    action: 'Sửa mô tả ảnh',
    permission: 'pages.edit',
    scope: 'site',
    status: 200,
    call: (client, { assetId }) =>
      client.patch(`/assets/${assetId}`, { alt: 'Ghế nha khoa', decorative: false }),
  },
  // Leads (board 10)
  {
    action: 'Xem hộp thư',
    permission: 'leads.view',
    scope: 'site',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/leads?range=all`),
  },
  {
    action: 'Tìm trong hộp thư',
    permission: 'leads.view',
    scope: 'site',
    status: 200,
    call: (client, { site }) =>
      client.post(`/sites/${site.id}/leads/search`, { q: '0987', range: 'all' }),
  },
  {
    action: 'Số lead mới, lead 7 ngày',
    permission: 'leads.view',
    scope: 'site',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/lead-counts`),
  },
  {
    action: 'Xem chi tiết lead',
    permission: 'leads.view',
    scope: 'site',
    status: 200,
    call: (client, { leadId }) => client.get(`/leads/${leadId}`),
  },
  {
    action: 'Đổi trạng thái lead',
    permission: 'leads.handle',
    scope: 'site',
    status: 200,
    call: (client, { leadId }) => client.patch(`/leads/${leadId}`, { status: 'contacted' }),
  },
  {
    action: 'Ghi chú nội bộ',
    permission: 'leads.handle',
    scope: 'site',
    status: 200,
    call: (client, { leadId }) => client.patch(`/leads/${leadId}`, { note: 'Gọi lại sau 18h' }),
  },
  {
    action: 'Chuyển vào Nghi ngờ spam',
    permission: 'leads.handle',
    scope: 'site',
    status: 200,
    call: (client, { leadId }) => client.patch(`/leads/${leadId}`, { spam: true }),
  },
  {
    action: 'Gửi lại email thông báo',
    permission: 'leads.handle',
    scope: 'site',
    status: 200,
    call: (client, { failedLeadId }) => client.post(`/leads/${failedLeadId}/notification/retry`),
  },
  {
    action: 'Xem nơi nhận lead',
    permission: 'leads.view',
    scope: 'site',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/lead-recipients`),
  },
  {
    action: 'Xem Hiệu quả',
    permission: 'pages.view',
    scope: 'site',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/analytics`),
  },
  // Personal data (board 10, 12)
  {
    action: 'Xuất Excel / CSV',
    permission: 'leads.export',
    scope: 'site',
    status: 200,
    call: (client, { site }) => client.post(`/sites/${site.id}/leads/export`, { range: 'all' }),
  },
  {
    action: 'Sửa thông tin liên hệ',
    permission: 'personalData.manage',
    scope: 'site',
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
    permission: 'personalData.manage',
    scope: 'site',
    status: 200,
    call: (client, { leadId }) => client.post(`/leads/${leadId}/person/export`, { format: 'json' }),
  },
  {
    action: 'Xóa dữ liệu người này',
    permission: 'personalData.manage',
    scope: 'site',
    status: 200,
    call: (client, { leadId }) => client.delete(`/leads/${leadId}/person`),
  },
  {
    action: 'Thêm nơi nhận lead',
    permission: 'privacy.manage',
    scope: 'site',
    status: 201,
    call: (client, { site }) =>
      client.post(`/sites/${site.id}/lead-recipients`, {
        email: `moi-${site.subdomain}@smilecare.vn`,
      }),
  },
  {
    action: 'Gửi lại thư xác nhận',
    permission: 'privacy.manage',
    scope: 'site',
    status: 200,
    call: (client, { site, pendingRecipientId }) =>
      client.post(`/sites/${site.id}/lead-recipients/${pendingRecipientId}/resend`),
  },
  {
    action: 'Bỏ nơi nhận lead',
    permission: 'privacy.manage',
    scope: 'site',
    status: 204,
    call: (client, { site, pendingRecipientId }) =>
      client.delete(`/sites/${site.id}/lead-recipients/${pendingRecipientId}`),
  },
  {
    action: 'Xem cài đặt dữ liệu cá nhân',
    permission: 'pages.view',
    scope: 'site',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/privacy`),
  },
  {
    action: 'Xem các phiên bản đồng ý',
    permission: 'pages.view',
    scope: 'site',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/consent-versions`),
  },
  {
    action: 'Sửa cài đặt dữ liệu cá nhân',
    permission: 'privacy.manage',
    scope: 'site',
    status: 200,
    call: (client, { site }) =>
      client.put(`/sites/${site.id}/privacy`, { ...PRIVACY_SETTINGS, retentionMonths: 6 }),
  },
  {
    action: 'Lưu phiên bản đồng ý mới',
    permission: 'privacy.manage',
    scope: 'site',
    status: 201,
    call: (client, { site }) =>
      client.post(`/sites/${site.id}/consent-versions`, { baseVersion: 1, ...CONSENT_TEXTS }),
  },
  {
    action: 'Xem yêu cầu về dữ liệu',
    permission: 'personalData.manage',
    scope: 'site',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/data-requests`),
  },
  {
    action: 'Ghi nhận yêu cầu',
    permission: 'personalData.manage',
    scope: 'site',
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
    permission: 'personalData.manage',
    scope: 'site',
    status: 200,
    call: (client, { requestId }) => client.get(`/data-requests/${requestId}`),
  },
  {
    action: 'Đã phản hồi người yêu cầu',
    permission: 'personalData.manage',
    scope: 'site',
    status: 200,
    call: (client, { requestId }) => client.post(`/data-requests/${requestId}/respond`),
  },
  {
    action: 'Xuất dữ liệu cho yêu cầu',
    permission: 'personalData.manage',
    scope: 'site',
    status: 200,
    call: (client, { requestId }) =>
      client.post(`/data-requests/${requestId}/export`, { format: 'csv' }),
  },
  {
    action: 'Hoàn tất yêu cầu',
    permission: 'personalData.manage',
    scope: 'site',
    status: 200,
    call: (client, { requestId }) => client.post(`/data-requests/${requestId}/complete`),
  },
];

/** The roles a fixture's workspace gives to the shared members; its owner signs up with it. */
const MEMBER_ROLES = ['admin', 'editor', 'contributor', 'support', 'viewer'] as const;
type MemberRole = (typeof MEMBER_ROLES)[number];

describe('the six roles on every endpoint', () => {
  let t: TestApp;
  let stranger: TestClient;
  let members: Map<MemberRole, { client: TestClient; me: MeResponse }>;
  /** A Biên tập kept to another site of the fixture's workspace. */
  let elsewhere: { client: TestClient; me: MeResponse };

  beforeAll(async () => {
    t = await createTestApp('plp_test_role_matrix', {
      ...withRevalidationRecorder(new RecordingRevalidationClient()),
    });
    stranger = (await signedUpClient(t.app)).client;
    members = new Map(
      await Promise.all(
        MEMBER_ROLES.map(async (role) => [role, await signedUpClient(t.app)] as const),
      ),
    );
    elsewhere = await signedUpClient(t.app);
  });

  afterAll(async () => {
    await t.close();
  });

  function memberOf(role: MemberRole): { client: TestClient; me: MeResponse } {
    const member = members.get(role);
    if (member === undefined) {
      throw new Error(`No user for ${role}`);
    }
    return member;
  }

  function clientOf(role: Role, fixture: Fixture): TestClient {
    return role === 'owner' ? fixture.owner : memberOf(role).client;
  }

  /**
   * A workspace of its own for each row, with every role: the daily caps on confirmation emails
   * (50 per workspace) would otherwise stop the later rows.
   */
  async function fixture(): Promise<Fixture> {
    const { client: owner, workspaceId } = await signedUpClient(t.app);
    for (const role of MEMBER_ROLES) {
      await insertMembership(t, workspaceId, memberOf(role).me.user.id, role);
    }
    const site = await createSite(owner, workspaceId);
    const other = await createSite(owner, workspaceId);
    await insertMembership(t, workspaceId, elsewhere.me.user.id, 'editor', [other.id]);
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

    const { pageId, published: v1 } = await createLiveFormPage(owner, site.id, uniqueSlug('quyen'));
    await editHeroHeading(owner, pageId, 'Ưu đãi tháng sau');
    const v2 = await publish(owner, pageId);
    const rollback = pointerMoveResponseSchema.parse(
      (
        await owner
          .post(`/pages/${pageId}/pointer`, {
            targetReleaseId: v1.release.id,
            expectedCurrentReleaseId: v2.release.id,
            reason: 'Bản 2 sai giá',
          })
          .expect(200)
      ).body,
    );
    const asset = await uploadImage(owner, site.id);

    const ids = { workspaceId, siteId: site.id, pageId, releaseId: v1.release.id };
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
      workspaceId,
      site,
      pageId,
      v1ReleaseId: v1.release.id,
      v2ReleaseId: v2.release.id,
      rollbackActivityId: rollback.activityId,
      assetId: asset.id,
      image: await pngImage(),
      leadId: idOf(lead),
      failedLeadId: idOf(failed),
      pendingRecipientId: pending?.id ?? '',
      requestId: (request.body as { id: string }).id,
    };
  }

  /** Everything the endpoints can change about the fixture's workspace and site. */
  async function stateOf({ workspaceId, site }: Fixture): Promise<string> {
    const siteId = new Types.ObjectId(site.id);
    const collection = (name: string) =>
      t.connection.collection(name).find({ siteId }).sort({ _id: 1 }).toArray();
    const [siteRecord, sites, pages, releases, redirects, assets, leads, requests, versions] =
      await Promise.all([
        t.connection.collection('sites').findOne({ _id: siteId }),
        t.connection
          .collection('sites')
          .countDocuments({ workspaceId: new Types.ObjectId(workspaceId) }),
        collection('pages'),
        collection('releases'),
        collection('redirects'),
        collection('assets'),
        collection('leads'),
        collection('data_requests'),
        collection('consent_versions'),
      ]);
    const [activity, limits] = await Promise.all([
      t.connection.collection('activity').countDocuments({ siteId }),
      t.connection.collection('lead_limits').find().sort({ key: 1 }).toArray(),
    ]);
    return JSON.stringify({
      siteRecord,
      sites,
      pages,
      releases,
      redirects,
      assets,
      leads,
      requests,
      versions,
      activity,
      limits,
    });
  }

  it.each(ROWS)('$action: $permission', async (row) => {
    const target = await fixture();
    const before = await stateOf(target);

    const foreign = await row.call(stranger, target);
    expect(foreign.status).toBe(404);
    expect(await stateOf(target)).toBe(before);

    if (row.scope === 'site') {
      const outside = await row.call(elsewhere.client, target);
      expect(outside.status).toBe(404);
      expect(await stateOf(target)).toBe(before);
    }

    const holders = rolesWith(row.permission);
    for (const role of MEMBER_ROLES.filter((item) => !holders.includes(item))) {
      const refused = await row.call(clientOf(role, target), target);
      expect(refused.status, role).toBe(403);
      expect(problemSchema.parse(refused.body)).toMatchObject({
        code: 'forbidden',
        title: onlyHoldersMessage(row.permission),
      });
      expect(await stateOf(target)).toBe(before);
    }

    // The least powerful role that holds the permission gets the action done.
    const weakest = holders.at(-1) ?? 'owner';
    expect((await row.call(clientOf(weakest, target), target)).status).toBe(row.status);
  });
});

describe('a member kept to some sites', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_site_scope');
  });

  afterAll(async () => {
    await t.close();
  });

  it('sees only those sites, on the list and by id, and `me` says which', async () => {
    const { client: owner, workspaceId } = await signedUpClient(t.app);
    const smile = await createSite(owner, workspaceId, { name: 'Nha khoa Smile Care' });
    const kitchen = await createSite(owner, workspaceId, { name: 'Bếp Nhà Mây' });
    const spa = await createSite(owner, workspaceId, { name: 'Spa Lá Xanh' });
    const { client: editor } = await addMember(t, workspaceId, 'editor', [smile.id, spa.id]);

    const list = siteListResponseSchema.parse(
      (await editor.get(`/workspaces/${workspaceId}/sites`).expect(200)).body,
    );
    expect(list.items.map((site) => site.name)).toEqual(['Nha khoa Smile Care', 'Spa Lá Xanh']);
    await editor.get(`/sites/${smile.id}`).expect(200);
    const hidden = await editor.get(`/sites/${kitchen.id}`).expect(404);
    expect(problemSchema.parse(hidden.body).title).toBe('Không tìm thấy site');

    const me = meResponseSchema.parse((await editor.get('/auth/me').expect(200)).body);
    expect(me.memberships).toEqual([
      expect.objectContaining({ role: 'owner', siteIds: null }),
      {
        workspace: { id: workspaceId, name: expect.any(String) as string },
        role: 'editor',
        siteIds: [smile.id, spa.id],
      },
    ]);
  });

  it('counts the members of each role for Chủ sở hữu and Quản trị', async () => {
    const { client: owner, workspaceId } = await signedUpClient(t.app);
    const { client: admin } = await addMember(t, workspaceId, 'admin');
    await addMember(t, workspaceId, 'editor');
    await addMember(t, workspaceId, 'editor');
    await addMember(t, workspaceId, 'viewer');
    // Members of another workspace are not counted.
    const other = await signedUpClient(t.app);
    await addMember(t, other.workspaceId, 'support');

    for (const client of [owner, admin]) {
      const response = await client.get(`/workspaces/${workspaceId}/role-counts`).expect(200);
      expect(roleCountsSchema.parse(response.body).counts).toEqual({
        owner: 1,
        admin: 1,
        editor: 2,
        contributor: 0,
        support: 0,
        viewer: 1,
      });
    }
  });
});
