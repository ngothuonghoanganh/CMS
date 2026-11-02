import { Injectable } from '@nestjs/common';
import { type Access, type AccessGrant, can, customRoleIdOf, type Member } from '@plp/contracts';
import { type AppError, validationFailed } from '../../shared/errors.js';
import { isObjectIdString, type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { UserContact } from '../auth/users.repository.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { AccessRequestsRepository } from '../workspaces/access-requests.repository.js';
import { CustomRolesRepository } from '../workspaces/custom-roles.repository.js';
import { foreignSites } from '../workspaces/domain/member-rules.js';
import { InvitationsRepository } from '../workspaces/invitations.repository.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import type { MembershipRecord } from '../workspaces/workspace.schema.js';
import { type StoredGrant, storedGrant } from '../workspaces/workspaces.repository.js';

export const MEMBER_NOT_FOUND = 'Không tìm thấy thành viên';

/** A grant names a site that is not, or no longer, one of the workspace's. */
function foreignSiteError(): AppError {
  return validationFailed([
    { path: ['siteIds'], code: 'site_not_found', message: 'Có site không thuộc workspace này' },
  ]);
}

/** Quản trị changes roles and invites; a custom role never does (ADR-024). */
function managesMembers(grant: StoredGrant): boolean {
  return grant.role !== 'custom' && can(grant.role, 'members.manage');
}

export function toMemberDto(
  membership: MembershipRecord,
  contact: UserContact,
  access: Access,
): Member {
  return {
    userId: membership.userId.toHexString(),
    name: contact.name,
    email: contact.email,
    role: access,
    siteIds: membership.siteIds?.map((id) => id.toHexString()) ?? null,
    joinedAt: membership.createdAt.toISOString(),
  };
}

/** What every grant (invitation, change, accepted request) is checked against (ADR-021). */
@Injectable()
export class MemberGrants {
  constructor(
    private readonly sites: SitesRepository,
    private readonly customRoles: CustomRolesRepository,
    private readonly requests: AccessRequestsRepository,
    private readonly invitations: InvitationsRepository,
  ) {}

  /**
   * What a member's new grant ends, in its transaction (ADR-021). A Quản trị changes roles without
   * asking, so their pending request closes; anyone else no longer invites, so the invitations
   * they sent are revoked.
   */
  async settle(scope: WorkspaceScope, userId: ObjectId, grant: StoredGrant, tx: Tx): Promise<void> {
    await (managesMembers(grant)
      ? this.requests.deletePendingOf(scope, userId, tx)
      : this.invitations.revokeSentBy(scope, userId, new Date(), tx));
  }

  /**
   * The grant as stored, once checked: its sites are the workspace's, and a custom role is one of
   * the workspace's; one set to "Toàn workspace" is given on every site (ADR-024).
   */
  async resolveGrant(scope: WorkspaceScope, grant: AccessGrant): Promise<StoredGrant> {
    await this.assertOwnSites(scope, grant);
    const customRoleId = customRoleIdOf(grant.role);
    if (customRoleId === null) {
      return storedGrant(grant);
    }
    const role = isObjectIdString(customRoleId)
      ? await this.customRoles.findById(scope, toObjectId(customRoleId))
      : null;
    if (role === null) {
      throw validationFailed([
        {
          path: ['role'],
          code: 'role_not_found',
          message: 'Vai trò này không còn trong workspace',
        },
      ]);
    }
    if (role.wholeWorkspace && grant.siteIds !== null) {
      throw validationFailed([
        {
          path: ['siteIds'],
          code: 'invalid',
          message: `${role.name} làm việc trên mọi site của workspace`,
        },
      ]);
    }
    return storedGrant(grant);
  }

  /**
   * In the transaction that stores a checked grant: holds its sites, so none is deleted at the
   * same moment and left in the grant (ADR-027), and its custom role (ADR-024), so the role is not
   * deleted, nor made "Toàn workspace" under a grant with a site list.
   */
  async holdGrant(scope: WorkspaceScope, grant: StoredGrant, tx: Tx): Promise<void> {
    if (grant.siteIds !== null && !(await this.sites.holdForGrant(scope, grant.siteIds, tx))) {
      throw foreignSiteError();
    }
    if (grant.customRoleId === null) {
      return;
    }
    const role = await this.customRoles.hold(scope.workspaceId, grant.customRoleId, tx);
    if (role === null) {
      throw validationFailed([
        {
          path: ['role'],
          code: 'role_not_found',
          message: 'Vai trò này không còn trong workspace',
        },
      ]);
    }
    if (role.wholeWorkspace && grant.siteIds !== null) {
      throw validationFailed([
        {
          path: ['siteIds'],
          code: 'invalid',
          message: `${role.name} làm việc trên mọi site của workspace`,
        },
      ]);
    }
  }

  /** A grant names only sites of the workspace; the schema checked the rest. */
  async assertOwnSites(scope: WorkspaceScope, grant: Pick<AccessGrant, 'siteIds'>): Promise<void> {
    if (grant.siteIds === null) {
      return;
    }
    const own = (await this.sites.listForWorkspace(scope)).map((site) => site._id.toHexString());
    if (foreignSites(grant.siteIds, own).length > 0) {
      throw foreignSiteError();
    }
  }

  /** "toàn workspace", or the names of the sites, for emails. */
  async scopeLine(scope: WorkspaceScope, siteIds: readonly string[] | null): Promise<string> {
    if (siteIds === null) {
      return 'toàn workspace';
    }
    const names = (await this.sites.listForWorkspace(scope))
      .filter((site) => siteIds.includes(site._id.toHexString()))
      .map((site) => site.name);
    return `site ${names.join(', ')}`;
  }
}
