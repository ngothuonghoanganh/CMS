import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { MEMBERS_MAX } from '@plp/contracts';
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  ACCESS_REQUEST_MODEL,
  ACCESS_REQUEST_PENDING_INDEX,
  type AccessRequestRecord,
} from './access-request.schema.js';
import { purgeAfter } from './domain/member-rules.js';
import type { WorkspaceScope } from './workspace-scope.js';

@Injectable()
export class AccessRequestsRepository {
  constructor(
    @InjectModel(ACCESS_REQUEST_MODEL) private readonly requests: Model<AccessRequestRecord>,
  ) {}

  /** Stores the member's request; false when they have a pending one already. */
  async create(scope: WorkspaceScope, request: AccessRequestRecord): Promise<boolean> {
    if (!request.workspaceId.equals(scope.workspaceId) || !request.userId.equals(scope.userId)) {
      throw new Error('A member asks for themselves, in the workspace of their scope');
    }
    try {
      await this.requests.create([request]);
      return true;
    } catch (error) {
      if (isDuplicateKeyError(error, ACCESS_REQUEST_PENDING_INDEX)) {
        return false;
      }
      throw error;
    }
  }

  findPendingOf(scope: WorkspaceScope, userId: ObjectId): Promise<AccessRequestRecord | null> {
    return this.requests
      .findOne({ workspaceId: scope.workspaceId, userId, status: 'pending' })
      .lean<AccessRequestRecord>()
      .exec();
  }

  /** Pending requests, oldest first; one per member, so at most `MEMBERS_MAX`. */
  listPending(scope: WorkspaceScope): Promise<AccessRequestRecord[]> {
    return this.requests
      .find({ workspaceId: scope.workspaceId, status: 'pending' })
      .sort({ createdAt: 1, _id: 1 })
      .limit(MEMBERS_MAX)
      .lean<AccessRequestRecord[]>()
      .exec();
  }

  findPending(scope: WorkspaceScope, id: ObjectId): Promise<AccessRequestRecord | null> {
    return this.requests
      .findOne({ _id: id, workspaceId: scope.workspaceId, status: 'pending' })
      .lean<AccessRequestRecord>()
      .exec();
  }

  /** Records the decision, once; false when the request was no longer pending. */
  async decide(
    scope: WorkspaceScope,
    id: ObjectId,
    status: 'accepted' | 'declined',
    now: Date,
    tx?: Tx,
  ): Promise<boolean> {
    const result = await this.requests
      .updateOne(
        { _id: id, workspaceId: scope.workspaceId, status: 'pending' },
        { $set: { status, decidedAt: now, decidedBy: scope.userId, purgeAt: purgeAfter(now) } },
        tx ? { session: tx } : {},
      )
      .exec();
    return result.modifiedCount === 1;
  }

  /** A removed member's pending request goes with them. */
  async deletePendingOf(scope: WorkspaceScope, userId: ObjectId, tx: Tx): Promise<void> {
    await this.requests
      .deleteMany({ workspaceId: scope.workspaceId, userId, status: 'pending' }, { session: tx })
      .exec();
  }
}
