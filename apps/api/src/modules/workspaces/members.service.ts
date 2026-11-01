import { Injectable } from '@nestjs/common';
import type { RoleCounts } from '@plp/contracts';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { AccessService } from './access.service.js';
import { WorkspacesRepository } from './workspaces.repository.js';

/** The people of a workspace and their roles (board 15, 16; ADR-020). */
@Injectable()
export class MembersService {
  constructor(
    private readonly access: AccessService,
    private readonly workspaces: WorkspacesRepository,
  ) {}

  /** Members per role, for the role list of "Vai trò & quyền". */
  async roleCounts(user: AuthenticatedUser, workspaceId: string): Promise<RoleCounts> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'members.manage');
    return { counts: await this.workspaces.countByRole(scope) };
  }
}
