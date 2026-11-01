import { Injectable } from '@nestjs/common';
import type { AccessGrant, Member } from '@plp/contracts';
import { validationFailed } from '../../shared/errors.js';
import type { UserContact } from '../auth/users.repository.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { foreignSites } from '../workspaces/domain/member-rules.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import type { MembershipRecord } from '../workspaces/workspace.schema.js';

export const MEMBER_NOT_FOUND = 'Không tìm thấy thành viên';

export function toMemberDto(membership: MembershipRecord, contact: UserContact): Member {
  return {
    userId: membership.userId.toHexString(),
    name: contact.name,
    email: contact.email,
    role: membership.role,
    siteIds: membership.siteIds?.map((id) => id.toHexString()) ?? null,
    joinedAt: membership.createdAt.toISOString(),
  };
}

/** What every grant (invitation, change, accepted request) is checked against (ADR-021). */
@Injectable()
export class MemberGrants {
  constructor(private readonly sites: SitesRepository) {}

  /** A grant names only sites of the workspace; the schema checked the rest. */
  async assertOwnSites(scope: WorkspaceScope, grant: Pick<AccessGrant, 'siteIds'>): Promise<void> {
    if (grant.siteIds === null) {
      return;
    }
    const own = (await this.sites.listForWorkspace(scope)).map((site) => site._id.toHexString());
    if (foreignSites(grant.siteIds, own).length > 0) {
      throw validationFailed([
        {
          path: ['siteIds'],
          code: 'site_not_found',
          message: 'Có site không thuộc workspace này',
        },
      ]);
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
