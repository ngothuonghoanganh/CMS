import { Injectable, Logger } from '@nestjs/common';
import {
  type AcceptInvitationResponse,
  type CreateInvitationsResponse,
  INVITATION_PATH,
  INVITATION_VALID_DAYS,
  type Invitation,
  type InvitationListResponse,
  type InvitationLookupResponse,
  type InvitationOutcome,
  MEMBERS_MAX,
  roleLabels,
} from '@plp/contracts';
import type { z } from 'zod';
import type { createInvitationsRequestSchema } from '@plp/contracts';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { AppError, notFound } from '../../shared/errors.js';
import { newObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { UsersRepository } from '../auth/users.repository.js';
import type { CountedHit } from '../leads/lead-limits.repository.js';
import { EmailQuota, type QuotaUse } from '../notifications/email-quota.js';
import { EmailSender, EmailSendError } from '../notifications/email-sender.js';
import { memberInvitationEmail } from '../notifications/email-templates.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { AccessService } from '../workspaces/access.service.js';
import {
  hashInvitationToken,
  INVITATION_EMAILS_PER_DAY,
  invitationExpiry,
  invitationLimitKeys,
  invitationState,
  newInvitationToken,
  purgeAfter,
} from '../workspaces/domain/member-rules.js';
import type { InvitationRecord } from '../workspaces/invitation.schema.js';
import { InvitationsRepository } from '../workspaces/invitations.repository.js';
import { INVITATION_UNAVAILABLE, WorkspaceJoin } from '../workspaces/workspace-join.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { storedGrant, WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import { MemberGrants } from './member-grants.js';

type CreateInvitationsValues = z.output<typeof createInvitationsRequestSchema>;

export const INVITATION_NOT_FOUND = 'Không tìm thấy lời mời';
const LINK_INVALID = 'Liên kết mời không hợp lệ';

const INVITATIONS: QuotaUse = {
  what: 'Invitation email',
  tooMany: () =>
    new AppError(429, 'rate_limited', 'Đã gửi quá nhiều lời mời', {
      detail: `Một workspace gửi tối đa ${INVITATION_EMAILS_PER_DAY.workspace} lời mời, một địa chỉ nhận tối đa ${INVITATION_EMAILS_PER_DAY.address} lời mời trong 24 giờ. Hãy thử lại sau.`,
    }),
};

function toInvitationDto(invitation: InvitationRecord, inviterName: string): Invitation {
  return {
    id: invitation._id.toHexString(),
    email: invitation.email,
    role: invitation.role,
    siteIds: invitation.siteIds?.map((id) => id.toHexString()) ?? null,
    invitedBy: { id: invitation.invitedBy.toHexString(), name: inviterName },
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
    sentAt: invitation.sentAt?.toISOString() ?? null,
  };
}

/**
 * Invitations to a workspace (board 15, 15b; ADR-021): a link by email, valid 7 days, once, for
 * the invited email only.
 */
@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly access: AccessService,
    private readonly invitations: InvitationsRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly users: UsersRepository,
    private readonly sites: SitesRepository,
    private readonly grants: MemberGrants,
    private readonly join: WorkspaceJoin,
    private readonly transactions: TransactionRunner,
    private readonly sender: EmailSender,
    private readonly quota: EmailQuota,
  ) {}

  async list(user: AuthenticatedUser, workspaceId: string): Promise<InvitationListResponse> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'members.manage');
    const invitations = await this.invitations.listPending(scope);
    const inviters = await this.users.findRefs(invitations.map((item) => item.invitedBy));
    return {
      items: invitations.map((item) =>
        toInvitationDto(item, inviters.get(item.invitedBy.toHexString())?.name ?? ''),
      ),
    };
  }

  /**
   * Invites up to 10 emails with one role and scope. Members and emails already invited are
   * reported, not invited again. The workspace holds at most `MEMBERS_MAX` people with its
   * pending invitations. Every email is counted against the daily limits first: over a limit,
   * nobody is invited (429).
   */
  async create(
    user: AuthenticatedUser,
    workspaceId: string,
    input: CreateInvitationsValues,
  ): Promise<CreateInvitationsResponse> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'members.manage');
    await this.grants.assertOwnSites(scope, input);
    const emails = [...new Set(input.emails)];
    const outcomes = new Map<string, InvitationOutcome>();
    const members = new Set(
      (await this.workspaces.listMembers(scope)).map((member) => member.userId.toHexString()),
    );
    for (const contact of await this.users.findContactsByEmail(emails)) {
      if (members.has(contact._id.toHexString())) {
        outcomes.set(contact.email, 'already_member');
      }
    }
    for (const email of await this.invitations.pendingEmails(scope, emails)) {
      outcomes.set(email, 'already_invited');
    }
    const fresh = emails.filter((email) => !outcomes.has(email));
    // Read before anything is counted or stored: the emails need them once the batch is saved.
    const workspaceName = (await this.workspaces.findWorkspace(scope))?.name ?? '';
    const scopeLine = await this.grants.scopeLine(scope, input.siteIds);
    const now = new Date();
    const counted = new Map<string, CountedHit[]>();
    try {
      for (const email of fresh) {
        counted.set(email, await this.quota.take(this.limitsOf(scope, email), INVITATIONS, now));
      }
    } catch (error) {
      await this.quota.giveBack([...counted.values()].flat(), INVITATIONS);
      throw error;
    }
    let created: Array<{ invitation: InvitationRecord; token: string }>;
    try {
      // The member limit and the new invitations in one transaction that writes the workspace:
      // two batches at once cannot both fit under the limit (ADR-021).
      created = await this.transactions.run(async (tx) => {
        await this.workspaces.recordInvitations(scope, tx);
        const pending = await this.invitations.pendingEmails(scope, fresh, tx);
        const toInvite = fresh.filter((email) => !pending.has(email));
        const taken =
          (await this.workspaces.countMembers(scope, tx)) +
          (await this.invitations.countPending(scope, tx));
        if (taken + toInvite.length > MEMBERS_MAX) {
          throw new AppError(
            409,
            'member_limit_reached',
            `Mỗi workspace có tối đa ${MEMBERS_MAX} người`,
            {
              detail: `Đang có ${taken} người, tính cả lời mời đang chờ. Thu hồi lời mời cũ hoặc gỡ bớt thành viên.`,
            },
          );
        }
        const batch = toInvite.map((email) => {
          const { token, tokenHash } = newInvitationToken();
          const expiresAt = invitationExpiry(now);
          const invitation: InvitationRecord = {
            _id: newObjectId(),
            workspaceId: scope.workspaceId,
            email,
            ...storedGrant(input),
            tokenHash,
            expiresAt,
            invitedBy: scope.userId,
            createdAt: now,
            sentAt: null,
            status: 'pending',
            closedAt: null,
            purgeAt: purgeAfter(expiresAt),
          };
          return { invitation, token };
        });
        await this.invitations.insertMany(
          scope,
          batch.map((item) => item.invitation),
          tx,
        );
        return batch;
      });
    } catch (error) {
      await this.quota.giveBack([...counted.values()].flat(), INVITATIONS);
      throw error;
    }
    const invited = new Set(created.map((item) => item.invitation.email));
    for (const email of fresh.filter((item) => !invited.has(item))) {
      // Invited by someone else meanwhile.
      await this.quota.giveBack(counted.get(email) ?? [], INVITATIONS);
      outcomes.set(email, 'already_invited');
    }
    for (const { invitation, token } of created) {
      const { sent } = await this.send(scope, invitation, token, {
        workspaceName,
        invitedBy: user.name,
        scope: scopeLine,
      });
      if (!sent) {
        await this.quota.giveBack(counted.get(invitation.email) ?? [], INVITATIONS);
      }
      outcomes.set(invitation.email, sent ? 'sent' : 'unsent');
    }
    return { results: emails.map((email) => ({ email, outcome: outcomes.get(email) ?? 'sent' })) };
  }

  /** A new link, valid 7 days again; the old link stops working. Expired invitations too. */
  async resend(
    user: AuthenticatedUser,
    workspaceId: string,
    invitationId: string,
  ): Promise<Invitation> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'members.manage');
    const id = toObjectId(invitationId, INVITATION_NOT_FOUND);
    const existing = await this.invitations.findById(scope, id);
    if (!existing || existing.status !== 'pending') {
      throw notFound(INVITATION_NOT_FOUND);
    }
    const now = new Date();
    const hits = await this.quota.take(this.limitsOf(scope, existing.email), INVITATIONS, now);
    const { token, tokenHash } = newInvitationToken();
    const renewed = await this.quota.giveBackOnError(hits, INVITATIONS, () =>
      this.invitations.renew(scope, id, { tokenHash, expiresAt: invitationExpiry(now) }),
    );
    if (!renewed) {
      // Accepted or revoked since it was read.
      await this.quota.giveBack(hits, INVITATIONS);
      throw notFound(INVITATION_NOT_FOUND);
    }
    const { sent, sentAt } = await this.send(scope, renewed, token, {
      workspaceName: (await this.workspaces.findWorkspace(scope))?.name ?? '',
      invitedBy: user.name,
      scope: await this.grants.scopeLine(
        scope,
        renewed.siteIds?.map((siteId) => siteId.toHexString()) ?? null,
      ),
    });
    if (!sent) {
      await this.quota.giveBack(hits, INVITATIONS);
    }
    const inviter = (await this.users.findRefs([renewed.invitedBy])).get(
      renewed.invitedBy.toHexString(),
    );
    return toInvitationDto({ ...renewed, sentAt }, inviter?.name ?? '');
  }

  async revoke(user: AuthenticatedUser, workspaceId: string, invitationId: string): Promise<void> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'members.manage');
    const id = toObjectId(invitationId, INVITATION_NOT_FOUND);
    if (!(await this.invitations.revoke(scope, id, new Date()))) {
      throw notFound(INVITATION_NOT_FOUND);
    }
  }

  /** What the invitation page shows to whoever holds the link; no session (board 15b). */
  async lookup(token: string): Promise<InvitationLookupResponse> {
    const invitation = await this.byToken(token);
    const [workspace, inviter, account, siteNames] = await Promise.all([
      this.workspaces.findWorkspaceForInvitation(invitation.workspaceId),
      this.users.findRefs([invitation.invitedBy]),
      this.users.findContactsByEmail([invitation.email]),
      invitation.siteIds === null
        ? null
        : this.sites.findNamesForInvitation(invitation.workspaceId, invitation.siteIds),
    ]);
    if (!workspace) {
      throw notFound(LINK_INVALID);
    }
    return {
      state: invitationState(invitation, new Date()),
      workspaceName: workspace.name,
      invitedByName: inviter.get(invitation.invitedBy.toHexString())?.name ?? '',
      email: invitation.email,
      role: invitation.role,
      siteNames,
      expiresAt: invitation.expiresAt.toISOString(),
      accountExists: account.length > 0,
    };
  }

  /** The signed-in user joins; their email must be the invited one. */
  async accept(user: AuthenticatedUser, token: string): Promise<AcceptInvitationResponse> {
    const invitation = await this.forUser(user, token);
    await this.transactions.run((tx) => this.join.join(invitation, user.id, new Date(), tx));
    return { workspaceId: invitation.workspaceId.toHexString() };
  }

  async decline(user: AuthenticatedUser, token: string): Promise<void> {
    const invitation = await this.forUser(user, token);
    if (!(await this.invitations.claim(invitation, 'declined', new Date()))) {
      throw new AppError(409, 'invitation_unavailable', INVITATION_UNAVAILABLE);
    }
  }

  private async byToken(token: string): Promise<InvitationRecord> {
    const invitation = await this.invitations.findByTokenHash(hashInvitationToken(token));
    if (!invitation) {
      throw notFound(LINK_INVALID);
    }
    return invitation;
  }

  private async forUser(user: AuthenticatedUser, token: string): Promise<InvitationRecord> {
    const invitation = await this.byToken(token);
    if (invitation.email !== user.email.toLowerCase()) {
      throw new AppError(403, 'invitation_email_mismatch', 'Lời mời này dành cho email khác', {
        detail: `Bạn đang đăng nhập bằng ${user.email}. Đăng xuất rồi dùng email được mời.`,
      });
    }
    return invitation;
  }

  private limitsOf(scope: WorkspaceScope, email: string) {
    const keys = invitationLimitKeys(email, scope.workspaceId);
    return [
      { key: keys.workspace, max: INVITATION_EMAILS_PER_DAY.workspace },
      { key: keys.address, max: INVITATION_EMAILS_PER_DAY.address },
    ];
  }

  /** Emails the link; `sent` when it went out. A failure keeps the invitation, unsent. */
  private async send(
    scope: WorkspaceScope,
    invitation: Pick<InvitationRecord, '_id' | 'email' | 'role' | 'tokenHash'>,
    token: string,
    context: { workspaceName: string; invitedBy: string; scope: string },
  ): Promise<{ sent: boolean; sentAt: Date | null }> {
    const email = memberInvitationEmail({
      ...context,
      roleLabel: roleLabels[invitation.role],
      acceptUrl: `${this.env.ADMIN_ORIGIN}${INVITATION_PATH}#token=${token}`,
      validDays: INVITATION_VALID_DAYS,
    });
    try {
      await this.sender.send({ to: [invitation.email], ...email });
    } catch (error) {
      this.logger.warn(
        {
          workspaceId: scope.workspaceId.toHexString(),
          invitationId: invitation._id.toHexString(),
          code: error instanceof EmailSendError ? error.code : 'unknown',
        },
        'Invitation email not sent',
      );
      return { sent: false, sentAt: null };
    }
    const sentAt = new Date();
    try {
      await this.invitations.markSent(scope, invitation._id, invitation.tokenHash, sentAt);
      return { sent: true, sentAt };
    } catch (error) {
      // The email went out: the link works. Only "Đã gửi" stays unset, here and on the list; the
      // other invitations of the batch are still sent.
      this.logger.warn(
        { err: error, invitationId: invitation._id.toHexString() },
        'Invitation sent but not marked as sent',
      );
      return { sent: true, sentAt: null };
    }
  }
}
