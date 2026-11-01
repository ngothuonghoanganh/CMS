import { Injectable } from '@nestjs/common';
import { can, onlyHoldersMessage, type Permission } from '@plp/contracts';
import { forbidden, notFound } from '../../shared/errors.js';
import { type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CustomRolesRepository } from './custom-roles.repository.js';
import { accessOf } from './domain/member-access.js';
import type { WorkspaceScope } from './workspace-scope.js';
import { WorkspacesRepository } from './workspaces.repository.js';

export const WORKSPACE_NOT_FOUND = 'Không tìm thấy workspace';

@Injectable()
export class AccessService {
  constructor(
    private readonly workspaces: WorkspacesRepository,
    private readonly customRoles: CustomRolesRepository,
  ) {}

  /**
   * Scope for a workspace the user belongs to. Non-members get 404, the same answer as a missing
   * resource, so ids from other workspaces cannot be probed.
   */
  async scopeFor(
    user: AuthenticatedUser,
    workspaceId: ObjectId,
    notFoundTitle?: string,
  ): Promise<WorkspaceScope> {
    const membership = await this.workspaces.findMembership(workspaceId, user.id);
    if (!membership) {
      throw notFound(notFoundTitle);
    }
    // A custom role is read on every request: a change to it applies at once (ADR-024).
    const custom =
      membership.role === 'custom' && membership.customRoleId
        ? await this.customRoles.findOfMembership(workspaceId, membership.customRoleId)
        : null;
    return {
      workspaceId,
      userId: user.id,
      access: accessOf(membership, new Map(custom ? [[custom._id.toHexString(), custom]] : [])),
      siteIds: membership.siteIds ?? null,
    } as WorkspaceScope;
  }

  /** Scope of a workspace from the URL; non-members get 404. */
  scopeForWorkspace(user: AuthenticatedUser, workspaceId: string): Promise<WorkspaceScope> {
    return this.scopeFor(user, toObjectId(workspaceId, WORKSPACE_NOT_FOUND), WORKSPACE_NOT_FOUND);
  }

  /** Whether the member may open the site; a site outside their scope is answered as foreign. */
  coversSite(scope: WorkspaceScope, siteId: ObjectId): boolean {
    return scope.siteIds === null || scope.siteIds.some((id) => id.equals(siteId));
  }

  /** Refuses with 403 when the member's role does not hold the permission (ADR-020). */
  require(scope: WorkspaceScope, permission: Permission): void {
    if (!can(scope.access, permission)) {
      throw forbidden(onlyHoldersMessage(permission));
    }
  }
}
