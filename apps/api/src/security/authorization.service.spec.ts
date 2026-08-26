import { describe, expect, it } from 'vitest';

import { AuthorizationService } from './authorization.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const otherWorkspaceId = '33333333-3333-4333-8333-333333333333';
const tenantRoleId = '44444444-4444-4444-8444-444444444444';
const workspaceRoleId = '55555555-5555-4555-8555-555555555555';
const tenantAssignmentId = '66666666-6666-4666-8666-666666666666';
const workspaceAssignmentId = '77777777-7777-4777-8777-777777777777';

function role(_id: string, permissions: string[], key: string) {
  return { _id, key, permissions };
}

function assignment(
  _id: string,
  roleId: string,
  scope: 'tenant' | 'workspace',
  assignedWorkspaceId?: string,
) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    _id,
    userId: 'user@example.com',
    roleId,
    scope,
    ...(assignedWorkspaceId ? { workspaceId: assignedWorkspaceId } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

function modelReturning<T>(value: T) {
  return {
    exec: async () => value,
  };
}

describe('AuthorizationService', () => {
  it('unions tenant and matching workspace assignments without leaking other workspaces', async () => {
    const roles = [
      role(tenantRoleId, ['site.read'], 'tenant-reader'),
      role(workspaceRoleId, ['page.update'], 'workspace-editor'),
      role(
        '99999999-9999-4999-8999-999999999999',
        ['site.update'],
        'other-workspace-editor',
      ),
    ];
    const assignments = [
      assignment(tenantAssignmentId, tenantRoleId, 'tenant'),
      assignment(workspaceAssignmentId, workspaceRoleId, 'workspace', workspaceId),
      assignment(
        '88888888-8888-4888-8888-888888888888',
        '99999999-9999-4999-8999-999999999999',
        'workspace',
        otherWorkspaceId,
      ),
    ];
    const assignmentModel = {
      find: () => ({ sort: () => modelReturning(assignments) }),
    };
    const roleModel = {
      find: (filter: { _id?: { $in?: string[] } }) =>
        modelReturning(
          filter._id?.$in
            ? roles.filter((item) => filter._id?.$in?.includes(item._id))
            : roles,
        ),
      findOne: () => modelReturning(null),
    };
    const membershipModel = { findOne: () => modelReturning(null) };
    const tenantContext = { require: () => ({ id: tenantId }) };
    const service = new AuthorizationService(
      roleModel as never,
      assignmentModel as never,
      membershipModel as never,
      tenantContext as never,
    );

    const effective = await service.getEffectivePermissions(
      'USER@EXAMPLE.COM',
      workspaceId,
    );

    expect(effective.permissions).toEqual(['page.update', 'site.read']);
    expect(effective.assignments).toHaveLength(2);
    await expect(
      service.can('user@example.com', otherWorkspaceId, 'page.update'),
    ).resolves.toBe(false);
  });

  it('falls back to the legacy membership role for pre-RBAC tenants', async () => {
    const roleRecord = role(tenantRoleId, ['page.read'], 'editor');
    const roleModel = {
      find: () => modelReturning([roleRecord]),
      findOne: () => modelReturning(roleRecord),
    };
    const assignmentModel = {
      find: () => ({ sort: () => modelReturning([]) }),
    };
    const membershipModel = {
      findOne: () =>
        modelReturning({
          _id: tenantAssignmentId,
          tenantId,
          userId: 'user@example.com',
          role: 'member',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
    };
    const tenantContext = { require: () => ({ id: tenantId }) };
    const service = new AuthorizationService(
      roleModel as never,
      assignmentModel as never,
      membershipModel as never,
      tenantContext as never,
    );

    await expect(service.can('user@example.com', workspaceId, 'page.read')).resolves.toBe(
      true,
    );
    await expect(
      service.can('user@example.com', workspaceId, 'page.publish'),
    ).resolves.toBe(false);
  });

  it('keeps extension management behind its explicit RBAC permission', async () => {
    const readRoleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const readRole = role(readRoleId, ['extensions.read'], 'viewer');
    const roleModel = {
      find: () => modelReturning([readRole]),
      findOne: () => modelReturning(null),
    };
    const assignmentModel = {
      find: () => ({
        sort: () =>
          modelReturning([assignment(tenantAssignmentId, readRoleId, 'tenant')]),
      }),
    };
    const membershipModel = { findOne: () => modelReturning(null) };
    const tenantContext = { require: () => ({ id: tenantId }) };
    const service = new AuthorizationService(
      roleModel as never,
      assignmentModel as never,
      membershipModel as never,
      tenantContext as never,
    );

    await expect(
      service.can('user@example.com', workspaceId, 'extensions.read'),
    ).resolves.toBe(true);
    await expect(
      service.can('user@example.com', workspaceId, 'extensions.manage'),
    ).resolves.toBe(false);
  });
});
