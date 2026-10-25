import { Injectable } from '@nestjs/common';
import type { PersonDeleteResponse } from '@plp/contracts';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { AccessService } from '../workspaces/access.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { LeadAccessService, personOfLead } from './lead-access.service.js';
import { type LeadPerson, LeadsRepository } from './leads.repository.js';

/**
 * Deleting a person's data (ADR-017), owner only: every lead with their phone number or email in
 * the site, consent evidence included. Copies already sent by email are not deleted; the screen
 * says so.
 */
@Injectable()
export class LeadPersonService {
  constructor(
    private readonly access: AccessService,
    private readonly leadAccess: LeadAccessService,
    private readonly leads: LeadsRepository,
    private readonly activity: ActivityRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  /** "Xóa dữ liệu người này", from one of their leads. */
  async deleteFromLead(user: AuthenticatedUser, leadId: string): Promise<PersonDeleteResponse> {
    const { scope, site, lead } = await this.leadAccess.access(user, leadId);
    this.access.requireOwner(scope);
    return { deletedCount: await this.deletePerson(scope, site._id, personOfLead(lead)) };
  }

  /**
   * Deletes the person's leads and records how many in the activity log, in one transaction, so
   * the log never claims a deletion that did not happen.
   */
  deletePerson(scope: WorkspaceScope, siteId: ObjectId, person: LeadPerson): Promise<number> {
    return this.transactions.run(async (tx) => {
      const deleted = await this.leads.deletePerson(scope, siteId, person, tx);
      await this.activity.record(
        scope,
        { siteId, type: 'lead.person_deleted', data: { count: deleted } },
        tx,
      );
      return deleted;
    });
  }
}
