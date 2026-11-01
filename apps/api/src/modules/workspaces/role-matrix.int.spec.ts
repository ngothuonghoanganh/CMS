import {
  approvalResponseSchema,
  can,
  customRolePermissions,
  customRoleSchema,
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
import { newEmail } from '../../../test/members.js';
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
  workspaceName: string;
  /** The Quản trị of the fixture, who may receive the ownership. */
  adminUserId: string;
  /** The Biên tập kept to another site, a member others may change or remove. */
  elsewhereUserId: string;
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
  /** The Cộng tác viên's pending request to publish the page (ADR-023). */
  approvalId: string;
  /** A custom role nobody holds (ADR-024). */
  customRoleId: string;
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

/** The custom role of the matrix: edits, asks to publish and sees leads (ADR-024). */
const CUSTOM_ROLE = {
  name: 'Trưởng nhóm nội dung',
  basedOn: 'editor',
  permissions: ['pages.edit', 'pages.requestPublish', 'leads.view'],
  wholeWorkspace: false,
} as const;

/** What a holder of `CUSTOM_ROLE` may do. */
const CUSTOM_ACCESS = {
  customRoleId: '64b0000000000000000000d1',
  name: CUSTOM_ROLE.name,
  permissions: customRolePermissions([...CUSTOM_ROLE.permissions]),
};

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
  // Members (board 15, ADR-021)
  {
    action: 'Xem thành viên',
    permission: 'members.manage',
    scope: 'workspace',
    status: 200,
    call: (client, { workspaceId }) => client.get(`/workspaces/${workspaceId}/members`),
  },
  {
    action: 'Đổi quyền thành viên',
    permission: 'members.manage',
    scope: 'workspace',
    status: 200,
    call: (client, { workspaceId, elsewhereUserId }) =>
      client.patch(`/workspaces/${workspaceId}/members/${elsewhereUserId}`, {
        role: 'viewer',
        siteIds: null,
      }),
  },
  {
    action: 'Gỡ thành viên',
    permission: 'members.manage',
    scope: 'workspace',
    status: 204,
    call: (client, { workspaceId, elsewhereUserId }) =>
      client.delete(`/workspaces/${workspaceId}/members/${elsewhereUserId}`),
  },
  {
    action: 'Xem lời mời',
    permission: 'members.manage',
    scope: 'workspace',
    status: 200,
    call: (client, { workspaceId }) => client.get(`/workspaces/${workspaceId}/invitations`),
  },
  {
    action: 'Mời thành viên',
    permission: 'members.manage',
    scope: 'workspace',
    status: 200,
    call: (client, { workspaceId }) =>
      client.post(`/workspaces/${workspaceId}/invitations`, {
        emails: [newEmail('ma-tran')],
        role: 'viewer',
        siteIds: null,
      }),
  },
  {
    action: 'Xem yêu cầu đổi quyền',
    permission: 'accessRequests.decide',
    scope: 'workspace',
    status: 200,
    call: (client, { workspaceId }) => client.get(`/workspaces/${workspaceId}/access-requests`),
  },
  {
    action: 'Chuyển quyền sở hữu',
    permission: 'workspace.transferOwnership',
    scope: 'workspace',
    status: 200,
    call: (client, { workspaceId, workspaceName, adminUserId }) =>
      client.post(`/workspaces/${workspaceId}/ownership`, {
        toUserId: adminUserId,
        confirmName: workspaceName,
      }),
  },
  // Custom domains (board 13, ADR-022)
  // Custom roles (board 16, ADR-024)
  {
    action: 'Xem vai trò tùy chỉnh',
    permission: 'members.manage',
    scope: 'workspace',
    status: 200,
    call: (client, { workspaceId }) => client.get(`/workspaces/${workspaceId}/custom-roles`),
  },
  {
    action: 'Tạo vai trò tùy chỉnh',
    permission: 'members.manage',
    scope: 'workspace',
    status: 201,
    call: (client, { workspaceId }) =>
      client.post(`/workspaces/${workspaceId}/custom-roles`, {
        ...CUSTOM_ROLE,
        name: 'Biên tập lead',
      }),
  },
  {
    action: 'Sửa vai trò tùy chỉnh',
    permission: 'members.manage',
    scope: 'workspace',
    status: 200,
    call: (client, { workspaceId, customRoleId }) =>
      client.patch(`/workspaces/${workspaceId}/custom-roles/${customRoleId}`, {
        ...CUSTOM_ROLE,
        name: 'Biên tập trang ưu đãi',
      }),
  },
  {
    action: 'Xóa vai trò tùy chỉnh',
    permission: 'members.manage',
    scope: 'workspace',
    status: 204,
    call: (client, { workspaceId, customRoleId }) =>
      client.delete(`/workspaces/${workspaceId}/custom-roles/${customRoleId}`),
  },
  {
    action: 'Xem tên miền',
    permission: 'domains.manage',
    scope: 'site',
    status: 200,
    call: (client, { site }) => client.get(`/sites/${site.id}/domains`),
  },
  {
    action: 'Kết nối tên miền riêng',
    permission: 'domains.manage',
    scope: 'site',
    status: 201,
    call: (client, { site }) =>
      client.post(`/sites/${site.id}/domains`, { hostname: `go.${site.subdomain}.vn` }),
  },
  {
    action: 'Đặt địa chỉ chính',
    permission: 'domains.manage',
    scope: 'site',
    status: 200,
    call: (client, { site }) => client.put(`/sites/${site.id}/primary-domain`, { domainId: null }),
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
    call: (client, { site, pageId }) => client.get(`/sites/${site.id}/pages/${pageId}`),
  },
  {
    action: 'Lưu bản nháp',
    permission: 'pages.edit',
    scope: 'site',
    status: 200,
    call: async (client, { site, owner, pageId }) => {
      const { draft } = await getPage(owner, site.id, pageId);
      return client.put(`/sites/${site.id}/pages/${pageId}/draft`, {
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
    call: async (client, { site, owner, pageId, v1ReleaseId }) => {
      const { draft } = await getPage(owner, site.id, pageId);
      return client.post(`/sites/${site.id}/pages/${pageId}/draft/restore`, {
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
    call: (client, { site, pageId }) => client.get(`/sites/${site.id}/pages/${pageId}/checks`),
  },
  {
    action: 'Xem trước',
    permission: 'pages.view',
    scope: 'site',
    status: 201,
    call: (client, { site, pageId }) =>
      client.post(`/sites/${site.id}/pages/${pageId}/preview-links`, { kind: 'draft' }),
  },
  // Publishing
  {
    action: 'Xuất bản',
    permission: 'pages.publish',
    scope: 'site',
    status: 201,
    call: async (client, { site, owner, pageId }) =>
      publishRequest(client, site.id, pageId, await currentPublishBody(owner, site.id, pageId)),
  },
  {
    action: 'Gửi yêu cầu xuất bản',
    permission: 'pages.requestPublish',
    scope: 'site',
    status: 200,
    // The Cộng tác viên sends their waiting request again.
    call: async (client, { site, owner, pageId, approvalId }) =>
      client.post(`/sites/${site.id}/pages/${pageId}/approval`, {
        expectedRevision: (await getPage(owner, site.id, pageId)).draft.revision,
        expectedPublishedReleaseId:
          (await getPage(owner, site.id, pageId)).page.liveRelease?.id ?? null,
        approvalId,
        note: 'Đổi giá ưu đãi',
      }),
  },
  {
    action: 'Rút yêu cầu xuất bản',
    permission: 'pages.requestPublish',
    scope: 'site',
    status: 200,
    call: (client, { site, pageId }) => client.delete(`/sites/${site.id}/pages/${pageId}/approval`),
  },
  {
    action: 'Từ chối yêu cầu xuất bản',
    permission: 'publishApprovals.decide',
    scope: 'site',
    status: 200,
    call: async (client, { site, owner, pageId, approvalId }) =>
      client.post(`/sites/${site.id}/pages/${pageId}/approval/reject`, {
        approvalId,
        revision: (await getPage(owner, site.id, pageId)).draft.revision,
        reason: 'Giá chưa đúng',
      }),
  },
  {
    action: 'Lịch sử phiên bản',
    permission: 'pages.view',
    scope: 'site',
    status: 200,
    call: (client, { site, pageId }) => client.get(`/sites/${site.id}/pages/${pageId}/history`),
  },
  {
    action: 'Khôi phục một phiên bản',
    permission: 'pages.manageLive',
    scope: 'site',
    status: 200,
    call: (client, { site, pageId, v1ReleaseId, v2ReleaseId }) =>
      client.post(`/sites/${site.id}/pages/${pageId}/pointer`, {
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
    call: (client, { site, pageId, v1ReleaseId }) =>
      client.post(`/sites/${site.id}/pages/${pageId}/pointer`, {
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
    call: (client, { site, rollbackActivityId }) =>
      client.post(`/sites/${site.id}/activity/${rollbackActivityId}/undo`),
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
    call: (client, { site, assetId }) =>
      client.patch(`/sites/${site.id}/assets/${assetId}`, {
        alt: 'Ghế nha khoa',
        decorative: false,
      }),
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
    call: (client, { site, leadId }) => client.get(`/sites/${site.id}/leads/${leadId}`),
  },
  {
    action: 'Đổi trạng thái lead',
    permission: 'leads.handle',
    scope: 'site',
    status: 200,
    call: (client, { site, leadId }) =>
      client.patch(`/sites/${site.id}/leads/${leadId}`, { status: 'contacted' }),
  },
  {
    action: 'Ghi chú nội bộ',
    permission: 'leads.handle',
    scope: 'site',
    status: 200,
    call: (client, { site, leadId }) =>
      client.patch(`/sites/${site.id}/leads/${leadId}`, { note: 'Gọi lại sau 18h' }),
  },
  {
    action: 'Chuyển vào Nghi ngờ spam',
    permission: 'leads.handle',
    scope: 'site',
    status: 200,
    call: (client, { site, leadId }) =>
      client.patch(`/sites/${site.id}/leads/${leadId}`, { spam: true }),
  },
  {
    action: 'Gửi lại email thông báo',
    permission: 'leads.handle',
    scope: 'site',
    status: 200,
    call: (client, { site, failedLeadId }) =>
      client.post(`/sites/${site.id}/leads/${failedLeadId}/notification/retry`),
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
    call: (client, { site, leadId }) =>
      client.patch(`/sites/${site.id}/leads/${leadId}/contact`, {
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
    call: (client, { site, leadId }) =>
      client.post(`/sites/${site.id}/leads/${leadId}/person/export`, { format: 'json' }),
  },
  {
    action: 'Xóa dữ liệu người này',
    permission: 'personalData.manage',
    scope: 'site',
    status: 200,
    call: (client, { site, leadId }) => client.delete(`/sites/${site.id}/leads/${leadId}/person`),
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
    call: (client, { site, requestId }) =>
      client.get(`/sites/${site.id}/data-requests/${requestId}`),
  },
  {
    action: 'Đã phản hồi người yêu cầu',
    permission: 'personalData.manage',
    scope: 'site',
    status: 200,
    call: (client, { site, requestId }) =>
      client.post(`/sites/${site.id}/data-requests/${requestId}/respond`),
  },
  {
    action: 'Xuất dữ liệu cho yêu cầu',
    permission: 'personalData.manage',
    scope: 'site',
    status: 200,
    call: (client, { site, requestId }) =>
      client.post(`/sites/${site.id}/data-requests/${requestId}/export`, { format: 'csv' }),
  },
  {
    action: 'Hoàn tất yêu cầu',
    permission: 'personalData.manage',
    scope: 'site',
    status: 200,
    call: (client, { site, requestId }) =>
      client.post(`/sites/${site.id}/data-requests/${requestId}/complete`),
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
  /** A holder of `CUSTOM_ROLE` in each fixture's workspace. */
  let customHolder: { client: TestClient; me: MeResponse };

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
    customHolder = await signedUpClient(t.app);
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
    const { client: owner, workspaceId, me } = await signedUpClient(t.app);
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
    await editHeroHeading(owner, site.id, pageId, 'Ưu đãi tháng sau');
    const v2 = await publish(owner, site.id, pageId);
    const rollback = pointerMoveResponseSchema.parse(
      (
        await owner
          .post(`/sites/${site.id}/pages/${pageId}/pointer`, {
            targetReleaseId: v1.release.id,
            expectedCurrentReleaseId: v2.release.id,
            reason: 'Bản 2 sai giá',
          })
          .expect(200)
      ).body,
    );
    const asset = await uploadImage(owner, site.id);
    const held = customRoleSchema.parse(
      (await owner.post(`/workspaces/${workspaceId}/custom-roles`, CUSTOM_ROLE).expect(201)).body,
    );
    await t.connection.collection('memberships').insertOne({
      workspaceId: new Types.ObjectId(workspaceId),
      userId: new Types.ObjectId(customHolder.me.user.id),
      role: 'custom',
      customRoleId: new Types.ObjectId(held.id),
      siteIds: null,
      createdAt: new Date(),
    });
    const unheld = customRoleSchema.parse(
      (
        await owner
          .post(`/workspaces/${workspaceId}/custom-roles`, { ...CUSTOM_ROLE, name: 'Chưa giao' })
          .expect(201)
      ).body,
    );
    const asked = approvalResponseSchema.parse(
      (
        await memberOf('contributor')
          .client.post(`/sites/${site.id}/pages/${pageId}/approval`, {
            expectedRevision: (await getPage(owner, site.id, pageId)).draft.revision,
            expectedPublishedReleaseId:
              (await getPage(owner, site.id, pageId)).page.liveRelease?.id ?? null,
            approvalId: null,
            note: '',
          })
          .expect(200)
      ).body,
    );

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
      workspaceName: me.memberships[0]?.workspace.name ?? '',
      adminUserId: memberOf('admin').me.user.id,
      elsewhereUserId: elsewhere.me.user.id,
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
      approvalId: asked.page.approval?.id ?? '',
      customRoleId: unheld.id,
    };
  }

  /** Everything the endpoints can change about the fixture's workspace and site. */
  async function stateOf({ workspaceId, site }: Fixture): Promise<string> {
    const siteId = new Types.ObjectId(site.id);
    // The site's data lives in its workspace's database; accounts and routing in the master.
    const db = t.workspaceDb(workspaceId);
    const collection = (name: string) =>
      db.collection(name).find({ siteId }).sort({ _id: 1 }).toArray();
    const [
      siteRecord,
      sites,
      pages,
      releases,
      redirects,
      assets,
      leads,
      requests,
      versions,
      approvals,
    ] = await Promise.all([
      db.collection('sites').findOne({ _id: siteId }),
      db.collection('sites').countDocuments({ workspaceId: new Types.ObjectId(workspaceId) }),
      collection('pages'),
      collection('releases'),
      collection('redirects'),
      collection('assets'),
      collection('leads'),
      collection('data_requests'),
      collection('consent_versions'),
      collection('publish_approvals'),
    ]);
    const ofWorkspace = (name: string) =>
      t.connection
        .collection(name)
        .find({ workspaceId: new Types.ObjectId(workspaceId) })
        .sort({ _id: 1 })
        .toArray();
    const [
      activity,
      limits,
      memberships,
      invitations,
      accessRequests,
      domains,
      customRoles,
      addresses,
      workspace,
    ] = await Promise.all([
      // Every field of every event: a refused call must not edit one either.
      collection('activity'),
      t.connection.collection('lead_limits').find().sort({ key: 1 }).toArray(),
      ofWorkspace('memberships'),
      ofWorkspace('invitations'),
      ofWorkspace('access_requests'),
      t.connection.collection('domains').find({ siteId }).sort({ _id: 1 }).toArray(),
      ofWorkspace('custom_roles'),
      ofWorkspace('site_addresses'),
      t.connection.collection('workspaces').findOne({ _id: new Types.ObjectId(workspaceId) }),
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
      approvals,
      activity,
      limits,
      memberships,
      invitations,
      accessRequests,
      domains,
      customRoles,
      addresses,
      workspace,
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

    // A custom role is refused exactly what it does not hold (ADR-024).
    const allowed = can(CUSTOM_ACCESS, row.permission);
    if (!allowed) {
      expect((await row.call(customHolder.client, target)).status, 'custom role').toBe(403);
      expect(await stateOf(target)).toBe(before);
    }

    // The least powerful role that holds the permission gets the action done.
    const weakest = holders.at(-1) ?? 'owner';
    expect((await row.call(clientOf(weakest, target), target)).status).toBe(row.status);

    // And it is never refused what it holds. The fixture may have moved on, so the status may be
    // the action's own (a 404 for a request of someone else's), never a 403.
    if (allowed) {
      expect((await row.call(customHolder.client, target)).status, 'custom role').not.toBe(403);
    }
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
        workspace: {
          id: workspaceId,
          name: expect.any(String) as string,
          slug: expect.stringMatching(/^[a-z0-9][a-z0-9-]+[a-z0-9]$/) as string,
        },
        role: 'editor',
        siteIds: [smile.id, spa.id],
      },
    ]);
  });

  it("finds a page, lead, request, event or image only through its own site's route", async () => {
    // Ids of one site resolve in the workspace's database whatever site the route names, so each
    // endpoint must check the resource belongs to that site (ADR-025): even Chủ sở hữu, who opens
    // both sites, gets 404 for a resource of Bếp Nhà Mây through Nha khoa Smile Care.
    const { client: owner, workspaceId } = await signedUpClient(t.app);
    const smile = await createSite(owner, workspaceId, { name: 'Nha khoa Smile Care' });
    const kitchen = await createSite(owner, workspaceId, { name: 'Bếp Nhà Mây' });
    await configurePrivacy(owner, kitchen.id);
    await addConfirmedRecipient(t, owner, kitchen.id);
    const { pageId, published: v1 } = await createLiveFormPage(
      owner,
      kitchen.id,
      uniqueSlug('bep'),
    );
    await editHeroHeading(owner, kitchen.id, pageId, 'Thực đơn mới');
    const v2 = await publish(owner, kitchen.id, pageId);
    const rollback = pointerMoveResponseSchema.parse(
      (
        await owner
          .post(`/sites/${kitchen.id}/pages/${pageId}/pointer`, {
            targetReleaseId: v1.release.id,
            expectedCurrentReleaseId: v2.release.id,
            reason: 'Sai giá',
          })
          .expect(200)
      ).body,
    );
    const asset = await uploadImage(owner, kitchen.id);
    const lead = storedLead({
      workspaceId,
      siteId: kitchen.id,
      pageId,
      releaseId: v1.release.id,
      name: 'Lê Mai Anh',
      phone: '+84987106223',
      notification: { status: 'failed', attempts: 3 },
    });
    await insertLeads(t, [lead]);
    const leadId = String(lead['_id']);
    const requestId = (
      (
        await owner
          .post(`/sites/${kitchen.id}/data-requests`, {
            name: 'Lê Mai Anh',
            phone: '0987 106 223',
            email: '',
            type: 'access',
            receivedAt: new Date(Date.now() - DAY_MS).toISOString(),
          })
          .expect(201)
      ).body as { id: string }
    ).id;

    const db = t.workspaceDb(workspaceId);
    const kitchenId = new Types.ObjectId(kitchen.id);
    const state = async () =>
      JSON.stringify(
        await Promise.all(
          [
            'pages',
            'releases',
            'activity',
            'assets',
            'leads',
            'data_requests',
            'publish_approvals',
          ].map((name) =>
            db.collection(name).find({ siteId: kitchenId }).sort({ _id: 1 }).toArray(),
          ),
        ),
      );
    const before = await state();
    const { draft } = await getPage(owner, kitchen.id, pageId);
    const page = `/sites/${smile.id}/pages/${pageId}`;
    const calls: Array<[string, () => PromiseLike<Response>]> = [
      ['page', () => owner.get(page)],
      [
        'draft',
        () =>
          owner.put(`${page}/draft`, {
            baseRevision: draft.revision,
            slug: draft.slug,
            composition: draft.composition,
            seo: draft.seo,
          }),
      ],
      [
        'restore',
        () =>
          owner.post(`${page}/draft/restore`, {
            baseRevision: draft.revision,
            releaseId: v2.release.id,
          }),
      ],
      ['checks', () => owner.get(`${page}/checks`)],
      ['preview', () => owner.post(`${page}/preview-links`, { kind: 'draft' })],
      [
        'publish',
        async () =>
          publishRequest(
            owner,
            smile.id,
            pageId,
            await currentPublishBody(owner, kitchen.id, pageId),
          ),
      ],
      ['history', () => owner.get(`${page}/history`)],
      [
        'pointer',
        () =>
          owner.post(`${page}/pointer`, {
            targetReleaseId: null,
            expectedCurrentReleaseId: v1.release.id,
            reason: 'Gỡ nhầm site',
          }),
      ],
      ['undo', () => owner.post(`/sites/${smile.id}/activity/${rollback.activityId}/undo`)],
      [
        'image',
        () =>
          owner.patch(`/sites/${smile.id}/assets/${asset.id}`, { alt: 'Sửa', decorative: false }),
      ],
      ['lead', () => owner.get(`/sites/${smile.id}/leads/${leadId}`)],
      ['lead update', () => owner.patch(`/sites/${smile.id}/leads/${leadId}`, { spam: true })],
      ['lead retry', () => owner.post(`/sites/${smile.id}/leads/${leadId}/notification/retry`)],
      [
        'lead export',
        () => owner.post(`/sites/${smile.id}/leads/${leadId}/person/export`, { format: 'json' }),
      ],
      ['lead delete', () => owner.delete(`/sites/${smile.id}/leads/${leadId}/person`)],
      ['request', () => owner.get(`/sites/${smile.id}/data-requests/${requestId}`)],
      [
        'request respond',
        () => owner.post(`/sites/${smile.id}/data-requests/${requestId}/respond`),
      ],
      [
        'request export',
        () => owner.post(`/sites/${smile.id}/data-requests/${requestId}/export`, { format: 'csv' }),
      ],
      [
        'request complete',
        () => owner.post(`/sites/${smile.id}/data-requests/${requestId}/complete`),
      ],
    ];
    for (const [name, call] of calls) {
      const response = await call();
      expect(response.status, name).toBe(404);
      expect(problemSchema.parse(response.body).code, name).toBe('not_found');
    }
    expect(await state()).toBe(before);
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
