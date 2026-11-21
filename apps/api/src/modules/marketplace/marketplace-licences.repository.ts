import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  type MarketplaceLicenceSource,
  MAX_MARKETPLACE_ITEM_VERSIONS,
  MAX_MARKETPLACE_ITEMS,
} from '@plp/contracts';
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import type { LicenceVersionGroup } from './domain/licence-check.js';
import {
  MARKETPLACE_LICENCE_MODEL,
  MARKETPLACE_LICENCES_WORKSPACE_ITEM_INDEX,
  type MarketplaceLicenceRecord,
} from './marketplace-licence.schema.js';

/** A licence to grant: a free claim now, or a paid invoice's purchase (MP3). */
export interface NewMarketplaceLicence {
  itemId: string;
  source: MarketplaceLicenceSource;
  version: number;
  versionHash: string;
  /** The paid invoice of a purchase; null for a free claim. */
  invoiceId: ObjectId | null;
  termsVersion: number;
  /** Who claimed it, or who bought it (the invoice's `createdBy`). */
  grantedBy: ObjectId;
  at: Date;
}

/** A grant's outcome: the workspace's licence of the item, and whether this grant made it. */
export interface GrantedLicence {
  licence: MarketplaceLicenceRecord;
  /** False when the workspace held a licence of the item already: it is left as it was. */
  granted: boolean;
}

/** A licence moving to a newer version of its item ("Cập nhật", board 32). */
export interface LicenceVersionMove {
  /** The version it must still be at; another member may have moved it meanwhile. */
  from: number;
  to: number;
  versionHash: string;
  at: Date;
}

/**
 * The startup check reads at most this many groups. A valid licence names one of at most
 * 100 items × 20 versions with that version's single hash, so one group more proves a problem.
 */
const VERSION_GROUPS_READ = MAX_MARKETPLACE_ITEMS * MAX_MARKETPLACE_ITEM_VERSIONS + 1;

/**
 * `marketplace_licences` of the master DB (ADR-036). A workspace's licences are read and changed
 * through its scope; a grant also takes a master record's workspace, since a payment the gateway
 * reports names its invoice, not a member (MP3). Every method joins the caller's transaction
 * when given one, so a purchase's licence is granted with its paid invoice. Licences are never
 * deleted: the system has no way to take one back.
 */
@Injectable()
export class MarketplaceLicencesRepository {
  constructor(
    @InjectModel(MARKETPLACE_LICENCE_MODEL)
    private readonly licences: Model<MarketplaceLicenceRecord>,
  ) {}

  /** The workspace's licence of the item; null when it holds none. */
  find(ref: WorkspaceRef, itemId: string, tx?: Tx): Promise<MarketplaceLicenceRecord | null> {
    return this.licences
      .findOne({ workspaceId: ref.workspaceId, itemId })
      .session(tx ?? null)
      .lean<MarketplaceLicenceRecord>()
      .exec();
  }

  /** The workspace's licences of `itemIds`, at most one each, in the caller's transaction if any. */
  findOfItems(
    ref: WorkspaceRef,
    itemIds: readonly string[],
    tx?: Tx,
  ): Promise<MarketplaceLicenceRecord[]> {
    return this.licences
      .find({ workspaceId: ref.workspaceId, itemId: { $in: [...itemIds] } })
      .limit(MAX_MARKETPLACE_ITEMS)
      .session(tx ?? null)
      .lean<MarketplaceLicenceRecord[]>()
      .exec();
  }

  /**
   * Every licence of the workspace, withdrawn items included, the newest first. A workspace
   * holds at most one per item of the catalog.
   */
  listOf(scope: WorkspaceScope): Promise<MarketplaceLicenceRecord[]> {
    return this.licences
      .find({ workspaceId: scope.workspaceId })
      .sort({ grantedAt: -1, _id: -1 })
      .limit(MAX_MARKETPLACE_ITEMS)
      .lean<MarketplaceLicenceRecord[]>()
      .exec();
  }

  /**
   * Grants the licence unless the workspace holds one of the item already, which then stays as it
   * is (one licence per workspace and item, ADR-036). Two grants at once make one licence: the
   * unique index refuses the second, which finds the first. In a transaction, the second waits on
   * or conflicts with the first, and `TransactionRunner` runs it again, when it finds the licence.
   */
  async grant(ref: WorkspaceRef, licence: NewMarketplaceLicence, tx?: Tx): Promise<GrantedLicence> {
    const { at, ...fields } = licence;
    let granted: boolean;
    try {
      const result = await this.licences
        .updateOne(
          { workspaceId: ref.workspaceId, itemId: licence.itemId },
          {
            $setOnInsert: {
              ...fields,
              grantedAt: at,
              updatedAt: at,
              updatedBy: licence.grantedBy,
            },
          },
          { upsert: true },
        )
        .session(tx ?? null)
        .exec();
      granted = result.upsertedCount === 1;
    } catch (error) {
      // In a transaction the error has aborted it: only its caller may run it again.
      if (
        tx !== undefined ||
        !isDuplicateKeyError(error, MARKETPLACE_LICENCES_WORKSPACE_ITEM_INDEX)
      ) {
        throw error;
      }
      granted = false;
    }
    const stored = await this.find(ref, licence.itemId, tx);
    if (stored === null) {
      throw new Error(
        `The licence of ${licence.itemId} for workspace ${ref.workspaceId.toHexString()} was granted but cannot be read`,
      );
    }
    return { licence: stored, granted };
  }

  /**
   * Moves the workspace's licence of the item to a newer version, only from `move.from`; null
   * when it is no longer there (or the workspace holds none), and nothing changed.
   */
  moveVersion(
    scope: WorkspaceScope,
    itemId: string,
    move: LicenceVersionMove,
    tx?: Tx,
  ): Promise<MarketplaceLicenceRecord | null> {
    if (move.to <= move.from) {
      throw new Error(`A licence only moves forward (v${move.from} to v${move.to} asked)`);
    }
    return this.licences
      .findOneAndUpdate(
        { workspaceId: scope.workspaceId, itemId, version: move.from },
        {
          $set: {
            version: move.to,
            versionHash: move.versionHash,
            updatedAt: move.at,
            updatedBy: scope.userId,
          },
        },
        { returnDocument: 'after' },
      )
      .session(tx ?? null)
      .lean<MarketplaceLicenceRecord>()
      .exec();
  }

  /**
   * How many workspaces hold a licence of each of `itemIds` ("Được dùng nhiều"), on the
   * `{ itemId }` index; an item nobody holds is absent. At most one entry per item asked.
   */
  async countsOf(itemIds: readonly string[]): Promise<Map<string, number>> {
    if (itemIds.length === 0) {
      return new Map();
    }
    const groups = await this.licences
      .aggregate<{ _id: string; licences: number }>([
        { $match: { itemId: { $in: [...itemIds] } } },
        { $group: { _id: '$itemId', licences: { $sum: 1 } } },
      ])
      .exec();
    return new Map(groups.map((group) => [group._id, group.licences]));
  }

  /**
   * The item, version and hash every licence names, with how many name each: what the catalog
   * must still hold at startup (ADR-036). Grouped in the database, so it reads at most a group per
   * released version (`VERSION_GROUPS_READ`) whatever the number of licences.
   */
  async versionsInUse(): Promise<LicenceVersionGroup[]> {
    const groups = await this.licences
      .aggregate<{
        _id: { itemId: string; version: number; versionHash: string };
        licences: number;
      }>([
        {
          $group: {
            _id: { itemId: '$itemId', version: '$version', versionHash: '$versionHash' },
            licences: { $sum: 1 },
          },
        },
        { $sort: { '_id.itemId': 1, '_id.version': 1, '_id.versionHash': 1 } },
        { $limit: VERSION_GROUPS_READ },
      ])
      .exec();
    return groups.map((group) => ({ ...group._id, licences: group.licences }));
  }
}
