import { Injectable } from '@nestjs/common';
import {
  can,
  onlyHoldersMessage,
  type Permission,
  type ReadOnlyKeptAction,
  refusedWhileReadOnly,
} from '@plp/contracts';
import { forbidden, notFound } from '../../shared/errors.js';
import { type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { workspaceReadOnly } from '../billing/plan-problems.js';
import { CustomRolesRepository } from './custom-roles.repository.js';
import { accessOf } from './domain/member-access.js';
import type { WorkspaceScope } from './workspace-scope.js';
import { WorkspacesRepository } from './workspaces.repository.js';

export const WORKSPACE_NOT_FOUND = 'Không tìm thấy workspace';

/**
 * 402 `workspace_read_only` for a request that changes the data of a read-only workspace,
 * whatever its permission (ADR-035). `AccessService.require` calls it for write permissions; an
 * action under a kept permission that is more than a pointer move (deleting a page) calls it too.
 */
export function requireWritable(scope: WorkspaceScope): void {
  if (scope.writes && scope.subscription.access === 'read_only') {
    throw workspaceReadOnly(scope.subscription.state);
  }
}

@Injectable()
export class AccessService {
  constructor(
    private readonly workspaces: WorkspacesRepository,
    private readonly customRoles: CustomRolesRepository,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * Scope for a workspace the user belongs to. Non-members get 404, the same answer as a missing
   * resource, so ids from other workspaces cannot be probed. It carries the subscription's state
   * and access level now (ADR-035), which `require` checks.
   */
  async scopeFor(
    user: AuthenticatedUser,
    workspaceId: ObjectId,
    notFoundTitle?: string,
  ): Promise<WorkspaceScope> {
    // Read together; nothing of the subscription leaves this method for a non-member.
    const [member, entitlements] = await Promise.all([
      this.memberAccess(workspaceId, user.id),
      this.entitlements.find({ workspaceId }),
    ]);
    if (!member) {
      throw notFound(notFoundTitle);
    }
    if (!entitlements) {
      throw new Error(`Workspace ${workspaceId.toHexString()} has no subscription (ADR-035)`);
    }
    const { state, access } = entitlements.status;
    return {
      workspaceId,
      userId: user.id,
      ...member,
      subscription: { state, access },
      writes: user.writes,
    } as WorkspaceScope;
  }

  /**
   * What a member may do now, for a job that acts for nobody (the domain monitor's emails); null
   * when they are no longer a member.
   */
  async memberAccess(
    workspaceId: ObjectId,
    userId: ObjectId,
  ): Promise<Pick<WorkspaceScope, 'access' | 'siteIds'> | null> {
    const membership = await this.workspaces.findMembership(workspaceId, userId);
    if (!membership) {
      return null;
    }
    // A custom role is read on every request: a change to it applies at once (ADR-024).
    const custom =
      membership.role === 'custom' && membership.customRoleId
        ? await this.customRoles.findOfMembership(workspaceId, membership.customRoleId)
        : null;
    return {
      access: accessOf(membership, new Map(custom ? [[custom._id.toHexString(), custom]] : [])),
      siteIds: membership.siteIds ?? null,
    };
  }

  /** Scope of a workspace from the URL; non-members get 404. */
  scopeForWorkspace(user: AuthenticatedUser, workspaceId: string): Promise<WorkspaceScope> {
    return this.scopeFor(user, toObjectId(workspaceId, WORKSPACE_NOT_FOUND), WORKSPACE_NOT_FOUND);
  }

  /** Whether the member may open the site; a site outside their scope is answered as foreign. */
  coversSite(scope: Pick<WorkspaceScope, 'siteIds'>, siteId: ObjectId): boolean {
    return scope.siteIds === null || scope.siteIds.some((id) => id.equals(siteId));
  }

  /**
   * Refuses with 403 when the member's role does not hold the permission (ADR-020), then with 402
   * `workspace_read_only` when the workspace is read-only, the request changes data and the
   * permission writes (ADR-035). `kept` names one of the few actions a read-only workspace keeps
   * although their permission is refused (removing a member).
   */
  require(scope: WorkspaceScope, permission: Permission, kept?: ReadOnlyKeptAction): void {
    if (!can(scope.access, permission)) {
      throw forbidden(onlyHoldersMessage(permission));
    }
    if (kept === undefined && refusedWhileReadOnly(permission)) {
      requireWritable(scope);
    }
  }
}
