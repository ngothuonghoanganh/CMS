import type { Model } from 'mongoose';

import type { CollectionRecord } from '../persistence/schemas/collection.schema';
import type { NavigationRecord } from '../persistence/schemas/navigation.schema';

/** Backfill the ownership discriminator before reconciling tenant indexes. */
export async function syncOwnershipIndexes(
  collections: Model<CollectionRecord>,
  navigations: Model<NavigationRecord>,
): Promise<void> {
  await collections
    .updateMany(
      { ownershipScope: { $exists: false }, siteId: { $exists: true } },
      { $set: { ownershipScope: 'site' } },
    )
    .exec();
  await collections
    .updateMany(
      { ownershipScope: { $exists: false }, siteId: { $exists: false } },
      { $set: { ownershipScope: 'workspace' } },
    )
    .exec();
  await navigations
    .updateMany(
      { ownershipScope: { $exists: false }, siteId: { $exists: true } },
      { $set: { ownershipScope: 'site' } },
    )
    .exec();
  await navigations
    .updateMany(
      { ownershipScope: { $exists: false }, siteId: { $exists: false } },
      { $set: { ownershipScope: 'workspace' } },
    )
    .exec();
  await collections.syncIndexes();
  await navigations.syncIndexes();
}
