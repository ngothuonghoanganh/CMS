import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  WorkspaceDatabases,
  type WorkspaceRef,
} from '../../shared/persistence/workspace-databases.js';
import {
  AI_USAGE_COLLECTION,
  AI_USAGE_MONTH_INDEX,
  type AiUsageRecord,
} from './ai-usage.schema.js';

/**
 * The monthly AI counters of a workspace (ADR-031). A reference is a scope, or a workspace from
 * the master's list for the sweep at startup.
 */
@Injectable()
export class AiUsageRepository {
  constructor(private readonly databases: WorkspaceDatabases) {}

  /** Uses of the month so far; 0 before the first. */
  async usedIn(ref: WorkspaceRef, month: string): Promise<number> {
    const record = await this.usage(ref)
      .findOne({ workspaceId: ref.workspaceId, month }, { used: 1 })
      .lean<Pick<AiUsageRecord, 'used'>>()
      .exec();
    return record?.used ?? 0;
  }

  /**
   * Creates the month's counter at 0 if it does not exist, before the transaction that takes a use
   * from it: an upsert inside it would fail the whole transaction when two first uses race.
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
      if (!isDuplicateKeyError(error, AI_USAGE_MONTH_INDEX)) {
        throw error;
      }
    }
  }

  /**
   * Takes one use while fewer than `limit` are taken: one conditional `$inc`, so requests at the
   * same time never take more than the limit. False when none is left.
   */
  async take(ref: WorkspaceRef, month: string, limit: number, now: Date, tx: Tx): Promise<boolean> {
    const result = await this.usage(ref)
      .updateOne(
        { workspaceId: ref.workspaceId, month, used: { $lt: limit } },
        { $inc: { used: 1 }, $set: { updatedAt: now } },
        { session: tx },
      )
      .exec();
    return result.modifiedCount === 1;
  }

  /** Gives one use back to the month it was taken in, never below 0. */
  async giveBack(ref: WorkspaceRef, month: string, now: Date, tx: Tx): Promise<void> {
    await this.usage(ref)
      .updateOne(
        { workspaceId: ref.workspaceId, month, used: { $gt: 0 } },
        { $inc: { used: -1 }, $set: { updatedAt: now } },
        { session: tx },
      )
      .exec();
  }

  private usage(ref: WorkspaceRef): Model<AiUsageRecord> {
    return this.databases.model(ref, AI_USAGE_COLLECTION);
  }
}
