import { Injectable, Logger } from '@nestjs/common';
import {
  type AccessGrant,
  type AccessRequest,
  type AccessRequestListResponse,
  can,
  type CreateAccessRequest,
  type Member,
  type MyAccessRequestResponse,
  roleLabels,
} from '@plp/contracts';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { AppError, notFound } from '../../shared/errors.js';
import { newObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { type UserContact, UsersRepository } from '../auth/users.repository.js';
import { EmailQuota, type QuotaUse } from '../notifications/email-quota.js';
import { EmailSender, EmailSendError, type EmailMessage } from '../notifications/email-sender.js';
import { accessDecisionEmail, accessRequestEmail } from '../notifications/email-templates.js';
import type { AccessRequestRecord } from '../workspaces/access-request.schema.js';
import { AccessRequestsRepository } from '../workspaces/access-requests.repository.js';
import { AccessService } from '../workspaces/access.service.js';
import { ACCESS_REQUESTS_PER_DAY } from '../workspaces/domain/member-rules.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import type { MembershipRecord } from '../workspaces/workspace.schema.js';
import { storedGrant, WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import { MEMBER_NOT_FOUND, MemberGrants, toMemberDto } from './member-grants.js';

export const ACCESS_REQUEST_NOT_FOUND = 'Không tìm thấy yêu cầu đổi quyền';

const REQUESTS: QuotaUse = {
  what: 'Access request email',
  tooMany: () =>
    new AppError(429, 'rate_limited', 'Đã gửi quá nhiều yêu cầu đổi quyền', {
      detail: `Mỗi người gửi tối đa ${ACCESS_REQUESTS_PER_DAY} yêu cầu trong 24 giờ. Hãy thử lại sau.`,
    }),
};

function toAccessRequestDto(
  request: AccessRequestRecord,
  contact: UserContact,
  membership: MembershipRecord,
): AccessRequest {
  return {
    id: request._id.toHexString(),
    user: { id: contact._id.toHexString(), name: contact.name, email: contact.email },
    current: {
      role: membership.role,
      siteIds: membership.siteIds?.map((id) => id.toHexString()) ?? null,
    },
    role: request.role,
    wholeWorkspace: request.wholeWorkspace,
    note: request.note,
    createdAt: request.createdAt.toISOString(),
  };
}

/**
 * Requests for another role (ADR-021): a member without `members.manage` asks, Chủ sở hữu gets an
 * email and decides on "Thành viên". The email only opens the request; forwarding it grants
 * nothing.
 */
@Injectable()
export class AccessRequestsService {
  private readonly logger = new Logger(AccessRequestsService.name);

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly access: AccessService,
    private readonly requests: AccessRequestsRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly users: UsersRepository,
    private readonly grants: MemberGrants,
    private readonly transactions: TransactionRunner,
    private readonly sender: EmailSender,
    private readonly quota: EmailQuota,
  ) {}

  async mine(user: AuthenticatedUser, workspaceId: string): Promise<MyAccessRequestResponse> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    return { request: await this.pendingOf(scope) };
  }

  /** One pending request per member; Chủ sở hữu and Quản trị change roles themselves. */
  async create(
    user: AuthenticatedUser,
    workspaceId: string,
    input: CreateAccessRequest,
  ): Promise<MyAccessRequestResponse> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    if (can(scope.role, 'members.manage')) {
      throw new AppError(403, 'forbidden', 'Bạn tự đổi được quyền ở màn Thành viên');
    }
    const now = new Date();
    const hits = await this.quota.take(
      [{ key: `access-request:user:${user.id.toHexString()}`, max: ACCESS_REQUESTS_PER_DAY }],
      REQUESTS,
      now,
    );
    const request: AccessRequestRecord = {
      _id: newObjectId(),
      workspaceId: scope.workspaceId,
      userId: user.id,
      role: input.role,
      wholeWorkspace: input.wholeWorkspace,
      note: input.note,
      status: 'pending',
      createdAt: now,
      decidedAt: null,
      decidedBy: null,
      purgeAt: null,
    };
    const created = await this.quota.giveBackOnError(hits, REQUESTS, () =>
      this.requests.create(scope, request),
    );
    if (!created) {
      await this.quota.giveBack(hits, REQUESTS);
      throw new AppError(409, 'access_request_pending', 'Bạn đang có một yêu cầu chờ duyệt', {
        detail: 'Chủ sở hữu sẽ xem yêu cầu đó trước. Bạn sẽ nhận email khi có kết quả.',
      });
    }
    const sent = await this.notifyOwner(scope, request, user);
    if (!sent) {
      await this.quota.giveBack(hits, REQUESTS);
    }
    return { request: await this.pendingOf(scope) };
  }

  async list(user: AuthenticatedUser, workspaceId: string): Promise<AccessRequestListResponse> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'accessRequests.decide');
    const requests = await this.requests.listPending(scope);
    const [contacts, members] = await Promise.all([
      this.users.findContacts(requests.map((request) => request.userId)),
      this.workspaces.listMembers(scope),
    ]);
    const contactOf = new Map(contacts.map((contact) => [contact._id.toHexString(), contact]));
    const memberOf = new Map(members.map((member) => [member.userId.toHexString(), member]));
    return {
      items: requests.flatMap((request) => {
        const contact = contactOf.get(request.userId.toHexString());
        const membership = memberOf.get(request.userId.toHexString());
        return contact && membership ? [toAccessRequestDto(request, contact, membership)] : [];
      }),
    };
  }

  /**
   * Gives the requester the role and sites Chủ sở hữu decided, which may differ from what they
   * asked, and closes the request, in one transaction.
   */
  async accept(
    user: AuthenticatedUser,
    workspaceId: string,
    requestId: string,
    grant: AccessGrant,
  ): Promise<Member> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'accessRequests.decide');
    const request = await this.findPending(scope, requestId);
    await this.grants.assertOwnSites(scope, grant);
    const now = new Date();
    const updated = await this.transactions.run(async (tx) => {
      if (!(await this.requests.decide(scope, request._id, 'accepted', now, tx))) {
        throw notFound(ACCESS_REQUEST_NOT_FOUND);
      }
      const membership = await this.workspaces.updateGrant(
        scope,
        request.userId,
        storedGrant(grant),
        tx,
      );
      if (!membership) {
        // The requester left, or became Chủ sở hữu, meanwhile.
        throw notFound(MEMBER_NOT_FOUND);
      }
      return membership;
    });
    const [contact] = await this.users.findContacts([request.userId]);
    if (!contact) {
      throw new Error(`Member ${request.userId.toHexString()} has no account`);
    }
    await this.notifyRequester(scope, contact, {
      accepted: true,
      roleLabel: roleLabels[grant.role],
      scope: await this.grants.scopeLine(scope, grant.siteIds),
    });
    return toMemberDto(updated, contact);
  }

  async decline(user: AuthenticatedUser, workspaceId: string, requestId: string): Promise<void> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'accessRequests.decide');
    const request = await this.findPending(scope, requestId);
    if (!(await this.requests.decide(scope, request._id, 'declined', new Date()))) {
      throw notFound(ACCESS_REQUEST_NOT_FOUND);
    }
    const [contact] = await this.users.findContacts([request.userId]);
    if (contact) {
      await this.notifyRequester(scope, contact, { accepted: false, roleLabel: '', scope: '' });
    }
  }

  private async findPending(scope: WorkspaceScope, requestId: string) {
    const request = await this.requests.findPending(
      scope,
      toObjectId(requestId, ACCESS_REQUEST_NOT_FOUND),
    );
    if (!request) {
      throw notFound(ACCESS_REQUEST_NOT_FOUND);
    }
    return request;
  }

  private async pendingOf(scope: WorkspaceScope): Promise<AccessRequest | null> {
    const [request, membership, [contact]] = await Promise.all([
      this.requests.findPendingOf(scope, scope.userId),
      this.workspaces.findMember(scope, scope.userId),
      this.users.findContacts([scope.userId]),
    ]);
    return request && membership && contact
      ? toAccessRequestDto(request, contact, membership)
      : null;
  }

  /** Emails Chủ sở hữu; true when it went out. The request stays on "Thành viên" either way. */
  private async notifyOwner(
    scope: WorkspaceScope,
    request: AccessRequestRecord,
    requester: AuthenticatedUser,
  ): Promise<boolean> {
    const [owner, workspace] = await Promise.all([
      this.workspaces.findOwner(scope),
      this.workspaces.findWorkspace(scope),
    ]);
    const [ownerContact] = owner ? await this.users.findContacts([owner.userId]) : [];
    if (!ownerContact || !workspace) {
      throw new Error(`Workspace ${scope.workspaceId.toHexString()} has no owner to ask`);
    }
    const reviewUrl = `${this.env.ADMIN_ORIGIN}/workspaces/${scope.workspaceId.toHexString()}/members?request=${request._id.toHexString()}`;
    return this.sendTo(scope, {
      to: [ownerContact.email],
      ...accessRequestEmail({
        workspaceName: workspace.name,
        requesterName: requester.name,
        requesterEmail: requester.email,
        currentRole: roleLabels[scope.role],
        requestedRole: roleLabels[request.role],
        scope: request.wholeWorkspace ? 'toàn workspace' : 'các site hiện tại',
        note: request.note,
        reviewUrl,
      }),
    });
  }

  private async notifyRequester(
    scope: WorkspaceScope,
    requester: UserContact,
    decision: { accepted: boolean; roleLabel: string; scope: string },
  ): Promise<void> {
    const workspace = await this.workspaces.findWorkspace(scope);
    await this.sendTo(scope, {
      to: [requester.email],
      ...accessDecisionEmail({
        workspaceName: workspace?.name ?? '',
        ...decision,
        openUrl: `${this.env.ADMIN_ORIGIN}/`,
      }),
    });
  }

  /** A failed email is logged, not raised: the decision or request is stored already. */
  private async sendTo(scope: WorkspaceScope, message: EmailMessage): Promise<boolean> {
    try {
      await this.sender.send(message);
      return true;
    } catch (error) {
      this.logger.warn(
        {
          workspaceId: scope.workspaceId.toHexString(),
          code: error instanceof EmailSendError ? error.code : 'unknown',
        },
        'Access request email not sent',
      );
      return false;
    }
  }
}
