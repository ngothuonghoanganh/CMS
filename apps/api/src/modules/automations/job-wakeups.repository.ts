import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, mongo } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  JOB_WAKEUP_MODEL,
  JOB_WAKEUPS_WORKSPACE_INDEX,
  type JobWakeupRecord,
  NOTHING_DUE,
} from './job-wakeup.schema.js';

/** A change stream on `job_wakeups`, as the scheduler reads it. */
export type WakeupStream = mongo.ChangeStream<JobWakeupRecord>;
export type WakeupChange = mongo.ChangeStreamDocument<JobWakeupRecord>;
export type WakeupResumeToken = mongo.ResumeToken;

/** The earliest due time of each workspace's queue, in the master (ADR-034). */
@Injectable()
export class JobWakeupsRepository {
  constructor(@InjectModel(JOB_WAKEUP_MODEL) private readonly wakeups: Model<JobWakeupRecord>) {}

  /**
   * Creates the workspace's document if it has none, before any transaction moves its time: an
   * upsert inside one would fail the whole transaction when two first events race.
   */
  async ensure(workspaceId: ObjectId): Promise<void> {
    try {
      await this.wakeups
        .updateOne(
          { workspaceId },
          { $setOnInsert: { dueAt: NOTHING_DUE, seq: 0 } },
          { upsert: true },
        )
        .exec();
    } catch (error) {
      if (!isDuplicateKeyError(error, JOB_WAKEUPS_WORKSPACE_INDEX)) {
        throw error;
      }
    }
  }

  /** New work at `at`: the workspace wakes then at the latest. In the event's transaction. */
  async bump(workspaceId: ObjectId, at: Date, tx?: Tx): Promise<void> {
    await this.wakeups
      .updateOne({ workspaceId }, { $min: { dueAt: at }, $inc: { seq: 1 } })
      .session(tx ?? null)
      .exec();
  }

  /** The earliest due time of all; `NOTHING_DUE` when no queue waits. */
  async earliest(): Promise<Date> {
    const first = await this.wakeups
      .findOne({}, { dueAt: 1 })
      .sort({ dueAt: 1 })
      .lean<Pick<JobWakeupRecord, 'dueAt'>>()
      .exec();
    return first?.dueAt ?? NOTHING_DUE;
  }

  /** The workspaces due by `now`, earliest first. */
  due(now: Date, limit: number): Promise<JobWakeupRecord[]> {
    return this.wakeups
      .find({ dueAt: { $lte: now } })
      .sort({ dueAt: 1 })
      .limit(limit)
      .lean<JobWakeupRecord[]>()
      .exec();
  }

  /**
   * Sets the time the workspace is due next once its due work ran, unless new work came meanwhile
   * (`seq` moved): false then, and the caller looks at the workspace again.
   */
  async settle(workspaceId: ObjectId, seq: number, next: Date | null): Promise<boolean> {
    const result = await this.wakeups
      .updateOne({ workspaceId, seq }, { $set: { dueAt: next ?? NOTHING_DUE } })
      .exec();
    return result.matchedCount === 1;
  }

  findOf(workspaceId: ObjectId): Promise<JobWakeupRecord | null> {
    return this.wakeups.findOne({ workspaceId }).lean<JobWakeupRecord>().exec();
  }

  /**
   * Every insert and change of the collection. The stream needs the replica set the API already
   * requires (ADR-006); `resumeAfter` picks up where a closed stream stopped.
   */
  watch(
    resumeAfter?: mongo.ResumeToken,
  ): mongo.ChangeStream<JobWakeupRecord, mongo.ChangeStreamDocument<JobWakeupRecord>> {
    return this.wakeups.collection.watch<JobWakeupRecord>(
      [{ $match: { operationType: { $in: ['insert', 'update', 'replace'] } } }],
      { fullDocument: 'updateLookup', ...(resumeAfter === undefined ? {} : { resumeAfter }) },
    );
  }
}
