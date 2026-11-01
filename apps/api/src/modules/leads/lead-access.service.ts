import { Injectable } from '@nestjs/common';
import type { Permission } from '@plp/contracts';
import { notFound } from '../../shared/errors.js';
import { toObjectId } from '../../shared/persistence/object-id.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import type { SiteRecord } from '../sites/site.schema.js';
import { SitesService } from '../sites/sites.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { leadSearchKeys } from './domain/lead-search.js';
import { LEAD_NOT_FOUND } from './lead-dto.js';
import type { LeadRecord } from './lead.schema.js';
import { type LeadPerson, LeadsRepository } from './leads.repository.js';

/** A lead the user may access, with its site and the scope for repository calls. */
export interface LeadAccess {
  scope: WorkspaceScope;
  site: SiteRecord;
  lead: LeadRecord;
}

/** The person who sent `lead`: the lead itself and every lead with the same phone or email. */
export function personOfLead(lead: LeadRecord): LeadPerson {
  const { phone, email } = leadSearchKeys(lead.fields);
  return { leadId: lead._id, phone, email };
}

@Injectable()
export class LeadAccessService {
  constructor(
    private readonly leads: LeadsRepository,
    private readonly sites: SitesService,
  ) {}

  /**
   * Entry point of every lead endpoint: checks membership in the site's workspace, the member's
   * sites and the permission through the site, then finds the lead in that site (ADR-025). Unknown
   * leads and leads of another site or workspace are all 404 (ADR-003); a role without the
   * permission is 403 (ADR-020).
   */
  async access(
    user: AuthenticatedUser,
    siteId: string,
    leadId: string,
    permission: Permission,
  ): Promise<LeadAccess> {
    const id = toObjectId(leadId, LEAD_NOT_FOUND);
    const { scope, site } = await this.sites.accessById(
      user,
      toObjectId(siteId, LEAD_NOT_FOUND),
      permission,
      LEAD_NOT_FOUND,
    );
    const lead = await this.leads.findById(scope, id);
    if (!lead || !lead.siteId.equals(site._id)) {
      throw notFound(LEAD_NOT_FOUND);
    }
    return { scope, site, lead };
  }
}
