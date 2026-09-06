import { describe, expect, it, vi } from 'vitest';

import { RoleService } from './role.service';
import {
  migrateLegacyPageDesignCapability,
  PHASE21_ROLE_CAPABILITY_MIGRATION_ID,
  ROLE_CAPABILITY_VERSION,
  seedSystemRoles,
} from './role-migrations';

type StoredRole = {
  _id: string;
  type: 'system' | 'custom';
  permissions: string[];
  capabilityVersion?: number;
};
type FakeRoleSet = Record<string, unknown> & {
  key?: string;
  permissions?: string[];
};
type FakeRoleUpdate = {
  $set?: FakeRoleSet;
  $addToSet?: { permissions?: string };
};

function result<T>(value: T) {
  return { exec: vi.fn().mockResolvedValue(value) };
}

function matches(record: Record<string, unknown>, filter: Record<string, unknown>) {
  return Object.entries(filter).every(([key, value]) => {
    if (typeof value === 'object' && value !== null && '$exists' in value) {
      return key in record === (value as { $exists: boolean }).$exists;
    }
    return record[key] === value;
  });
}

function roleModelFor(roles: StoredRole[]) {
  const updateOne = vi.fn((filter: Record<string, unknown>, update: FakeRoleUpdate) => {
    const role = roles.find((candidate) => matches(candidate, filter));
    if (role) {
      Object.assign(role, update.$set);
      if (
        update.$addToSet?.permissions &&
        !role.permissions.includes(update.$addToSet.permissions)
      ) {
        role.permissions.push(update.$addToSet.permissions);
      }
    }
    return result({ acknowledged: true });
  });
  const find = vi.fn((filter: Record<string, unknown>) => ({
    select: vi.fn(() => ({
      lean: vi.fn(() => result(roles.filter((role) => matches(role, filter)))),
    })),
  }));
  return { find, updateOne };
}

function migrationModelFor() {
  let marker: { _id: string; status: 'running' | 'complete' } | undefined;
  const findOneAndUpdate = vi.fn(() => {
    if (!marker) {
      marker = { _id: PHASE21_ROLE_CAPABILITY_MIGRATION_ID, status: 'running' };
    }
    return result(marker);
  });
  const updateOne = vi.fn(
    (_filter: unknown, update: { $set?: { status?: 'running' | 'complete' } }) => {
      if (marker && update.$set?.status) marker.status = update.$set.status;
      return result({ acknowledged: true });
    },
  );
  return {
    findOneAndUpdate,
    updateOne,
    marker: () => marker,
  } as never as {
    findOneAndUpdate: ReturnType<typeof vi.fn>;
    updateOne: ReturnType<typeof vi.fn>;
    marker: () => { _id: string; status: 'running' | 'complete' } | undefined;
  };
}

describe('Phase 21 role capability migration', () => {
  it('upgrades a legacy full-editor role once and records completion', async () => {
    const roles: StoredRole[] = [
      { _id: 'legacy', type: 'custom', permissions: ['page.read', 'page.update'] },
    ];
    const roleModel = roleModelFor(roles);
    const migrationModel = migrationModelFor();

    await migrateLegacyPageDesignCapability(roleModel, migrationModel as never);

    expect(roles[0]).toMatchObject({ capabilityVersion: ROLE_CAPABILITY_VERSION });
    expect(roles[0].permissions).toContain('page.design');
    expect(migrationModel.marker()).toMatchObject({ status: 'complete' });

    const mutationCount = roleModel.updateOne.mock.calls.length;
    await migrateLegacyPageDesignCapability(roleModel, migrationModel as never);
    expect(roleModel.updateOne).toHaveBeenCalledTimes(mutationCount);
  });

  it('does not mutate a new content-only role after the migration completed', async () => {
    const roles: StoredRole[] = [];
    const roleModel = roleModelFor(roles);
    const migrationModel = migrationModelFor();

    await migrateLegacyPageDesignCapability(roleModel, migrationModel as never);
    roles.push({
      _id: 'new-content',
      type: 'custom',
      permissions: ['page.read', 'page.update'],
      capabilityVersion: ROLE_CAPABILITY_VERSION,
    });
    await migrateLegacyPageDesignCapability(roleModel, migrationModel as never);

    expect(roles[0].permissions).not.toContain('page.design');
    expect(roleModel.updateOne).toHaveBeenCalledTimes(0);
  });

  it('does not re-add design after an administrator explicitly removes it', async () => {
    const roles: StoredRole[] = [
      {
        _id: 'legacy',
        type: 'custom',
        permissions: ['page.read', 'page.update', 'page.design'],
      },
    ];
    const roleModel = roleModelFor(roles);
    const migrationModel = migrationModelFor();

    await migrateLegacyPageDesignCapability(roleModel, migrationModel as never);
    roles[0].permissions = ['page.read', 'page.update'];
    await migrateLegacyPageDesignCapability(roleModel, migrationModel as never);

    expect(roles[0].permissions).toEqual(['page.read', 'page.update']);
  });

  it('keeps system Editor content-only while Owner and Admin retain design', async () => {
    const updates: FakeRoleUpdate[] = [];
    const roleModel = {
      updateOne: vi.fn((_filter: unknown, update: FakeRoleUpdate) => {
        updates.push(update);
        return result({ acknowledged: true });
      }),
    } as never;

    await seedSystemRoles(roleModel);

    const editor = updates.find((update) => update.$set?.key === 'editor');
    const owner = updates.find((update) => update.$set?.key === 'owner');
    const admin = updates.find((update) => update.$set?.key === 'admin');
    expect(editor?.$set.permissions).toContain('page.update');
    expect(editor?.$set.permissions).not.toContain('page.design');
    expect(owner?.$set.permissions).toContain('page.design');
    expect(admin?.$set.permissions).toContain('page.design');
  });

  it('does not expose recurring custom-role backfill through role seeding', async () => {
    const roleModel = {
      updateOne: vi.fn(() => result({ acknowledged: true })),
      updateMany: vi.fn(),
    } as never;
    const service = new RoleService(
      roleModel as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );

    await service.ensureSeeded();

    expect(
      (roleModel as { updateMany: ReturnType<typeof vi.fn> }).updateMany,
    ).not.toHaveBeenCalled();
  });
});
