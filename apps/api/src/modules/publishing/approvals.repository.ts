import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { APPROVAL_MODEL, type ApprovalRecord } from './approval.schema.js';
import { approvalPurgeAt } from './domain/approval-rules.js';

/** Requests to publish (ADR-023); every query is scoped to the workspace. */
@Injectable()
export class ApprovalsRepository {
  constructor(@InjectModel(APPROVAL_MODEL) private readonly approvals: Model<ApprovalRecord>) {}

  /**
   * Stores the member's request in the caller's transaction. The unique index refuses a second
   * pending request of the page (`isDuplicateKeyError` with `APPROVAL_PENDING_INDEX`).
   */
  async create(scope: WorkspaceScope, approval: ApprovalRecord, tx: Tx): Promise<void> {
    if (
      !approval.workspaceId.equals(scope.workspaceId) ||
      !approval.requestedBy.equals(scope.userId)
    ) {
      throw new Error('A member asks for themselves, in the workspace of their scope');
    }
    await this.approvals.create([approval], { session: tx });
  }

  findPending(scope: WorkspaceScope, pageId: ObjectId, tx?: Tx): Promise<ApprovalRecord | null> {
    return this.approvals
      .findOne({ workspaceId: scope.workspaceId, pageId, status: 'pending' })
      .session(tx ?? null)
      .lean<ApprovalRecord>()
      .exec();
  }

  /** "Gửi lại yêu cầu": the sender's pending request now asks for this revision; null if closed. */
  resend(
    scope: WorkspaceScope,
    id: ObjectId,
    change: { revision: number; note: string; at: Date },
    tx: Tx,
  ): Promise<ApprovalRecord | null> {
    return this.approvals
      .findOneAndUpdate(
        { _id: id, workspaceId: scope.workspaceId, requestedBy: scope.userId, status: 'pending' },
        { $set: { revision: change.revision, note: change.note, sentAt: change.at } },
        { new: true, session: tx },
      )
      .lean<ApprovalRecord>()
      .exec();
  }

  /**
   * Closes the page's pending request with this id, once: withdrawn by its sender, or refused.
   * Null when it was no longer pending (published, refused or withdrawn meanwhile), or was sent
   * again for another revision than the one refused.
   */
  close(
    scope: WorkspaceScope,
    pageId: ObjectId,
    id: ObjectId,
    change:
      | { status: 'withdrawn'; at: Date }
      | { status: 'rejected'; at: Date; reason: string; revision: number; releaseSeq: number },
  ): Promise<ApprovalRecord | null> {
    return this.approvals
      .findOneAndUpdate(
        {
          _id: id,
          workspaceId: scope.workspaceId,
          pageId,
          status: 'pending',
          // Only the sender withdraws their request; a refusal answers the revision reviewed.
          ...(change.status === 'withdrawn'
            ? { requestedBy: scope.userId }
            : { revision: change.revision }),
        },
        {
          $set: {
            status: change.status,
            decidedAt: change.at,
            decidedBy: scope.userId,
            reason: change.status === 'rejected' ? change.reason : null,
            releaseSeq: change.status === 'rejected' ? change.releaseSeq : null,
            purgeAt: approvalPurgeAt(change.at),
          },
        },
        { new: true },
      )
      .lean<ApprovalRecord>()
      .exec();
  }

  /**
   * Publishing the page answers its pending request, in the publish transaction (ADR-023): the
   * release and the closed request commit together. Null when nothing was pending.
   */
  closeForRelease(
    scope: WorkspaceScope,
    pageId: ObjectId,
    releaseId: ObjectId,
    at: Date,
    tx: Tx,
  ): Promise<ApprovalRecord | null> {
    return this.approvals
      .findOneAndUpdate(
        { workspaceId: scope.workspaceId, pageId, status: 'pending' },
        {
          $set: {
            status: 'published',
            decidedAt: at,
            decidedBy: scope.userId,
            releaseId,
            purgeAt: approvalPurgeAt(at),
          },
        },
        { new: true, session: tx },
      )
      .lean<ApprovalRecord>()
      .exec();
  }

  /** The latest request of each page, keyed by page id: one aggregation for a whole list. */
  async latestOf(
    scope: WorkspaceScope,
    pageIds: readonly ObjectId[],
  ): Promise<Map<string, ApprovalRecord>> {
    if (pageIds.length === 0) {
      return new Map();
    }
    const rows = await this.approvals
      .aggregate<{ latest: ApprovalRecord }>([
        { $match: { workspaceId: scope.workspaceId, pageId: { $in: pageIds } } },
        { $sort: { pageId: 1, createdAt: -1, _id: -1 } },
        { $group: { _id: '$pageId', latest: { $first: '$$ROOT' } } },
      ])
      .exec();
    return new Map(rows.map(({ latest }) => [latest.pageId.toHexString(), latest]));
  }
}
