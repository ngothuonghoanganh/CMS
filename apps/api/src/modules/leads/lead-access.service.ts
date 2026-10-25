import { Injectable } from '@nestjs/common';
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
   * Entry point of every lead endpoint: checks membership in the lead's workspace through its
   * site. Unknown leads and leads of another workspace are both 404 (ADR-003).
   */
  async access(user: AuthenticatedUser, leadId: string): Promise<LeadAccess> {
    const id = toObjectId(leadId, LEAD_NOT_FOUND);
    const ref = await this.leads.findAccessRef(id);
    if (!ref) {
      throw notFound(LEAD_NOT_FOUND);
    }
    const { scope, site } = await this.sites.accessById(user, ref.siteId, LEAD_NOT_FOUND);
    const lead = await this.leads.findById(scope, id);
    if (!lead || !lead.siteId.equals(site._id)) {
      throw notFound(LEAD_NOT_FOUND);
    }
    return { scope, site, lead };
  }
}
