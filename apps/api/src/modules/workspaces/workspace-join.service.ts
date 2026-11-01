import { Injectable } from '@nestjs/common';
import { AppError } from '../../shared/errors.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { InvitationRecord } from './invitation.schema.js';
import { InvitationsRepository } from './invitations.repository.js';
import { WorkspacesRepository } from './workspaces.repository.js';

export const INVITATION_UNAVAILABLE = 'Lời mời không còn hiệu lực';

/**
 * Joins a workspace by an invitation, in the caller's transaction (ADR-021): the invitation closes
 * as accepted only while pending and not expired, so a link works once; then the membership is
 * added with the invitation's role and sites. Signing up from a link and accepting while signed in
 * both go through here.
 */
@Injectable()
export class WorkspaceJoin {
  constructor(
    private readonly invitations: InvitationsRepository,
    private readonly workspaces: WorkspacesRepository,
  ) {}

  async join(invitation: InvitationRecord, userId: ObjectId, now: Date, tx: Tx): Promise<void> {
    if (!(await this.invitations.claim(invitation, 'accepted', now, tx))) {
      throw new AppError(409, 'invitation_unavailable', INVITATION_UNAVAILABLE, {
        detail: 'Lời mời đã được dùng, bị thu hồi hoặc đã hết hạn. Hãy nhờ người mời gửi lại.',
      });
    }
    // A member already keeps their role: an invitation never lowers or raises it.
    await this.workspaces.joinByInvitation(
      invitation.workspaceId,
      userId,
      { role: invitation.role, siteIds: invitation.siteIds },
      now,
      tx,
    );
  }
}
