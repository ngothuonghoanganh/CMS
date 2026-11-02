import { describe, expect, it } from 'vitest';
import {
  customizablePermissionsOf,
  customRoleGroups,
  customRoleIdOf,
  customRoleInputSchema,
  customRolePermissions,
  customRoleProblem,
  customRoleRef,
  roleChoiceSchema,
} from './custom-roles.js';
import { accessLabel, can } from './permissions.js';

const ROLE_ID = '64b0000000000000000000d1';

describe('custom roles (ADR-024)', () => {
  it('starts from what the system role may do among the rows it may switch', () => {
    expect(customizablePermissionsOf('editor')).toEqual([
      'pages.edit',
      'templates.manage',
      'pages.publish',
      'pages.manageLive',
    ]);
    expect(customizablePermissionsOf('contributor')).toEqual([
      'pages.edit',
      'pages.requestPublish',
    ]);
    // A custom role may save and manage the workspace's templates (ADR-030), with no other row.
    expect(customRoleProblem(['templates.manage'])).toBeNull();
    expect(customizablePermissionsOf('admin')).toContain('publishApprovals.decide');
    expect(customizablePermissionsOf('admin')).not.toContain('pages.requestPublish');
  });

  it('refuses permissions that do not go together', () => {
    expect(customRoleProblem(['pages.edit', 'pages.publish', 'pages.requestPublish'])).toMatch(
      /không chọn cả hai/,
    );
    expect(customRoleProblem(['pages.publish'])).toMatch(/cần quyền sửa bản nháp/);
    expect(customRoleProblem(['pages.edit', 'publishApprovals.decide'])).toMatch(
      /cần quyền xuất bản/,
    );
    expect(customRoleProblem(['leads.export'])).toMatch(/cần quyền xem lead/);
    expect(
      customRoleProblem(['pages.edit', 'pages.requestPublish', 'leads.view', 'leads.handle']),
    ).toBeNull();
  });

  it('takes a name of its own, never a system role’s', () => {
    const input = { basedOn: 'editor', permissions: ['pages.edit'], wholeWorkspace: false };
    expect(customRoleInputSchema.safeParse({ ...input, name: '  Trưởng nhóm  ' }).data?.name).toBe(
      'Trưởng nhóm',
    );
    expect(customRoleInputSchema.safeParse({ ...input, name: 'biên tập' }).success).toBe(false);
    // The same letters decomposed are the same name.
    expect(
      customRoleInputSchema.safeParse({ ...input, name: 'Biên tập'.normalize('NFD') }).success,
    ).toBe(false);
    expect(
      customRoleInputSchema.safeParse({ ...input, name: 'Trưởng nhóm'.normalize('NFD') }).data
        ?.name,
    ).toBe('Trưởng nhóm'.normalize('NFC'));
    expect(customRoleInputSchema.safeParse({ ...input, name: '' }).success).toBe(false);
    expect(
      customRoleInputSchema.safeParse({ ...input, name: 'X', permissions: ['members.manage'] })
        .success,
    ).toBe(false);
  });

  it('is chosen as custom:{id} next to the system roles', () => {
    expect(roleChoiceSchema.safeParse('editor').success).toBe(true);
    expect(roleChoiceSchema.safeParse(customRoleRef(ROLE_ID)).success).toBe(true);
    expect(roleChoiceSchema.safeParse('owner').success).toBe(false);
    expect(roleChoiceSchema.safeParse('custom:khong-phai-id').success).toBe(false);
    expect(customRoleIdOf(customRoleRef(ROLE_ID))).toBe(ROLE_ID);
    expect(customRoleIdOf('viewer')).toBeNull();
  });

  it('gives its holder its permissions and viewing pages, nothing else', () => {
    const access = {
      customRoleId: ROLE_ID,
      name: 'Trưởng nhóm nội dung',
      permissions: customRolePermissions(['pages.edit', 'pages.requestPublish', 'leads.view']),
    };
    expect(can(access, 'pages.view')).toBe(true);
    expect(can(access, 'pages.requestPublish')).toBe(true);
    expect(can(access, 'leads.view')).toBe(true);
    expect(can(access, 'pages.publish')).toBe(false);
    expect(can(access, 'members.manage')).toBe(false);
    expect(accessLabel(access)).toBe('Trưởng nhóm nội dung');
    expect(accessLabel('support')).toBe('Chăm sóc khách hàng');
  });

  it('shows the editor the rows of board 16 a custom role may switch', () => {
    expect(customRoleGroups.map((group) => group.title)).toEqual([
      'Nội dung',
      'Xuất bản',
      'Leads',
      'Dữ liệu cá nhân',
    ]);
    const publish = customRoleGroups[1]?.rows[0];
    expect(publish).toMatchObject({ permission: 'pages.publish', request: 'pages.requestPublish' });
  });
});
