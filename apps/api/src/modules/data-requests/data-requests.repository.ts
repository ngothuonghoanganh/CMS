import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DATA_REQUEST_LOG_MAX } from '@plp/contracts';
import type { Model } from 'mongoose';
import {
  afterCursor,
  type KeysetPage,
  NEWEST_FIRST,
  toKeysetPage,
} from '../../shared/persistence/keyset.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import {
  DATA_REQUEST_MODEL,
  type DataRequestContact,
  type DataRequestLogRecord,
  type DataRequestRecord,
} from './data-request.schema.js';

export type NewDataRequest = Pick<
  DataRequestRecord,
  'contact' | 'search' | 'type' | 'receivedAt' | 'respondBy' | 'completeBy'
>;

/** A row of the list; the log is read with one request only. */
export type DataRequestListRow = Omit<DataRequestRecord, 'log'>;

/** How a request is completed: the log entry, and for a deletion the masked contact. */
export interface DataRequestCompletion {
  entry: DataRequestLogRecord;
  count: number | null;
  maskedContact: DataRequestContact | null;
}

/** The minimum needed to check access to a request through its site. */
export interface DataRequestAccessRef {
  workspaceId: ObjectId;
  siteId: ObjectId;
}

/** Appends one entry and keeps the newest `DATA_REQUEST_LOG_MAX`. */
function pushLog(entry: DataRequestLogRecord) {
  return { log: { $each: [entry], $slice: -DATA_REQUEST_LOG_MAX } };
}

@Injectable()
export class DataRequestsRepository {
  constructor(
    @InjectModel(DATA_REQUEST_MODEL) private readonly requests: Model<DataRequestRecord>,
  ) {}

  async insert(
    scope: WorkspaceScope,
    siteId: ObjectId,
    request: NewDataRequest,
    at: Date,
    tx: Tx,
  ): Promise<DataRequestRecord> {
    const [created] = await this.requests.create(
      [
        {
          ...request,
          workspaceId: scope.workspaceId,
          siteId,
          masked: false,
          status: 'open',
          respondedAt: null,
          completedAt: null,
          completedCount: null,
          log: [{ at, actorId: scope.userId, action: 'created', count: null }],
          createdBy: scope.userId,
          createdAt: at,
        },
      ],
      { session: tx },
    );
    if (created === undefined) {
      throw new Error('Inserting a data request returned no document');
    }
    return created.toObject();
  }

  /** The requests of a site, most recently recorded first, one keyset page at a time. */
  async listForSite(
    scope: WorkspaceScope,
    siteId: ObjectId,
    cursor: string | undefined,
    limit: number,
  ): Promise<KeysetPage<DataRequestListRow>> {
    const records = await this.requests
      .find({ $and: [{ workspaceId: scope.workspaceId, siteId }, afterCursor(cursor)] })
      .select({ log: 0 })
      .sort(NEWEST_FIRST)
      .limit(limit + 1)
      .lean<DataRequestListRow[]>()
      .exec();
    return toKeysetPage(records, limit);
  }

  /** Unscoped lookup by id that only returns where the request lives, for access checks. */
  async findAccessRef(id: ObjectId): Promise<DataRequestAccessRef | null> {
    const request = await this.requests
      .findById(id, { workspaceId: 1, siteId: 1 })
      .lean<Pick<DataRequestRecord, 'workspaceId' | 'siteId'>>()
      .exec();
    return request ? { workspaceId: request.workspaceId, siteId: request.siteId } : null;
  }

  findById(scope: WorkspaceScope, id: ObjectId): Promise<DataRequestRecord | null> {
    return this.requests
      .findOne({ _id: id, workspaceId: scope.workspaceId })
      .lean<DataRequestRecord>()
      .exec();
  }

  /** The person was answered; null when the request was no longer `open`. */
  markResponded(
    scope: WorkspaceScope,
    id: ObjectId,
    entry: DataRequestLogRecord,
  ): Promise<DataRequestRecord | null> {
    return this.requests
      .findOneAndUpdate(
        { _id: id, workspaceId: scope.workspaceId, status: 'open' },
        { $set: { status: 'responded', respondedAt: entry.at }, $push: pushLog(entry) },
        { returnDocument: 'after' },
      )
      .lean<DataRequestRecord>()
      .exec();
  }

  /** Logs a step of a request still being handled; false when it was completed meanwhile. */
  async appendLog(
    scope: WorkspaceScope,
    id: ObjectId,
    entry: DataRequestLogRecord,
  ): Promise<boolean> {
    const result = await this.requests
      .updateOne(
        { _id: id, workspaceId: scope.workspaceId, status: { $ne: 'completed' } },
        { $push: pushLog(entry) },
      )
      .exec();
    return result.matchedCount === 1;
  }

  /**
   * Completes a request not completed yet, in the caller's transaction; null when another
   * completion came first. Completing also counts as answering the person. With a masked contact
   * the search keys go too, so the request no longer finds anyone (ADR-017).
   */
  complete(
    scope: WorkspaceScope,
    id: ObjectId,
    completion: DataRequestCompletion,
    tx: Tx,
  ): Promise<DataRequestRecord | null> {
    const { entry, count, maskedContact } = completion;
    return this.requests
      .findOneAndUpdate(
        { _id: id, workspaceId: scope.workspaceId, status: { $in: ['open', 'responded'] } },
        [
          {
            $set: {
              status: 'completed',
              completedAt: entry.at,
              completedCount: { $literal: count },
              respondedAt: { $ifNull: ['$respondedAt', entry.at] },
              // `$literal`: values typed by people must never be read as expressions.
              log: {
                $slice: [
                  { $concatArrays: [{ $ifNull: ['$log', []] }, [{ $literal: entry }]] },
                  -DATA_REQUEST_LOG_MAX,
                ],
              },
              ...(maskedContact === null
                ? {}
                : { contact: { $literal: maskedContact }, masked: true, search: null }),
            },
          },
        ],
        { returnDocument: 'after', updatePipeline: true, session: tx },
      )
      .lean<DataRequestRecord>()
      .exec();
  }
}
