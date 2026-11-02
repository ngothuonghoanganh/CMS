import { Injectable, Logger } from '@nestjs/common';
import {
  type AccessGrant,
  accessLabel,
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
import { accessDecisionEmail, accessRequestEmail } from '../notifications/emails.js';
import type { AccessRequestRecord } from '../workspaces/access-request.schema.js';
import { AccessRequestsRepository } from '../workspaces/access-requests.repository.js';
import { AccessService } from '../workspaces/access.service.js';
import { ACCESS_REQUESTS_PER_DAY } from '../workspaces/domain/member-rules.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import type { MembershipRecord } from '../workspaces/workspace.schema.js';
import type { CustomRoleRecord } from '../workspaces/custom-role.schema.js';
import { CustomRolesRepository } from '../workspaces/custom-roles.repository.js';
import { accessOf } from '../workspaces/domain/member-access.js';
import { WorkspaceLinks } from '../workspaces/workspace-links.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import { MEMBER_NOT_FOUND, MemberGrants, toMemberDto } from './member-grants.js';

const ACCESS_REQUEST_NOT_FOUND = 'Không tìm thấy yêu cầu đổi quyền';

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
  roles: ReadonlyMap<string, CustomRoleRecord>,
): AccessRequest {
  return {
    id: request._id.toHexString(),
    user: { id: contact._id.toHexString(), name: contact.name, email: contact.email },
    current: {
      role: accessOf(membership, roles),
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
    private readonly links: WorkspaceLinks,
    private readonly users: UsersRepository,
    private readonly grants: MemberGrants,
    private readonly customRoles: CustomRolesRepository,
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
    if (can(scope.access, 'members.manage')) {
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
    const [contacts, members, roles] = await Promise.all([
      this.users.findContacts(requests.map((request) => request.userId)),
      this.workspaces.listMembers(scope),
      this.customRoles.mapForWorkspace(scope),
    ]);
    const contactOf = new Map(contacts.map((contact) => [contact._id.toHexString(), contact]));
    const memberOf = new Map(members.map((member) => [member.userId.toHexString(), member]));
    return {
      items: requests.flatMap((request) => {
        const contact = contactOf.get(request.userId.toHexString());
        const membership = memberOf.get(request.userId.toHexString());
        return contact && membership
          ? [toAccessRequestDto(request, contact, membership, roles)]
          : [];
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
    const resolved = await this.grants.resolveGrant(scope, grant);
    // Read before the decision is stored: a failure afterwards would answer 500 for a request
    // already decided, which a retry then cannot find.
    const [[contact], roles] = await Promise.all([
      this.users.findContacts([request.userId]),
      this.customRoles.mapForWorkspace(scope),
    ]);
    if (!contact) {
      throw new Error(`Member ${request.userId.toHexString()} has no account`);
    }
    const now = new Date();
    const updated = await this.transactions.run(async (tx) => {
      if (!(await this.requests.decide(scope, request._id, 'accepted', now, tx))) {
        throw notFound(ACCESS_REQUEST_NOT_FOUND);
      }
      await this.grants.holdGrant(scope, resolved, tx);
      const membership = await this.workspaces.updateGrant(scope, request.userId, resolved, tx);
      if (!membership) {
        // The requester left, or became Chủ sở hữu, meanwhile.
        throw notFound(MEMBER_NOT_FOUND);
      }
      await this.grants.settle(scope, request.userId, resolved, tx);
      return membership;
    });
    const access = accessOf(updated, roles);
    await this.notifyRequester(scope, request, {
      accepted: true,
      roleLabel: accessLabel(access),
      siteIds: grant.siteIds,
    });
    return toMemberDto(updated, contact, access);
  }

  async decline(user: AuthenticatedUser, workspaceId: string, requestId: string): Promise<void> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'accessRequests.decide');
    const request = await this.findPending(scope, requestId);
    if (!(await this.requests.decide(scope, request._id, 'declined', new Date()))) {
      throw notFound(ACCESS_REQUEST_NOT_FOUND);
    }
    await this.notifyRequester(scope, request, { accepted: false });
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
    const [request, membership, [contact], roles] = await Promise.all([
      this.requests.findPendingOf(scope, scope.userId),
      this.workspaces.findMember(scope, scope.userId),
      this.users.findContacts([scope.userId]),
      this.customRoles.mapForWorkspace(scope),
    ]);
    return request && membership && contact
      ? toAccessRequestDto(request, contact, membership, roles)
      : null;
  }

  /** Emails Chủ sở hữu; true when it went out. The request stays on "Thành viên" either way. */
  private notifyOwner(
    scope: WorkspaceScope,
    request: AccessRequestRecord,
    requester: AuthenticatedUser,
  ): Promise<boolean> {
    return this.sendTo(scope, async () => {
      const [owner, workspace] = await Promise.all([
        this.workspaces.findOwner(scope),
        this.workspaces.findWorkspace(scope),
      ]);
      const [ownerContact] = owner ? await this.users.findContacts([owner.userId]) : [];
      if (!ownerContact || !workspace) {
        throw new Error(`Workspace ${scope.workspaceId.toHexString()} has no owner to ask`);
      }
      const reviewUrl = `${this.links.originFor(workspace)}/workspaces/${scope.workspaceId.toHexString()}/members?request=${request._id.toHexString()}`;
      return {
        to: [ownerContact.email],
        ...accessRequestEmail({
          requestId: request._id.toHexString(),
          workspaceName: workspace.name,
          requesterName: requester.name,
          requesterEmail: requester.email,
          currentRole: accessLabel(scope.access),
          requestedRole: roleLabels[request.role],
          scope: request.wholeWorkspace ? 'toàn workspace' : 'các site hiện tại',
          note: request.note,
          reviewUrl,
        }),
      };
    });
  }

  private async notifyRequester(
    scope: WorkspaceScope,
    request: Pick<AccessRequestRecord, '_id' | 'userId'>,
    decision:
      | { accepted: true; roleLabel: string; siteIds: readonly string[] | null }
      | { accepted: false },
  ): Promise<void> {
    await this.sendTo(scope, async () => {
      const [[requester], workspace, scopeLine] = await Promise.all([
        this.users.findContacts([request.userId]),
        this.workspaces.findWorkspace(scope),
        decision.accepted ? this.grants.scopeLine(scope, decision.siteIds) : '',
      ]);
      if (!requester || !workspace) {
        throw new Error(
          `Member ${request.userId.toHexString()} or workspace ${scope.workspaceId.toHexString()} is gone`,
        );
      }
      const common = {
        requestId: request._id.toHexString(),
        workspaceName: workspace.name,
        openUrl: `${this.links.originFor(workspace)}/`,
      };
      return {
        to: [requester.email],
        ...accessDecisionEmail(
          decision.accepted
            ? { ...common, accepted: true, roleLabel: decision.roleLabel, scope: scopeLine }
            : { ...common, accepted: false },
        ),
      };
    });
  }

  /**
   * Builds the email and sends it. Reading what it needs is part of it: a failure is logged, not
   * raised, since the decision or request is stored already.
   */
  private async sendTo(
    scope: WorkspaceScope,
    build: () => Promise<EmailMessage>,
  ): Promise<boolean> {
    try {
      await this.sender.send(await build());
      return true;
    } catch (error) {
      this.logger.warn(
        {
          workspaceId: scope.workspaceId.toHexString(),
          code: error instanceof EmailSendError ? error.code : 'unknown',
          err: error instanceof EmailSendError ? undefined : error,
        },
        'Access request email not sent',
      );
      return false;
    }
  }
}
