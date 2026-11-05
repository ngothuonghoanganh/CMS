import { Injectable } from '@nestjs/common';
import {
  type LostReason,
  type OpenOpportunityStage,
  openOpportunityStages,
  type OpportunityStage,
} from '@plp/contracts';
import type { Model, QueryFilter } from 'mongoose';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  WorkspaceDatabases,
  type WorkspaceRef,
} from '../../shared/persistence/workspace-databases.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import {
  OPPORTUNITY_COLLECTION,
  type OpportunityRecord,
  type OpportunityWon,
} from './opportunity.schema.js';

/** Most recently moved first: every column and a profile's list. */
const RECENT_MOVE = { stageChangedAt: -1, _id: -1 } as const;

/** An opportunity as it is opened: by a lead, a member, or the backfill. */
export type NewOpportunity = Pick<
  OpportunityRecord,
  'title' | 'stage' | 'value' | 'valueBy' | 'won' | 'lost' | 'ownerId' | 'sourcePageId'
> & { at: Date; expiresAt: Date | null };

/** What a move writes besides the stage. */
export interface StageChange {
  stage: OpportunityStage;
  won: OpportunityWon | null;
  lost: { reason: LostReason; note: string } | null;
  at: Date;
}

/** Count and value of a column; won ones count their actual value. */
export interface ColumnTotal {
  stage: OpportunityStage;
  count: number;
  total: number;
}

/** The board's scope: the open stages, and the closed ones since the month started. */
export interface BoardScope {
  ownerId: ObjectId | null;
  closedSince: Date;
}

@Injectable()
export class OpportunitiesRepository {
  constructor(private readonly databases: WorkspaceDatabases) {}

  async insert(
    ref: WorkspaceRef,
    siteId: ObjectId,
    contactId: ObjectId,
    opportunity: NewOpportunity,
    tx: Tx,
  ): Promise<OpportunityRecord> {
    const { at, ...fields } = opportunity;
    const [created] = await this.opportunities(ref).create(
      [
        {
          ...fields,
          workspaceId: ref.workspaceId,
          siteId,
          contactId,
          stageChangedAt: at,
          createdAt: at,
        },
      ],
      { session: tx },
    );
    if (!created) {
      throw new Error('Creating an opportunity returned nothing');
    }
    return created.toObject<OpportunityRecord>();
  }

  findById(
    scope: WorkspaceRef,
    siteId: ObjectId,
    id: ObjectId,
    tx?: Tx,
  ): Promise<OpportunityRecord | null> {
    return this.opportunities(scope)
      .findOne({ _id: id, workspaceId: scope.workspaceId, siteId })
      .session(tx ?? null)
      .lean<OpportunityRecord>()
      .exec();
  }

  findByIds(
    scope: WorkspaceScope,
    siteId: ObjectId,
    ids: readonly ObjectId[],
  ): Promise<OpportunityRecord[]> {
    return this.opportunities(scope)
      .find({ _id: { $in: ids }, workspaceId: scope.workspaceId, siteId })
      .lean<OpportunityRecord[]>()
      .exec();
  }

  /** The profile's open opportunity moved last: where a new lead or task goes (ADR-033). */
  findOpenOfContact(
    ref: WorkspaceRef,
    siteId: ObjectId,
    contactId: ObjectId,
    tx?: Tx,
  ): Promise<OpportunityRecord | null> {
    return this.opportunities(ref)
      .findOne({
        workspaceId: ref.workspaceId,
        siteId,
        contactId,
        stage: { $in: [...openOpportunityStages] },
      })
      .sort(RECENT_MOVE)
      .session(tx ?? null)
      .lean<OpportunityRecord>()
      .exec();
  }

  /**
   * Moves the opportunity if it still is in `from`; null when it moved meanwhile or is gone.
   * Reopening clears what closing wrote.
   */
  move(
    ref: WorkspaceRef,
    siteId: ObjectId,
    id: ObjectId,
    from: OpportunityStage,
    change: StageChange,
    tx: Tx,
  ): Promise<OpportunityRecord | null> {
    return this.opportunities(ref)
      .findOneAndUpdate(
        { _id: id, workspaceId: ref.workspaceId, siteId, stage: from },
        {
          $set: {
            stage: change.stage,
            won: change.won,
            lost: change.lost,
            stageChangedAt: change.at,
          },
        },
        { returnDocument: 'after', session: tx },
      )
      .lean<OpportunityRecord>()
      .exec();
  }

  update(
    scope: WorkspaceRef,
    siteId: ObjectId,
    id: ObjectId,
    changes: Partial<Pick<OpportunityRecord, 'title' | 'value' | 'valueBy' | 'ownerId'>>,
  ): Promise<OpportunityRecord | null> {
    return this.opportunities(scope)
      .findOneAndUpdate(
        { _id: id, workspaceId: scope.workspaceId, siteId },
        { $set: changes },
        { returnDocument: 'after' },
      )
      .lean<OpportunityRecord>()
      .exec();
  }

  /** The cards of one column, most recently moved first. */
  column(
    scope: WorkspaceScope,
    siteId: ObjectId,
    stage: OpportunityStage,
    board: BoardScope,
    limit: number,
  ): Promise<OpportunityRecord[]> {
    return this.opportunities(scope)
      .find(this.columnFilter(scope, siteId, stage, board))
      .sort(RECENT_MOVE)
      .limit(limit)
      .lean<OpportunityRecord[]>()
      .exec();
  }

  /** Count and value of every column in one pass over the board's index. */
  async totals(
    scope: WorkspaceScope,
    siteId: ObjectId,
    stages: readonly OpportunityStage[],
    board: BoardScope,
  ): Promise<ColumnTotal[]> {
    const rows = await this.opportunities(scope)
      .aggregate<{ _id: OpportunityStage; count: number; total: number }>([
        { $match: { $or: stages.map((stage) => this.columnFilter(scope, siteId, stage, board)) } },
        {
          $group: {
            _id: '$stage',
            count: { $sum: 1 },
            total: {
              $sum: {
                $ifNull: [{ $cond: [{ $eq: ['$stage', 'won'] }, '$won.value', '$value'] }, 0],
              },
            },
          },
        },
      ])
      .exec();
    const byStage = new Map(rows.map((row) => [row._id, row]));
    return stages.map((stage) => ({
      stage,
      count: byStage.get(stage)?.count ?? 0,
      total: byStage.get(stage)?.total ?? 0,
    }));
  }

  /** A profile's opportunities, open ones first, then by their last move. */
  async ofContact(
    scope: WorkspaceScope,
    siteId: ObjectId,
    contactId: ObjectId,
    limit: number,
  ): Promise<OpportunityRecord[]> {
    const all = await this.opportunities(scope)
      .find({ workspaceId: scope.workspaceId, siteId, contactId })
      .sort(RECENT_MOVE)
      .limit(limit * 4)
      .lean<OpportunityRecord[]>()
      .exec();
    const open = all.filter((item) => isOpen(item.stage));
    const closed = all.filter((item) => !isOpen(item.stage));
    return [...open, ...closed].slice(0, limit);
  }

  /** The "Cơ hội" column of board 22: per profile, its open one moved last, else its latest. */
  async latestOfContacts(
    scope: WorkspaceScope,
    siteId: ObjectId,
    contactIds: readonly ObjectId[],
  ): Promise<Map<string, OpportunityRecord>> {
    if (contactIds.length === 0) {
      return new Map();
    }
    const rows = await this.opportunities(scope)
      .aggregate<{ _id: ObjectId; opportunity: OpportunityRecord }>([
        { $match: { workspaceId: scope.workspaceId, siteId, contactId: { $in: contactIds } } },
        { $set: { open: { $in: ['$stage', [...openOpportunityStages]] } } },
        { $sort: { contactId: 1, open: -1, stageChangedAt: -1, _id: -1 } },
        { $group: { _id: '$contactId', opportunity: { $first: '$$ROOT' } } },
      ])
      .exec();
    return new Map(rows.map((row) => [row._id.toHexString(), row.opportunity]));
  }

  private columnFilter(
    scope: WorkspaceScope,
    siteId: ObjectId,
    stage: OpportunityStage,
    board: BoardScope,
  ): QueryFilter<OpportunityRecord> {
    return {
      workspaceId: scope.workspaceId,
      siteId,
      stage,
      ...(isOpen(stage) ? {} : { stageChangedAt: { $gte: board.closedSince } }),
      ...(board.ownerId === null ? {} : { ownerId: board.ownerId }),
    };
  }

  private opportunities(ref: WorkspaceRef): Model<OpportunityRecord> {
    return this.databases.model(ref, OPPORTUNITY_COLLECTION);
  }
}

function isOpen(stage: OpportunityStage): stage is OpenOpportunityStage {
  return stage !== 'won' && stage !== 'lost';
}
