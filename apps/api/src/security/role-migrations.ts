import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

import { systemRoleDefinitions } from './role-defaults';
import type { RoleRecord, RoleDocument } from '../persistence/schemas/role.schema';
import type { TenantMigrationRecord } from '../persistence/schemas/tenant-migration.schema';

export const PHASE21_ROLE_CAPABILITY_MIGRATION_ID =
  'phase21-page-design-custom-role-backfill-v1';
export const ROLE_CAPABILITY_VERSION = 1;

type LegacyRole = Pick<RoleDocument, '_id' | 'permissions'> & {
  capabilityVersion?: number;
};

/** System personas are safe to reconcile on every bootstrap. */
export async function seedSystemRoles(roleModel: Model<RoleRecord>): Promise<void> {
  for (const role of systemRoleDefinitions) {
    await roleModel
      .updateOne(
        { key: role.key },
        {
          $set: { ...role, type: 'system' },
          $setOnInsert: { _id: randomUUID() },
        },
        { upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
  }
}

/**
 * Upgrade roles written before the page capability split exactly once per
 * tenant. New roles carry ROLE_CAPABILITY_VERSION at creation time, so their
 * current permission shape is never mistaken for legacy data.
 */
export async function migrateLegacyPageDesignCapability(
  roleModel: Model<RoleRecord>,
  migrationModel: Model<TenantMigrationRecord>,
): Promise<void> {
  const marker = await migrationModel
    .findOneAndUpdate(
      { _id: PHASE21_ROLE_CAPABILITY_MIGRATION_ID },
      {
        $setOnInsert: {
          _id: PHASE21_ROLE_CAPABILITY_MIGRATION_ID,
          status: 'running',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    .exec();
  if (!marker) throw new Error('TENANT_MIGRATION_MARKER_UNAVAILABLE');
  if (marker.status === 'complete') return;

  const legacyRoles = await roleModel
    .find({ type: 'custom', capabilityVersion: { $exists: false } })
    .select({ _id: 1, permissions: 1, capabilityVersion: 1 })
    .lean<LegacyRole[]>()
    .exec();

  for (const role of legacyRoles) {
    const hasPageUpdate = role.permissions.includes('page.update');
    await roleModel
      .updateOne(
        {
          _id: role._id,
          type: 'custom',
          capabilityVersion: { $exists: false },
        },
        {
          $set: { capabilityVersion: ROLE_CAPABILITY_VERSION },
          ...(hasPageUpdate ? { $addToSet: { permissions: 'page.design' } } : {}),
        },
      )
      .exec();
  }

  await migrationModel
    .updateOne(
      { _id: PHASE21_ROLE_CAPABILITY_MIGRATION_ID, status: { $ne: 'complete' } },
      { $set: { status: 'complete', completedAt: new Date() } },
    )
    .exec();
}

export async function seedTenantRoles(
  roleModel: Model<RoleRecord>,
  migrationModel: Model<TenantMigrationRecord>,
): Promise<void> {
  await seedSystemRoles(roleModel);
  await migrateLegacyPageDesignCapability(roleModel, migrationModel);
}
