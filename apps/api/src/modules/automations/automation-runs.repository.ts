import { Injectable } from '@nestjs/common';
import type { AutomationRunStatus } from '@plp/contracts';
import type { Model } from 'mongoose';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  WorkspaceDatabases,
  type WorkspaceRef,
} from '../../shared/persistence/workspace-databases.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { AUTOMATION_RUN_COLLECTION, type AutomationRunRecord } from './automation.schema.js';

/** Runs that wait for their turn; with `running`, the ones the queue may take (ADR-034). */
const WAITING: readonly AutomationRunStatus[] = ['scheduled', 'queued', 'waiting_retry'];

/** A run as an event creates it. */
export type NewRun = Pick<
  AutomationRunRecord,
  | 'siteId'
  | 'automationId'
  | 'version'
  | 'definition'
  | 'eventKey'
  | 'event'
  | 'contactId'
  | 'status'
  | 'createdAt'
  | 'expiresAt'
> & { nextAt: Date };

/** What a finished or rescheduled run writes; `nextAt: null` takes it out of the queue. */
export type RunUpdate = Partial<
  Pick<
    AutomationRunRecord,
    'status' | 'reason' | 'steps' | 'countedIn' | 'contactId' | 'finishedAt'
  >
> & { nextAt: Date | null };

/** Board 25's columns for one automation. */
export interface RunStats {
  last: { status: AutomationRunStatus; at: Date } | null;
  runs: number;
  failed: number;
}

/** The runs of automations: the queue itself (ADR-034). */
@Injectable()
export class AutomationRunsRepository {
  constructor(private readonly databases: WorkspaceDatabases) {}

  /**
   * One run per automation and event (`automation_runs_event_unique`): an event that comes again
   * changes nothing. In the caller's transaction, as the event is.
   */
  async enqueue(ref: WorkspaceRef, run: NewRun, tx?: Tx): Promise<void> {
    await this.runs(ref)
      .updateOne(
        { automationId: run.automationId, eventKey: run.eventKey },
        {
          $setOnInsert: {
            ...run,
            workspaceId: ref.workspaceId,
            reason: null,
            steps: run.definition.actions.map(() => ({
              status: 'pending',
              attempts: 0,
              at: null,
              error: null,
              summary: null,
            })),
            lockedUntil: null,
            countedIn: null,
            finishedAt: null,
          },
        },
        { upsert: true },
      )
      .session(tx ?? null)
      .exec();
  }

  /**
   * Takes the run due first: a waiting one, or a running one whose instance stopped before its
   * lock ended. The lock is also its `nextAt`, so another instance takes it once it lapses.
   */
  claimDue(ref: WorkspaceRef, now: Date, lockMs: number): Promise<AutomationRunRecord | null> {
    const lockedUntil = new Date(now.getTime() + lockMs);
    return this.runs(ref)
      .findOneAndUpdate(
        {
          workspaceId: ref.workspaceId,
          nextAt: { $lte: now },
          status: { $in: [...WAITING, 'running'] },
        },
        { $set: { status: 'running', lockedUntil, nextAt: lockedUntil } },
        { sort: { nextAt: 1 }, returnDocument: 'after' },
      )
      .lean<AutomationRunRecord>()
      .exec();
  }

  /** Writes what a run did, while it still holds its lock. False when another instance took it. */
  async save(
    ref: WorkspaceRef,
    run: Pick<AutomationRunRecord, '_id' | 'lockedUntil'>,
    update: RunUpdate,
    tx?: Tx,
  ): Promise<boolean> {
    const { nextAt, ...rest } = update;
    const result = await this.runs(ref)
      .updateOne(
        {
          _id: run._id,
          workspaceId: ref.workspaceId,
          status: 'running',
          lockedUntil: run.lockedUntil,
        },
        nextAt === null
          ? { $set: { ...rest, lockedUntil: null }, $unset: { nextAt: 1 } }
          : { $set: { ...rest, lockedUntil: null, nextAt } },
      )
      .session(tx ?? null)
      .exec();
    return result.modifiedCount === 1;
  }

  /** When the workspace's queue has work next; null when nothing waits. */
  async earliestDue(ref: WorkspaceRef): Promise<Date | null> {
    const next = await this.runs(ref)
      .findOne({ workspaceId: ref.workspaceId, nextAt: { $exists: true } }, { nextAt: 1 })
      .sort({ nextAt: 1 })
      .lean<Pick<AutomationRunRecord, 'nextAt'>>()
      .exec();
    return next?.nextAt ?? null;
  }

  /** "Tạm dừng": the automation's waiting runs stop; running ones finish their step. */
  async stopWaiting(ref: WorkspaceRef, automationId: ObjectId, at: Date, tx: Tx): Promise<void> {
    await this.runs(ref)
      .updateMany(
        { workspaceId: ref.workspaceId, automationId, status: { $in: [...WAITING] } },
        { $set: { status: 'stopped', reason: 'paused', finishedAt: at }, $unset: { nextAt: 1 } },
      )
      .session(tx)
      .exec();
  }

  /**
   * The last run of each automation, and its counted and failed runs since `since`: one indexed
   * read per automation for the last, one pass over the window for the counts.
   */
  async stats(
    scope: WorkspaceScope,
    automationIds: readonly ObjectId[],
    since: Date,
  ): Promise<Map<string, RunStats>> {
    if (automationIds.length === 0) {
      return new Map();
    }
    const [lasts, counts] = await Promise.all([
      Promise.all(
        automationIds.map((automationId) =>
          this.runs(scope)
            .findOne(
              { workspaceId: scope.workspaceId, automationId },
              { status: 1, createdAt: 1, finishedAt: 1 },
            )
            .sort({ createdAt: -1, _id: -1 })
            .lean<Pick<AutomationRunRecord, 'status' | 'createdAt' | 'finishedAt'>>()
            .exec(),
        ),
      ),
      this.runs(scope)
        .aggregate<{ _id: ObjectId; runs: number; failed: number }>([
          {
            $match: {
              workspaceId: scope.workspaceId,
              automationId: { $in: automationIds },
              createdAt: { $gte: since },
            },
          },
          {
            $group: {
              _id: '$automationId',
              runs: { $sum: { $cond: [{ $ne: ['$countedIn', null] }, 1, 0] } },
              failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
            },
          },
        ])
        .exec(),
    ]);
    const byId = new Map(counts.map((row) => [row._id.toHexString(), row]));
    return new Map(
      automationIds.map((id, index) => {
        const last = lasts[index] ?? null;
        const count = byId.get(id.toHexString());
        return [
          id.toHexString(),
          {
            last:
              last === null ? null : { status: last.status, at: last.finishedAt ?? last.createdAt },
            runs: count?.runs ?? 0,
            failed: count?.failed ?? 0,
          },
        ];
      }),
    );
  }

  private runs(ref: WorkspaceRef): Model<AutomationRunRecord> {
    return this.databases.model(ref, AUTOMATION_RUN_COLLECTION);
  }
}
