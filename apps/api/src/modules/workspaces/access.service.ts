import { Injectable } from '@nestjs/common';
import { forbidden, notFound } from '../../shared/errors.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import type { WorkspaceScope } from './workspace-scope.js';
import { WorkspacesRepository } from './workspaces.repository.js';

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
    return { workspaceId, userId: user.id, role: membership.role } as WorkspaceScope;
  }

  /** Owner-only actions: creating sites and changing site settings (ADR-004). */
  requireOwner(scope: WorkspaceScope): void {
    if (scope.role !== 'owner') {
      throw forbidden('Chỉ Owner của workspace được thực hiện thao tác này');
    }
  }
}
