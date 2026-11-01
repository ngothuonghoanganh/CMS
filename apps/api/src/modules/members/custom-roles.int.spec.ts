import {
  CUSTOM_ROLES_MAX,
  type CustomRole,
  type CustomRoleInput,
  customRoleListResponseSchema,
  customRoleRef,
  customRoleSchema,
  memberListResponseSchema,
  meResponseSchema,
  problemSchema,
  type Site,
} from '@plp/contracts';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { signedUpClient, TestClient } from '../../../test/client.js';
import { invite, newEmail } from '../../../test/members.js';
import {
  createLivePage,
  currentPublishBody,
  publishRequest,
  uniqueSlug,
} from '../../../test/pages.js';
import { addMember, createSite } from '../../../test/resources.js';
import { MemberGrants } from './member-grants.js';

const PASSWORD = 'mat-khau-an-toan-123';

/** "Trưởng nhóm nội dung" of board 16: Biên tập asking to publish, and seeing leads. */
const LEAD: CustomRoleInput = {
  name: 'Trưởng nhóm nội dung',
  basedOn: 'editor',
  permissions: ['pages.edit', 'pages.requestPublish', 'leads.view'],
  wholeWorkspace: false,
};

describe('custom roles (ADR-024)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('plp_test_custom_roles');
  });

  afterAll(async () => {
    await t.close();
  });

  async function workspace() {
    const owner = await signedUpClient(t.app);
    const site = await createSite(owner.client, owner.workspaceId);
    return { ...owner, site };
  }

  async function create(
    client: TestClient,
    workspaceId: string,
    input: CustomRoleInput = LEAD,
  ): Promise<CustomRole> {
    const response = await client
      .post(`/workspaces/${workspaceId}/custom-roles`, input)
      .expect(201);
    return customRoleSchema.parse(response.body);
  }

  async function list(client: TestClient, workspaceId: string): Promise<CustomRole[]> {
    const response = await client.get(`/workspaces/${workspaceId}/custom-roles`).expect(200);
    return customRoleListResponseSchema.parse(response.body).items;
  }

  /** Someone invited with the custom role, signed up from the link. */
  async function holder(owner: TestClient, workspaceId: string, role: CustomRole, site: Site) {
    const email = newEmail('vai-tro');
    const token = await invite(t, owner, workspaceId, email, {
      role: customRoleRef(role.id),
      siteIds: role.wholeWorkspace ? null : [site.id],
    });
    const client = new TestClient(t.app);
    const signup = await client
      .post('/auth/signup/invited', { token, name: 'Bảo Ngọc', password: PASSWORD })
      .expect(201);
    return { client, email, me: meResponseSchema.parse(signup.body) };
  }

  it('is created from a system role by Chủ sở hữu and Quản trị only, with a name of its own', async () => {
    const { client: owner, workspaceId } = await workspace();
    const admin = await addMember(t, workspaceId, 'admin');
    const editor = await addMember(t, workspaceId, 'editor');

    const role = await create(owner, workspaceId);
    expect(role).toMatchObject({ ...LEAD, memberCount: 0, invitationCount: 0 });
    expect((await list(admin.client, workspaceId)).map((item) => item.name)).toEqual([LEAD.name]);

    await editor.client.get(`/workspaces/${workspaceId}/custom-roles`).expect(403);
    await new TestClient(t.app).get(`/workspaces/${workspaceId}/custom-roles`).expect(401);
    const stranger = await signedUpClient(t.app);
    await stranger.client.get(`/workspaces/${workspaceId}/custom-roles`).expect(404);

    const taken = await owner
      .post(`/workspaces/${workspaceId}/custom-roles`, { ...LEAD, name: 'trưởng NHÓM nội dung' })
      .expect(409);
    expect(problemSchema.parse(taken.body).title).toBe('Đã có vai trò tên này');
    await owner
      .post(`/workspaces/${workspaceId}/custom-roles`, { ...LEAD, name: 'Quản trị' })
      .expect(422);
    await owner
      .post(`/workspaces/${workspaceId}/custom-roles`, {
        ...LEAD,
        name: 'Duyệt mà không xuất bản',
        permissions: ['pages.edit', 'publishApprovals.decide'],
      })
      .expect(422);
    await owner
      .post(`/workspaces/${workspaceId}/custom-roles`, {
        ...LEAD,
        name: 'Quản lý tên miền',
        permissions: ['domains.manage'],
      })
      .expect(422);
  });

  it(`keeps a workspace to ${CUSTOM_ROLES_MAX} custom roles`, async () => {
    const { client: owner, workspaceId } = await workspace();
    for (let index = 0; index < CUSTOM_ROLES_MAX; index += 1) {
      await create(owner, workspaceId, { ...LEAD, name: `Vai trò ${index}` });
    }
    const full = await owner
      .post(`/workspaces/${workspaceId}/custom-roles`, { ...LEAD, name: 'Một vai trò nữa' })
      .expect(409);
    expect(problemSchema.parse(full.body).code).toBe('custom_role_limit_reached');
  });

  it('gives its holder exactly its permissions, changed at the next request', async () => {
    const { client: owner, workspaceId, site } = await workspace();
    const role = await create(owner, workspaceId);
    const member = await holder(owner, workspaceId, role, site);
    expect(t.emails.to(member.email).at(-1)?.text).toContain(LEAD.name);
    expect(member.me.memberships).toEqual([
      {
        workspace: { id: workspaceId, name: expect.any(String) as string },
        role: {
          customRoleId: role.id,
          name: LEAD.name,
          permissions: ['pages.view', 'pages.edit', 'pages.requestPublish', 'leads.view'],
        },
        siteIds: [site.id],
      },
    ]);

    const { pageId } = await createLivePage(owner, site.id, uniqueSlug('vai-tro'));
    await member.client.get(`/sites/${site.id}/leads?range=all`).expect(200);
    const refused = await publishRequest(
      member.client,
      pageId,
      await currentPublishBody(owner, pageId),
    ).expect(403);
    expect(problemSchema.parse(refused.body).title).toBe(
      'Chỉ Chủ sở hữu, Quản trị và Biên tập được thực hiện thao tác này',
    );
    await member.client.get(`/workspaces/${workspaceId}/members`).expect(403);
    await member.client.get(`/workspaces/${workspaceId}/custom-roles`).expect(403);

    // Leads taken away: the very next request is refused.
    await owner
      .patch(`/workspaces/${workspaceId}/custom-roles/${role.id}`, {
        ...LEAD,
        permissions: ['pages.edit', 'pages.requestPublish'],
      })
      .expect(200);
    await member.client.get(`/sites/${site.id}/leads?range=all`).expect(403);

    const listed = memberListResponseSchema
      .parse((await owner.get(`/workspaces/${workspaceId}/members`).expect(200)).body)
      .items.find((item) => item.email === member.email);
    expect(listed?.role).toMatchObject({ customRoleId: role.id, name: LEAD.name });
    expect((await list(owner, workspaceId))[0]).toMatchObject({ memberCount: 1 });
  });

  it('gives a "Toàn workspace" role on every site, and widens a role only once nobody holds it on some', async () => {
    const { client: owner, workspaceId, site } = await workspace();
    const everywhere = await create(owner, workspaceId, {
      ...LEAD,
      name: 'Toàn bộ',
      wholeWorkspace: true,
    });
    const refused = await owner
      .post(`/workspaces/${workspaceId}/invitations`, {
        emails: [newEmail()],
        role: customRoleRef(everywhere.id),
        siteIds: [site.id],
      })
      .expect(422);
    expect(problemSchema.parse(refused.body).issues?.[0]?.path).toEqual(['siteIds']);

    const kept = await create(owner, workspaceId);
    const member = await holder(owner, workspaceId, kept, site);
    const widened = await owner
      .patch(`/workspaces/${workspaceId}/custom-roles/${kept.id}`, {
        ...LEAD,
        wholeWorkspace: true,
      })
      .expect(409);
    expect(problemSchema.parse(widened.body).title).toBe(
      '1 người đang giữ vai trò này trên một số site',
    );
    await owner
      .patch(`/workspaces/${workspaceId}/members/${member.me.user.id}`, {
        role: customRoleRef(kept.id),
        siteIds: null,
      })
      .expect(200);
    await owner
      .patch(`/workspaces/${workspaceId}/custom-roles/${kept.id}`, {
        ...LEAD,
        wholeWorkspace: true,
      })
      .expect(200);
  });

  it('is deleted only once nobody holds it and no invitation offers it', async () => {
    const { client: owner, workspaceId, site } = await workspace();
    const role = await create(owner, workspaceId);
    const member = await holder(owner, workspaceId, role, site);
    const held = await owner
      .delete(`/workspaces/${workspaceId}/custom-roles/${role.id}`)
      .expect(409);
    expect(problemSchema.parse(held.body)).toMatchObject({
      code: 'custom_role_in_use',
      title: 'Vai trò đang được dùng',
      detail: expect.stringMatching(/^1 thành viên đang giữ và 0 lời mời đang chờ/) as string,
    });

    await owner
      .patch(`/workspaces/${workspaceId}/members/${member.me.user.id}`, {
        role: 'viewer',
        siteIds: null,
      })
      .expect(200);
    await invite(t, owner, workspaceId, newEmail(), {
      role: customRoleRef(role.id),
      siteIds: null,
    });
    await owner.delete(`/workspaces/${workspaceId}/custom-roles/${role.id}`).expect(409);
    await t.connection
      .collection('invitations')
      .updateMany(
        { workspaceId: new Types.ObjectId(workspaceId) },
        { $set: { status: 'revoked' } },
      );
    await owner.delete(`/workspaces/${workspaceId}/custom-roles/${role.id}`).expect(204);
    expect(await list(owner, workspaceId)).toEqual([]);
    await owner.delete(`/workspaces/${workspaceId}/custom-roles/${role.id}`).expect(404);
  });

  it('never leaves a member holding a role deleted between the check and the grant', async () => {
    const { client: owner, workspaceId, site } = await workspace();
    const role = await create(owner, workspaceId);
    const viewer = await addMember(t, workspaceId, 'viewer');
    const grants = t.app.get(MemberGrants);
    const resolve = grants.resolveGrant.bind(grants);
    const paused = vi
      .spyOn(grants, 'resolveGrant')
      .mockImplementationOnce(async (...args: Parameters<MemberGrants['resolveGrant']>) => {
        const resolved = await resolve(...args);
        // Checked; the role is deleted before the grant is stored.
        await owner.delete(`/workspaces/${workspaceId}/custom-roles/${role.id}`).expect(204);
        return resolved;
      });
    try {
      const refused = await owner
        .patch(`/workspaces/${workspaceId}/members/${viewer.me.user.id}`, {
          role: customRoleRef(role.id),
          siteIds: [site.id],
        })
        .expect(422);
      expect(problemSchema.parse(refused.body).issues?.[0]?.path).toEqual(['role']);
    } finally {
      paused.mockRestore();
    }
    const membership = await t.connection.collection('memberships').findOne({
      workspaceId: new Types.ObjectId(workspaceId),
      userId: new Types.ObjectId(viewer.me.user.id),
    });
    expect(membership?.['role']).toBe('viewer');
  });

  it('refuses a custom role of another workspace, and grants nothing when its role is gone', async () => {
    const { client: owner, workspaceId, site } = await workspace();
    const other = await workspace();
    const foreign = await create(other.client, other.workspaceId);
    const refused = await owner
      .post(`/workspaces/${workspaceId}/invitations`, {
        emails: [newEmail()],
        role: customRoleRef(foreign.id),
        siteIds: null,
      })
      .expect(422);
    expect(problemSchema.parse(refused.body).issues?.[0]?.path).toEqual(['role']);

    const role = await create(owner, workspaceId);
    const member = await holder(owner, workspaceId, role, site);
    await member.client.get(`/sites/${site.id}`).expect(200);
    await t.connection.collection('custom_roles').deleteOne({ _id: new Types.ObjectId(role.id) });
    await member.client.get(`/sites/${site.id}`).expect(403);
  });
});
