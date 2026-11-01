import { Injectable } from '@nestjs/common';
import { can, onlyHoldersMessage, type Permission } from '@plp/contracts';
import { forbidden, notFound } from '../../shared/errors.js';
import { type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import type { WorkspaceScope } from './workspace-scope.js';
import { WorkspacesRepository } from './workspaces.repository.js';

export const WORKSPACE_NOT_FOUND = 'Không tìm thấy workspace';

@Injectable()
export class AccessService {
  constructor(private readonly workspaces: WorkspacesRepository) {}

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
    return {
      workspaceId,
      userId: user.id,
      role: membership.role,
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
    if (!can(scope.role, permission)) {
      throw forbidden(onlyHoldersMessage(permission));
    }
  }
}
