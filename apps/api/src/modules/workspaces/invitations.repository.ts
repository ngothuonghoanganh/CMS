import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { MEMBERS_MAX } from '@plp/contracts';
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import { purgeAfter } from './domain/member-rules.js';
import {
  INVITATION_MODEL,
  INVITATION_PENDING_EMAIL_INDEX,
  type InvitationRecord,
  type InvitationStatus,
} from './invitation.schema.js';
import type { WorkspaceScope } from './workspace-scope.js';

@Injectable()
export class InvitationsRepository {
  constructor(
    @InjectModel(INVITATION_MODEL) private readonly invitations: Model<InvitationRecord>,
  ) {}

  /** Stores a new invitation; false when the email has a pending one already. */
  async create(scope: WorkspaceScope, invitation: InvitationRecord): Promise<boolean> {
    if (!invitation.workspaceId.equals(scope.workspaceId)) {
      throw new Error('An invitation must belong to the workspace of its scope');
    }
    try {
      await this.invitations.create([invitation]);
      return true;
    } catch (error) {
      if (isDuplicateKeyError(error, INVITATION_PENDING_EMAIL_INDEX)) {
        return false;
      }
      throw error;
    }
  }

  /** Pending invitations, expired ones included, newest first; at most `MEMBERS_MAX`. */
  listPending(scope: WorkspaceScope): Promise<InvitationRecord[]> {
    return this.invitations
      .find({ workspaceId: scope.workspaceId, status: 'pending' })
      .sort({ createdAt: -1, _id: -1 })
      .limit(MEMBERS_MAX)
      .lean<InvitationRecord[]>()
      .exec();
  }

  countPending(scope: WorkspaceScope, tx?: Tx): Promise<number> {
    return this.invitations
      .countDocuments(
        { workspaceId: scope.workspaceId, status: 'pending' },
        tx ? { session: tx } : {},
      )
      .exec();
  }

  /** Stores a batch of invitations in the transaction that checked the member limit. */
  async insertMany(
    scope: WorkspaceScope,
    invitations: readonly InvitationRecord[],
    tx: Tx,
  ): Promise<void> {
    if (invitations.some((invitation) => !invitation.workspaceId.equals(scope.workspaceId))) {
      throw new Error('An invitation must belong to the workspace of its scope');
    }
    if (invitations.length > 0) {
      await this.invitations.insertMany([...invitations], { session: tx });
    }
  }

  /** Which of `emails` have a pending invitation. */
  async pendingEmails(
    scope: WorkspaceScope,
    emails: readonly string[],
    tx?: Tx,
  ): Promise<Set<string>> {
    const found = await this.invitations
      .find(
        { workspaceId: scope.workspaceId, status: 'pending', email: { $in: [...emails] } },
        { email: 1 },
      )
      .session(tx ?? null)
      .lean<Pick<InvitationRecord, 'email'>[]>()
      .exec();
    return new Set(found.map((invitation) => invitation.email));
  }

  findById(scope: WorkspaceScope, id: ObjectId): Promise<InvitationRecord | null> {
    return this.invitations
      .findOne({ _id: id, workspaceId: scope.workspaceId })
      .lean<InvitationRecord>()
      .exec();
  }

  /** The invitation of a link; no session, the token is the secret (ADR-021). */
  findByTokenHash(tokenHash: string): Promise<InvitationRecord | null> {
    return this.invitations.findOne({ tokenHash }).lean<InvitationRecord>().exec();
  }

  /** A new link for a pending invitation; the old one stops working. Null when not pending. */
  renew(
    scope: WorkspaceScope,
    id: ObjectId,
    link: { tokenHash: string; expiresAt: Date },
  ): Promise<InvitationRecord | null> {
    return this.invitations
      .findOneAndUpdate(
        { _id: id, workspaceId: scope.workspaceId, status: 'pending' },
        {
          $set: { ...link, sentAt: null, purgeAt: purgeAfter(link.expiresAt) },
        },
        { new: true },
      )
      .lean<InvitationRecord>()
      .exec();
  }

  async markSent(scope: WorkspaceScope, id: ObjectId, tokenHash: string, at: Date): Promise<void> {
    // Only for the link this email carried: a "Gửi lại" meanwhile sent a newer one.
    await this.invitations
      .updateOne({ _id: id, workspaceId: scope.workspaceId, tokenHash }, { $set: { sentAt: at } })
      .exec();
  }

  /** Revokes a pending invitation; false when it was not pending. */
  revoke(scope: WorkspaceScope, id: ObjectId, now: Date): Promise<boolean> {
    return this.close({ _id: id, workspaceId: scope.workspaceId }, 'revoked', now);
  }

  /**
   * Closes the invitation of a link as accepted or declined, once: only while it is pending, still
   * has that link (`tokenHash`: "Gửi lại" at the same moment ends the old one) and, for an
   * acceptance, is not expired. False when it was not.
   */
  claim(
    invitation: Pick<InvitationRecord, '_id' | 'tokenHash'>,
    status: Extract<InvitationStatus, 'accepted' | 'declined'>,
    now: Date,
    tx?: Tx,
  ): Promise<boolean> {
    const link = { _id: invitation._id, tokenHash: invitation.tokenHash };
    const filter = status === 'accepted' ? { ...link, expiresAt: { $gt: now } } : link;
    return this.close(filter, status, now, tx);
  }

  private async close(
    filter: Record<string, unknown>,
    status: Exclude<InvitationStatus, 'pending'>,
    now: Date,
    tx?: Tx,
  ): Promise<boolean> {
    const result = await this.invitations
      .updateOne(
        { ...filter, status: 'pending' },
        { $set: { status, closedAt: now, purgeAt: purgeAfter(now) } },
        tx ? { session: tx } : {},
      )
      .exec();
    return result.modifiedCount === 1;
  }
}
