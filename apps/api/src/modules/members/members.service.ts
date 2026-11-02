import { Injectable } from '@nestjs/common';
import {
  type AccessGrant,
  type Member,
  type MemberListResponse,
  type RoleCounts,
  type TransferOwnershipRequest,
} from '@plp/contracts';
import { AppError, notFound, validationFailed } from '../../shared/errors.js';
import { type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { UsersRepository } from '../auth/users.repository.js';
import { AccessRequestsRepository } from '../workspaces/access-requests.repository.js';
import { AccessService, WORKSPACE_NOT_FOUND } from '../workspaces/access.service.js';
import { compareMembers } from '../workspaces/domain/member-rules.js';
import { InvitationsRepository } from '../workspaces/invitations.repository.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { CustomRolesRepository } from '../workspaces/custom-roles.repository.js';
import { accessOf } from '../workspaces/domain/member-access.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import { MEMBER_NOT_FOUND, MemberGrants, toMemberDto } from './member-grants.js';

const OWNER_PROTECTED = 'Không đổi được quyền của Chủ sở hữu';

/** Nobody changes or removes themselves: leaving a workspace is not offered (ADR-021). */
function refuseSelf(scope: WorkspaceScope, userId: ObjectId): void {
  if (userId.equals(scope.userId)) {
    throw new AppError(409, 'conflict', 'Không tự đổi quyền của mình được', {
      detail: 'Nhờ Chủ sở hữu hoặc một Quản trị khác đổi quyền hoặc gỡ bạn khỏi workspace.',
    });
  }
}

/** The people of a workspace and their roles (boards 15, 16; ADR-020, ADR-021). */
@Injectable()
export class MembersService {
  constructor(
    private readonly access: AccessService,
    private readonly workspaces: WorkspacesRepository,
    private readonly requests: AccessRequestsRepository,
    private readonly invitations: InvitationsRepository,
    private readonly users: UsersRepository,
    private readonly grants: MemberGrants,
    private readonly customRoles: CustomRolesRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  /**
   * Members per role, for the role list of "Vai trò & quyền", and all of them, for the count of
   * "Thành viên" in the sidebar (ADR-028).
   */
  async roleCounts(user: AuthenticatedUser, workspaceId: string): Promise<RoleCounts> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'members.manage');
    return this.workspaces.countByRole(scope);
  }

  async list(user: AuthenticatedUser, workspaceId: string): Promise<MemberListResponse> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'members.manage');
    return this.members(scope);
  }

  /** A new role and sites for a member; never Chủ sở hữu, who changes only by a transfer. */
  async update(
    user: AuthenticatedUser,
    workspaceId: string,
    userId: string,
    grant: AccessGrant,
  ): Promise<Member> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'members.manage');
    const id = toObjectId(userId, MEMBER_NOT_FOUND);
    const target = await this.workspaces.findMember(scope, id);
    if (!target) {
      throw notFound(MEMBER_NOT_FOUND);
    }
    if (target.role === 'owner') {
      throw new AppError(409, 'conflict', OWNER_PROTECTED, {
        detail: 'Chủ sở hữu chỉ đổi khi chuyển quyền sở hữu cho một Quản trị.',
      });
    }
    refuseSelf(scope, id);
    const resolved = await this.grants.resolveGrant(scope, grant);
    const updated = await this.transactions.run(async (tx) => {
      await this.grants.holdGrant(scope, resolved, tx);
      const membership = await this.workspaces.updateGrant(scope, id, resolved, tx);
      if (membership) {
        await this.grants.settle(scope, id, resolved, tx);
      }
      return membership;
    });
    if (!updated) {
      throw notFound(MEMBER_NOT_FOUND);
    }
    return this.dto(scope, updated);
  }

  /** Removes a member with their pending access request and invitations; never Chủ sở hữu. */
  async remove(user: AuthenticatedUser, workspaceId: string, userId: string): Promise<void> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'members.manage');
    const id = toObjectId(userId, MEMBER_NOT_FOUND);
    const target = await this.workspaces.findMember(scope, id);
    if (!target) {
      throw notFound(MEMBER_NOT_FOUND);
    }
    if (target.role === 'owner') {
      throw new AppError(409, 'conflict', 'Không thể gỡ Chủ sở hữu', {
        detail: 'Workspace cần một Chủ sở hữu. Hãy chuyển quyền sở hữu cho một Quản trị trước.',
      });
    }
    refuseSelf(scope, id);
    await this.transactions.run(async (tx) => {
      if (!(await this.workspaces.removeMember(scope, id, tx))) {
        throw notFound(MEMBER_NOT_FOUND);
      }
      await this.requests.deletePendingOf(scope, id, tx);
      await this.invitations.revokeSentBy(scope, id, new Date(), tx);
    });
  }

  /**
   * Chủ sở hữu hands the workspace to a Quản trị and becomes Quản trị, at once (ADR-021). The
   * workspace's name, typed again, confirms it.
   */
  async transferOwnership(
    user: AuthenticatedUser,
    workspaceId: string,
    input: TransferOwnershipRequest,
  ): Promise<MemberListResponse> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'workspace.transferOwnership');
    const workspace = await this.workspaces.findWorkspace(scope);
    if (!workspace) {
      throw notFound(WORKSPACE_NOT_FOUND);
    }
    if (input.confirmName !== workspace.name.trim()) {
      throw validationFailed([
        { path: ['confirmName'], code: 'mismatch', message: 'Tên workspace chưa đúng' },
      ]);
    }
    const to = toObjectId(input.toUserId, MEMBER_NOT_FOUND);
    const target = await this.workspaces.findMember(scope, to);
    if (!target) {
      throw notFound(MEMBER_NOT_FOUND);
    }
    if (target.role !== 'admin') {
      throw new AppError(409, 'conflict', 'Chỉ Quản trị mới nhận được quyền sở hữu', {
        detail: 'Đổi vai trò của người này thành Quản trị trước, rồi chuyển quyền sở hữu.',
      });
    }
    await this.transactions.run(async (tx) => {
      if (!(await this.workspaces.transferOwnership(scope, scope.userId, to, tx))) {
        throw new AppError(409, 'conflict', 'Vai trò đã đổi trong lúc chuyển', {
          detail: 'Tải lại danh sách thành viên rồi thử lại.',
        });
      }
      // Chủ sở hữu decides requests: one of their own could never be.
      await this.requests.deletePendingOf(scope, to, tx);
    });
    return this.members(scope);
  }

  private async members(scope: WorkspaceScope): Promise<MemberListResponse> {
    const [memberships, roles] = await Promise.all([
      this.workspaces.listMembers(scope),
      this.customRoles.mapForWorkspace(scope),
    ]);
    const contacts = new Map(
      (await this.users.findContacts(memberships.map((membership) => membership.userId))).map(
        (contact) => [contact._id.toHexString(), contact],
      ),
    );
    const items = memberships.flatMap((membership) => {
      const contact = contacts.get(membership.userId.toHexString());
      return contact ? [toMemberDto(membership, contact, accessOf(membership, roles))] : [];
    });
    return { items: items.sort(compareMembers) };
  }

  private async dto(
    scope: WorkspaceScope,
    membership: Parameters<typeof toMemberDto>[0],
  ): Promise<Member> {
    const [[contact], roles] = await Promise.all([
      this.users.findContacts([membership.userId]),
      this.customRoles.mapForWorkspace(scope),
    ]);
    if (!contact) {
      throw new Error(`Member ${membership.userId.toHexString()} has no account`);
    }
    return toMemberDto(membership, contact, accessOf(membership, roles));
  }
}
