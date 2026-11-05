import { Injectable } from '@nestjs/common';
import { can, type ContactPerson } from '@plp/contracts';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import { UsersRepository } from '../auth/users.repository.js';
import { CustomRolesRepository } from '../workspaces/custom-roles.repository.js';
import { accessOf } from '../workspaces/domain/member-access.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';

/**
 * Members a profile or a task can be given to: they hold `leads.view` and may open the site
 * (ADR-020, ADR-033), in the order of the members screen.
 */
@Injectable()
export class ContactAssignees {
  constructor(
    private readonly workspaces: WorkspacesRepository,
    private readonly customRoles: CustomRolesRepository,
    private readonly users: UsersRepository,
  ) {}

  async list(scope: WorkspaceRef, siteId: ObjectId): Promise<ContactPerson[]> {
    const [memberships, roles] = await Promise.all([
      this.workspaces.listMembers(scope),
      this.customRoles.mapForWorkspace(scope),
    ]);
    const eligible = memberships.filter(
      (membership) =>
        can(accessOf(membership, roles), 'leads.view') &&
        ((membership.siteIds ?? null) === null ||
          membership.siteIds?.some((id) => id.equals(siteId))),
    );
    const refs = await this.users.findRefs(eligible.map((membership) => membership.userId));
    return eligible.flatMap((membership) => {
      const ref = refs.get(membership.userId.toHexString());
      return ref ? [ref] : [];
    });
  }

  async includes(scope: WorkspaceRef, siteId: ObjectId, userId: string): Promise<boolean> {
    return (await this.list(scope, siteId)).some((person) => person.id === userId);
  }
}
