import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { RetentionMonths } from '@plp/contracts';
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { LEAD_MODEL, type LeadRecord, LEADS_SUBMISSION_INDEX } from './lead.schema.js';

export type NewLead = Omit<LeadRecord, '_id' | 'workspaceId' | 'siteId' | 'status' | 'note'>;

/** Another request with the same `submissionId` stored the lead first. */
export class SubmissionTakenError extends Error {
  constructor(options: { cause: unknown }) {
    super('A lead with this submission id already exists', options);
    this.name = 'SubmissionTakenError';
  }
}

@Injectable()
export class LeadsRepository {
  constructor(@InjectModel(LEAD_MODEL) private readonly leads: Model<LeadRecord>) {}

  /**
   * Stores a visitor's lead. Public intake has no member scope: the workspace comes from the site
   * record the subdomain resolved to, never from the request (ADR-003).
   */
  async insertPublic(
    site: { _id: ObjectId; workspaceId: ObjectId },
    lead: NewLead,
  ): Promise<LeadRecord> {
    try {
      const created = await this.leads.create({
        ...lead,
        workspaceId: site.workspaceId,
        siteId: site._id,
        status: 'new',
        note: '',
      });
      return created.toObject();
    } catch (error) {
      if (isDuplicateKeyError(error, LEADS_SUBMISSION_INDEX)) {
        throw new SubmissionTakenError({ cause: error });
      }
      throw error;
    }
  }

  /** Whether the site already received this submission (a retry of the same form). */
  async existsPublicSubmission(siteId: ObjectId, submissionId: string): Promise<boolean> {
    return (await this.leads.exists({ siteId, submissionId }).exec()) !== null;
  }

  /**
   * Recomputes every lead's expiry after the site's retention changed (ADR-017), in one update:
   * `createdAt` plus the new period, or no expiry.
   */
  async recomputeExpiry(
    scope: WorkspaceScope,
    siteId: ObjectId,
    months: RetentionMonths,
  ): Promise<void> {
    const expiresAt =
      months === null
        ? null
        : { $dateAdd: { startDate: '$createdAt', unit: 'month', amount: months } };
    await this.leads
      .updateMany({ siteId, workspaceId: scope.workspaceId }, [{ $set: { expiresAt } }], {
        updatePipeline: true,
      })
      .exec();
  }
}
