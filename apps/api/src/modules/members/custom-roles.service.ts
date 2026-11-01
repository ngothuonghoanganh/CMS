import { Injectable } from '@nestjs/common';
import {
  CUSTOM_ROLES_MAX,
  type CustomRole,
  type CustomRoleInput,
  type CustomRoleListResponse,
} from '@plp/contracts';
import { AppError, notFound } from '../../shared/errors.js';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import { newObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { AccessService } from '../workspaces/access.service.js';
import {
  CUSTOM_ROLE_NAME_INDEX,
  type CustomRoleRecord,
  customRoleNameKey,
} from '../workspaces/custom-role.schema.js';
import { CustomRolesRepository } from '../workspaces/custom-roles.repository.js';
import { InvitationsRepository } from '../workspaces/invitations.repository.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';

export const CUSTOM_ROLE_NOT_FOUND = 'Không tìm thấy vai trò';

/**
 * Runs a write of a role's name; the workspace having the name already is answered once its
 * transaction has ended (a write error aborts it).
 */
async function namingRole<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isDuplicateKeyError(error, CUSTOM_ROLE_NAME_INDEX)) {
      throw new AppError(409, 'conflict', 'Đã có vai trò tên này', {
        detail: 'Workspace đã có một vai trò tên này. Chọn một tên khác.',
        cause: error,
      });
    }
    throw error;
  }
}

function toCustomRoleDto(
  role: CustomRoleRecord,
  memberCount: number,
  invitationCount: number,
): CustomRole {
  return {
    id: role._id.toHexString(),
    name: role.name,
    basedOn: role.basedOn,
    permissions: role.permissions,
    wholeWorkspace: role.wholeWorkspace,
    memberCount,
    invitationCount,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}

/**
 * Custom roles (board 16, ADR-024): Chủ sở hữu and Quản trị create them from a system role and
 * switch permissions; whoever holds one has the new permissions at their next request.
 */
@Injectable()
export class CustomRolesService {
  constructor(
    private readonly access: AccessService,
    private readonly roles: CustomRolesRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly invitations: InvitationsRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  async list(user: AuthenticatedUser, workspaceId: string): Promise<CustomRoleListResponse> {
    const scope = await this.manager(user, workspaceId);
    const [roles, members, invited] = await Promise.all([
      this.roles.list(scope),
      this.workspaces.countByCustomRole(scope),
      this.invitations.countPendingByCustomRole(scope),
    ]);
    return {
      items: roles.map((role) => {
        const id = role._id.toHexString();
        return toCustomRoleDto(role, members.get(id) ?? 0, invited.get(id) ?? 0);
      }),
    };
  }

  /** At most `CUSTOM_ROLES_MAX` per workspace, counted in a transaction that writes it. */
  async create(
    user: AuthenticatedUser,
    workspaceId: string,
    input: CustomRoleInput,
  ): Promise<CustomRole> {
    const scope = await this.manager(user, workspaceId);
    const now = new Date();
    const role: CustomRoleRecord = {
      _id: newObjectId(),
      workspaceId: scope.workspaceId,
      name: input.name,
      nameKey: customRoleNameKey(input.name),
      basedOn: input.basedOn,
      permissions: input.permissions,
      wholeWorkspace: input.wholeWorkspace,
      createdBy: scope.userId,
      createdAt: now,
      updatedAt: now,
    };
    await namingRole(() =>
      this.transactions.run(async (tx) => {
        await this.workspaces.recordCustomRole(scope, tx);
        if ((await this.roles.countForWorkspace(scope, tx)) >= CUSTOM_ROLES_MAX) {
          throw new AppError(
            409,
            'custom_role_limit_reached',
            `Mỗi workspace có tối đa ${CUSTOM_ROLES_MAX} vai trò tùy chỉnh`,
            {
              detail: `Mỗi workspace có tối đa ${CUSTOM_ROLES_MAX} vai trò tùy chỉnh. Xóa một vai trò không còn dùng rồi tạo lại.`,
            },
          );
        }
        await this.roles.insert(scope, role, tx);
      }),
    );
    return toCustomRoleDto(role, 0, 0);
  }

  /**
   * New name, permissions or scope; holders have them at their next request. A role kept to the
   * sites chosen when given becomes "Toàn workspace" only once nobody holds it on some sites:
   * widening their access is a change of each of them, made on "Thành viên".
   */
  async update(
    user: AuthenticatedUser,
    workspaceId: string,
    roleId: string,
    input: CustomRoleInput,
  ): Promise<CustomRole> {
    const scope = await this.manager(user, workspaceId);
    const id = toObjectId(roleId, CUSTOM_ROLE_NOT_FOUND);
    // One transaction with the check: a grant at the same moment holds the role and conflicts.
    const updated = await namingRole(() =>
      this.transactions.run(async (tx) => {
        const current = await this.roles.findById(scope, id, tx);
        if (current === null) {
          throw notFound(CUSTOM_ROLE_NOT_FOUND);
        }
        if (input.wholeWorkspace && !current.wholeWorkspace) {
          const members = await this.workspaces.countCustomRoleHolders(
            scope,
            id,
            { withSites: true },
            tx,
          );
          const invited = await this.invitations.countPendingWithCustomRole(
            scope,
            id,
            { withSites: true },
            tx,
          );
          if (members + invited > 0) {
            // An invitation's sites cannot be changed: it is revoked and sent again.
            const steps = [
              members > 0 ? `đổi phạm vi của ${members} người đang giữ thành toàn workspace` : null,
              invited > 0 ? `thu hồi ${invited} lời mời đang chờ rồi mời lại` : null,
            ].filter((step) => step !== null);
            throw new AppError(409, 'conflict', 'Vai trò đang được giao trên một số site', {
              detail: `Ở màn Thành viên, ${steps.join(' và ')} trước.`,
            });
          }
        }
        const result = await this.roles.update(
          scope,
          id,
          {
            name: input.name,
            nameKey: customRoleNameKey(input.name),
            basedOn: input.basedOn,
            permissions: input.permissions,
            wholeWorkspace: input.wholeWorkspace,
            updatedAt: new Date(),
          },
          tx,
        );
        if (result === null) {
          throw notFound(CUSTOM_ROLE_NOT_FOUND);
        }
        return result;
      }),
    );
    return this.dto(scope, updated);
  }

  /** Only a role nobody holds and no pending invitation offers (ADR-024). */
  async remove(user: AuthenticatedUser, workspaceId: string, roleId: string): Promise<void> {
    const scope = await this.manager(user, workspaceId);
    const id = toObjectId(roleId, CUSTOM_ROLE_NOT_FOUND);
    await this.transactions.run(async (tx) => {
      const members = await this.workspaces.countCustomRoleHolders(scope, id, {}, tx);
      // Expired invitations still wait for "Gửi lại": they hold the role until revoked.
      const invitations = await this.invitations.countPendingWithCustomRole(scope, id, {}, tx);
      if (members + invitations > 0) {
        throw new AppError(409, 'custom_role_in_use', 'Vai trò đang được dùng', {
          detail: `${members} thành viên đang giữ và ${invitations} lời mời đang chờ có vai trò này. Đổi vai trò của họ, hoặc thu hồi lời mời, rồi xóa vai trò.`,
        });
      }
      if (!(await this.roles.remove(scope, id, tx))) {
        throw notFound(CUSTOM_ROLE_NOT_FOUND);
      }
    });
  }

  private async manager(user: AuthenticatedUser, workspaceId: string): Promise<WorkspaceScope> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'members.manage');
    return scope;
  }

  private async dto(scope: WorkspaceScope, role: CustomRoleRecord): Promise<CustomRole> {
    const [members, invited] = await Promise.all([
      this.workspaces.countCustomRoleHolders(scope, role._id),
      this.invitations.countPendingWithCustomRole(scope, role._id),
    ]);
    return toCustomRoleDto(role, members, invited);
  }
}
