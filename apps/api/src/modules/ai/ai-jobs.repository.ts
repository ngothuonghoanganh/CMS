import { Injectable } from '@nestjs/common';
import {
  AI_RETRIES_PER_JOB,
  type AiBrief,
  type AiFailure,
  type AiSectionStatus,
} from '@plp/contracts';
import type { Model } from 'mongoose';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  WorkspaceDatabases,
  type WorkspaceRef,
} from '../../shared/persistence/workspace-databases.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import {
  AI_JOB_COLLECTION,
  AI_JOBS_RUNNING_INDEX,
  type AiJobRecord,
  type AiJobRunRecord,
  type AiJobSectionRecord,
} from './ai-job.schema.js';

export interface NewAiJob {
  siteId: ObjectId;
  title: string;
  slug: string;
  brief: AiBrief;
  sections: AiJobSectionRecord[];
  run: AiJobRunRecord;
  month: string;
  now: Date;
  expiresAt: Date;
}

/** How a run ends: the fields it sets besides clearing the run. */
export interface RunEnd {
  status: AiJobRecord['status'];
  sections: AiJobSectionRecord[];
  failure: AiFailure | null;
  pageId?: ObjectId;
  pageRevision?: number;
  /** The use was given back in the same transaction. */
  refunded?: true;
}

/** At most this many runs past their deadline are ended per read; more wait for the next one. */
const STALE_BATCH = 20;

/**
 * AI jobs of a workspace (ADR-031). Writes of a run name its id and need it to be running, so a
 * run that was cancelled or ended past its deadline can no longer change the job.
 */
@Injectable()
export class AiJobsRepository {
  constructor(private readonly databases: WorkspaceDatabases) {}

  async insert(scope: WorkspaceScope, input: NewAiJob, tx: Tx): Promise<AiJobRecord> {
    const [job] = await this.jobs(scope).create(
      [
        {
          workspaceId: scope.workspaceId,
          siteId: input.siteId,
          createdBy: scope.userId,
          title: input.title,
          slug: input.slug,
          brief: input.brief,
          sections: input.sections,
          status: 'running',
          run: input.run,
          quota: { month: input.month, refunded: false },
          pageId: null,
          pageRevision: null,
          retries: 0,
          failure: null,
          createdAt: input.now,
          updatedAt: input.now,
          expiresAt: input.expiresAt,
        },
      ],
      { session: tx },
    );
    if (!job) {
      throw new Error('AI job insert returned no document');
    }
    return job.toObject();
  }

  findInSite(scope: WorkspaceScope, siteId: ObjectId, id: ObjectId): Promise<AiJobRecord | null> {
    return this.jobs(scope)
      .findOne({ _id: id, workspaceId: scope.workspaceId, siteId })
      .lean<AiJobRecord>()
      .exec();
  }

  findById(ref: WorkspaceRef, id: ObjectId): Promise<AiJobRecord | null> {
    return this.jobs(ref)
      .findOne({ _id: id, workspaceId: ref.workspaceId })
      .lean<AiJobRecord>()
      .exec();
  }

  /** Runs whose deadline has passed: their runner has stopped, or its process has. */
  findStale(ref: WorkspaceRef, now: Date): Promise<AiJobRecord[]> {
    return this.jobs(ref)
      .find({ workspaceId: ref.workspaceId, status: 'running', 'run.deadline': { $lt: now } })
      .hint(AI_JOBS_RUNNING_INDEX)
      .limit(STALE_BATCH)
      .lean<AiJobRecord[]>()
      .exec();
  }

  /** Whether the run is still the job's: cancelled or ended past its deadline, it is not. */
  async isRunCurrent(ref: WorkspaceRef, jobId: ObjectId, runId: string): Promise<boolean> {
    const found = await this.jobs(ref)
      .exists({ _id: jobId, workspaceId: ref.workspaceId, status: 'running', 'run.id': runId })
      .exec();
    return found !== null;
  }

  /** A section's progress, while the run is the job's; false when it no longer is. */
  async setSectionStatus(
    ref: WorkspaceRef,
    jobId: ObjectId,
    runId: string,
    sectionId: string,
    status: AiSectionStatus,
    failure: AiFailure | null,
  ): Promise<boolean> {
    const result = await this.jobs(ref)
      .updateOne(
        { _id: jobId, workspaceId: ref.workspaceId, status: 'running', 'run.id': runId },
        {
          $set: {
            'sections.$[section].status': status,
            'sections.$[section].failure': failure,
            updatedAt: new Date(),
          },
        },
        { arrayFilters: [{ 'section.id': sectionId }] },
      )
      .exec();
    return result.matchedCount === 1;
  }

  /** Ends the run, while it is the job's. False when it was ended another way first. */
  async endRun(
    ref: WorkspaceRef,
    jobId: ObjectId,
    runId: string,
    end: RunEnd,
    tx: Tx,
  ): Promise<boolean> {
    const result = await this.jobs(ref)
      .updateOne(
        { _id: jobId, workspaceId: ref.workspaceId, status: 'running', 'run.id': runId },
        {
          $set: {
            status: end.status,
            sections: end.sections,
            failure: end.failure,
            run: null,
            updatedAt: new Date(),
            ...(end.pageId === undefined ? {} : { pageId: end.pageId }),
            ...(end.pageRevision === undefined ? {} : { pageRevision: end.pageRevision }),
            ...(end.refunded ? { 'quota.refunded': true } : {}),
          },
        },
        { session: tx },
      )
      .exec();
    return result.matchedCount === 1;
  }

  /**
   * Starts "Thử lại" on a finished job whose draft is still at the revision it wrote, while it has
   * retries left. Null when any of that changed since the job was read.
   */
  startRetry(
    scope: WorkspaceScope,
    job: Pick<AiJobRecord, '_id' | 'pageRevision' | 'retries'>,
    run: AiJobRunRecord,
    sections: AiJobSectionRecord[],
  ): Promise<AiJobRecord | null> {
    return this.jobs(scope)
      .findOneAndUpdate(
        {
          _id: job._id,
          workspaceId: scope.workspaceId,
          status: 'done',
          pageRevision: job.pageRevision,
          retries: { $eq: job.retries, $lt: AI_RETRIES_PER_JOB },
        },
        {
          $set: { status: 'running', run, sections, failure: null, updatedAt: new Date() },
          $inc: { retries: 1 },
        },
        { returnDocument: 'after' },
      )
      .lean<AiJobRecord>()
      .exec();
  }

  private jobs(ref: WorkspaceRef): Model<AiJobRecord> {
    return this.databases.model(ref, AI_JOB_COLLECTION);
  }
}
