import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PlanUsage, VnMonth } from '@plp/contracts';
import type { Model } from 'mongoose';
import {
  WorkspaceDatabases,
  type WorkspaceRef,
} from '../../shared/persistence/workspace-databases.js';
import { AI_USAGE_COLLECTION } from '../ai/ai-usage.schema.js';
import { AUTOMATION_USAGE_COLLECTION } from '../automations/automation.schema.js';
import { DOMAIN_MODEL, type DomainRecord } from '../domains/domain.schema.js';
import { SITE_COLLECTION } from '../sites/site.schema.js';
import { INVITATION_MODEL, type InvitationRecord } from '../workspaces/invitation.schema.js';
import { MEMBERSHIP_MODEL, type MembershipRecord } from '../workspaces/workspace.schema.js';

/**
 * What a workspace uses of each limit of its plan (ADR-035): six counts on indexes that start with
 * `workspaceId`, run at once, whatever the size of the workspace. It reads the collections of the
 * modules that own them, so that those modules can check their limits through `EntitlementsService`
 * without depending on each other.
 */
@Injectable()
export class PlanUsageRepository {
  constructor(
    private readonly databases: WorkspaceDatabases,
    @InjectModel(MEMBERSHIP_MODEL) private readonly memberships: Model<MembershipRecord>,
    @InjectModel(INVITATION_MODEL) private readonly invitations: Model<InvitationRecord>,
    @InjectModel(DOMAIN_MODEL) private readonly domains: Model<DomainRecord>,
  ) {}

  /** Members count pending invitations; custom domains count every site's (ADR-035). */
  async usageOf(ref: WorkspaceRef, month: VnMonth): Promise<PlanUsage> {
    const { workspaceId } = ref;
    const [sites, members, invited, ai, automation, customDomains] = await Promise.all([
      this.databases.model(ref, SITE_COLLECTION).countDocuments({ workspaceId }).exec(),
      this.memberships.countDocuments({ workspaceId }).exec(),
      this.invitations.countDocuments({ workspaceId, status: 'pending' }).exec(),
      this.databases
        .model(ref, AI_USAGE_COLLECTION)
        .findOne({ workspaceId, month }, { used: 1 })
        .lean<{ used: number }>()
        .exec(),
      this.databases
        .model(ref, AUTOMATION_USAGE_COLLECTION)
        .findOne({ workspaceId, month }, { used: 1 })
        .lean<{ used: number }>()
        .exec(),
      this.domains.countDocuments({ workspaceId }).exec(),
    ]);
    return {
      sites,
      members: members + invited,
      aiUses: ai?.used ?? 0,
      automationRuns: automation?.used ?? 0,
      customDomains,
    };
  }
}
