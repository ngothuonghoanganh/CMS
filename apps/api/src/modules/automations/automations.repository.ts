import { Injectable } from '@nestjs/common';
import type { AutomationDefinition, AutomationRecipe, AutomationTriggerKind } from '@plp/contracts';
import type { Model } from 'mongoose';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  WorkspaceDatabases,
  type WorkspaceRef,
} from '../../shared/persistence/workspace-databases.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { AUTOMATION_COLLECTION, type AutomationRecord } from './automation.schema.js';

/** An automation as a recipe or "Nhân bản" creates it: always a draft. */
export interface NewAutomation {
  name: string;
  definition: AutomationDefinition;
  recipe: AutomationRecipe | null;
  at: Date;
}

/** The automations of a site (ADR-034); every read starts from the site. */
@Injectable()
export class AutomationsRepository {
  constructor(private readonly databases: WorkspaceDatabases) {}

  async insert(
    scope: WorkspaceScope,
    siteId: ObjectId,
    input: NewAutomation,
  ): Promise<AutomationRecord> {
    const created = await this.automations(scope).create({
      workspaceId: scope.workspaceId,
      siteId,
      name: input.name,
      state: 'draft',
      pausedReason: null,
      version: 1,
      definition: input.definition,
      triggerKind: input.definition.trigger.kind,
      recipe: input.recipe,
      rotation: 0,
      consecutiveFailures: 0,
      skippedForQuota: { month: '', count: 0 },
      createdBy: scope.userId,
      createdAt: input.at,
      updatedAt: input.at,
    });
    return created.toObject<AutomationRecord>();
  }

  countOfSite(scope: WorkspaceScope, siteId: ObjectId): Promise<number> {
    return this.automations(scope)
      .countDocuments({ workspaceId: scope.workspaceId, siteId })
      .exec();
  }

  /** Board 25, oldest first; a site holds at most `AUTOMATIONS_PER_SITE_MAX`. */
  listOfSite(scope: WorkspaceScope, siteId: ObjectId): Promise<AutomationRecord[]> {
    return this.automations(scope)
      .find({ workspaceId: scope.workspaceId, siteId })
      .sort({ createdAt: 1, _id: 1 })
      .lean<AutomationRecord[]>()
      .exec();
  }

  findById(ref: WorkspaceRef, siteId: ObjectId, id: ObjectId): Promise<AutomationRecord | null> {
    return this.automations(ref)
      .findOne({ _id: id, workspaceId: ref.workspaceId, siteId })
      .lean<AutomationRecord>()
      .exec();
  }

  /** The automations an event of the site starts: enabled, with this trigger. */
  listStartedBy(
    ref: WorkspaceRef,
    siteId: ObjectId,
    kind: AutomationTriggerKind,
    tx?: Tx,
  ): Promise<AutomationRecord[]> {
    return this.automations(ref)
      .find({ workspaceId: ref.workspaceId, siteId, state: 'on', triggerKind: kind })
      .session(tx ?? null)
      .lean<AutomationRecord[]>()
      .exec();
  }

  /**
   * "Bật" or "Tạm dừng" by a member. Enabling clears the reason and the failures in a row ("Bật lại
   * automation" resets the count, ADR-034). Null when the automation is gone.
   */
  setState(
    scope: WorkspaceScope,
    siteId: ObjectId,
    id: ObjectId,
    state: 'on' | 'paused',
    at: Date,
    tx: Tx,
  ): Promise<AutomationRecord | null> {
    return this.automations(scope)
      .findOneAndUpdate(
        { _id: id, workspaceId: scope.workspaceId, siteId },
        {
          $set: {
            state,
            pausedReason: state === 'paused' ? 'user' : null,
            ...(state === 'on' ? { consecutiveFailures: 0 } : {}),
            updatedAt: at,
          },
        },
        { returnDocument: 'after', session: tx },
      )
      .lean<AutomationRecord>()
      .exec();
  }

  /** The next member of an "assign" rotation: one atomic step, so two runs never pick the same. */
  async takeRotation(ref: WorkspaceRef, id: ObjectId): Promise<number> {
    const before = await this.automations(ref)
      .findOneAndUpdate(
        { _id: id, workspaceId: ref.workspaceId },
        { $inc: { rotation: 1 } },
        { returnDocument: 'before', projection: { rotation: 1 } },
      )
      .lean<Pick<AutomationRecord, 'rotation'>>()
      .exec();
    return before?.rotation ?? 0;
  }

  /** A run succeeded: the failures in a row start again from 0. */
  async clearFailures(ref: WorkspaceRef, id: ObjectId): Promise<void> {
    await this.automations(ref)
      .updateOne(
        { _id: id, workspaceId: ref.workspaceId, consecutiveFailures: { $gt: 0 } },
        { $set: { consecutiveFailures: 0 } },
      )
      .exec();
  }

  /**
   * A run failed for good. Returns the automation when this failure paused it (`limit` in a row):
   * one conditional update, so it pauses once.
   */
  async countFailure(
    ref: WorkspaceRef,
    id: ObjectId,
    limit: number,
    at: Date,
    tx: Tx,
  ): Promise<AutomationRecord | null> {
    const counted = await this.automations(ref)
      .findOneAndUpdate(
        { _id: id, workspaceId: ref.workspaceId },
        { $inc: { consecutiveFailures: 1 } },
        { returnDocument: 'after', session: tx },
      )
      .lean<AutomationRecord>()
      .exec();
    if (counted === null || counted.state !== 'on' || counted.consecutiveFailures < limit) {
      return null;
    }
    return this.automations(ref)
      .findOneAndUpdate(
        { _id: id, workspaceId: ref.workspaceId, state: 'on' },
        { $set: { state: 'paused', pausedReason: 'errors', updatedAt: at } },
        { returnDocument: 'after', session: tx },
      )
      .lean<AutomationRecord>()
      .exec();
  }

  /** An event passed over for the quota, counted per month. */
  async countSkippedForQuota(ref: WorkspaceRef, id: ObjectId, month: string): Promise<void> {
    await this.automations(ref)
      .updateOne(
        { _id: id, workspaceId: ref.workspaceId },
        [
          {
            $set: {
              skippedForQuota: {
                month,
                count: {
                  $cond: [
                    { $eq: ['$skippedForQuota.month', month] },
                    { $add: ['$skippedForQuota.count', 1] },
                    1,
                  ],
                },
              },
            },
          },
        ],
        { updatePipeline: true },
      )
      .exec();
  }

  private automations(ref: WorkspaceRef): Model<AutomationRecord> {
    return this.databases.model(ref, AUTOMATION_COLLECTION);
  }
}
