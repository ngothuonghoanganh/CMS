import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  WorkspaceDatabases,
  type WorkspaceRef,
} from '../../shared/persistence/workspace-databases.js';
import {
  AUTOMATION_USAGE_COLLECTION,
  AUTOMATION_USAGE_MONTH_INDEX,
  type AutomationUsageRecord,
} from './automation.schema.js';

/**
 * The monthly automation runs of a workspace (ADR-034), as the AI quota (ADR-031). A run is
 * counted once its conditions hold and its first action starts.
 */
@Injectable()
export class AutomationUsageRepository {
  constructor(private readonly databases: WorkspaceDatabases) {}

  /** Runs of the month so far; 0 before the first. */
  async usedIn(ref: WorkspaceRef, month: string): Promise<number> {
    const record = await this.usage(ref)
      .findOne({ workspaceId: ref.workspaceId, month }, { used: 1 })
      .lean<Pick<AutomationUsageRecord, 'used'>>()
      .exec();
    return record?.used ?? 0;
  }

  /**
   * Creates the month's counter at 0 if it does not exist, before the transaction that takes a run
   * from it: an upsert inside it would fail the whole transaction when two first runs race.
   */
  async ensureMonth(ref: WorkspaceRef, month: string, now: Date): Promise<void> {
    try {
      await this.usage(ref)
        .updateOne(
          { workspaceId: ref.workspaceId, month },
          { $setOnInsert: { used: 0, createdAt: now, updatedAt: now } },
          { upsert: true },
        )
        .exec();
    } catch (error) {
      // Another request created it at the same moment, which is all this asks for.
      if (!isDuplicateKeyError(error, AUTOMATION_USAGE_MONTH_INDEX)) {
        throw error;
      }
    }
  }

  /**
   * Takes one run while fewer than `limit` are taken: one conditional `$inc`, so runs at the same
   * time never take more than the limit. False when none is left.
   */
  async take(
    ref: WorkspaceRef,
    month: string,
    limit: number,
    now: Date,
    tx?: Tx,
  ): Promise<boolean> {
    const result = await this.usage(ref)
      .updateOne(
        { workspaceId: ref.workspaceId, month, used: { $lt: limit } },
        { $inc: { used: 1 }, $set: { updatedAt: now } },
      )
      .session(tx ?? null)
      .exec();
    return result.modifiedCount === 1;
  }

  private usage(ref: WorkspaceRef): Model<AutomationUsageRecord> {
    return this.databases.model(ref, AUTOMATION_USAGE_COLLECTION);
  }
}
