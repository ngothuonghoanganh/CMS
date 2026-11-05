import { Injectable } from '@nestjs/common';
import type { Types } from 'mongoose';
import { erasureOptions } from '../../shared/persistence/erasure.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  type WorkspaceCollection,
  WorkspaceDatabases,
} from '../../shared/persistence/workspace-databases.js';
import { ACTIVITY_COLLECTION } from '../activity/activity.schema.js';
import { AI_JOB_COLLECTION } from '../ai/ai-job.schema.js';
import { AI_USAGE_COLLECTION } from '../ai/ai-usage.schema.js';
import {
  ANALYTICS_DAILY_COLLECTION,
  ANALYTICS_SEEN_COLLECTION,
} from '../analytics/analytics.schema.js';
import { ASSET_COLLECTION } from '../assets/asset.schema.js';
import { CONTACT_COLLECTION, MERGE_SUGGESTION_COLLECTION } from '../contacts/contact.schema.js';
import {
  CONTACT_EVENT_COLLECTION,
  MEETING_COLLECTION,
  TASK_COLLECTION,
} from '../contacts/profile.schema.js';
import { DATA_REQUEST_COLLECTION } from '../data-requests/data-request.schema.js';
import { LEAD_COLLECTION } from '../leads/lead.schema.js';
import { PAGE_COLLECTION } from '../pages/page.schema.js';
import { CONSENT_VERSION_COLLECTION } from '../privacy/consent-version.schema.js';
import { APPROVAL_COLLECTION } from '../publishing/approval.schema.js';
import { REDIRECT_COLLECTION } from '../publishing/redirect.schema.js';
import { RELEASE_COLLECTION } from '../publishing/release.schema.js';
import { TEMPLATE_COLLECTION } from '../templates/template.schema.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { SITE_COLLECTION } from './site.schema.js';

/** A document of a site's data: it names its site, and its workspace except `analytics_seen`. */
interface SiteDocument {
  siteId: Types.ObjectId | null;
}

/**
 * The workspace database's side of deleting a site (ADR-027): the site and every document that
 * holds its data by `siteId` (ADR-025). Each delete carries the erasure comment, which the guards
 * of releases and consent versions require (ADR-005, ADR-017).
 */
@Injectable()
export class SiteErasureRepository {
  constructor(private readonly databases: WorkspaceDatabases) {}

  /**
   * Deletes the site and its data, in the transaction of the deletion. Run again without one after
   * the commit, it removes what requests that read the site before the commit (a lead, a view, an
   * upload) wrote while the transaction ran, which it did not see.
   */
  async erase(scope: WorkspaceScope, siteId: ObjectId, tx?: Tx): Promise<void> {
    await this.databases
      .model(scope, SITE_COLLECTION)
      .deleteOne({ _id: siteId, workspaceId: scope.workspaceId }, erasureOptions(tx))
      .exec();
    const owned = { siteId, workspaceId: scope.workspaceId };
    // One after the other: a session runs one operation at a time.
    await this.deleteAll(scope, PAGE_COLLECTION, owned, tx);
    await this.deleteAll(scope, RELEASE_COLLECTION, owned, tx);
    await this.deleteAll(scope, REDIRECT_COLLECTION, owned, tx);
    await this.deleteAll(scope, ASSET_COLLECTION, owned, tx);
    await this.deleteAll(scope, LEAD_COLLECTION, owned, tx);
    await this.deleteAll(scope, CONTACT_COLLECTION, owned, tx);
    await this.deleteAll(scope, MERGE_SUGGESTION_COLLECTION, owned, tx);
    await this.deleteAll(scope, CONTACT_EVENT_COLLECTION, owned, tx);
    await this.deleteAll(scope, TASK_COLLECTION, owned, tx);
    await this.deleteAll(scope, MEETING_COLLECTION, owned, tx);
    await this.deleteAll(scope, ACTIVITY_COLLECTION, owned, tx);
    await this.deleteAll(scope, CONSENT_VERSION_COLLECTION, owned, tx);
    await this.deleteAll(scope, DATA_REQUEST_COLLECTION, owned, tx);
    await this.deleteAll(scope, APPROVAL_COLLECTION, owned, tx);
    await this.deleteAll(scope, ANALYTICS_DAILY_COLLECTION, owned, tx);
    // No `workspaceId` in this one; in the workspace's own database `siteId` alone is the site.
    await this.deleteAll(scope, ANALYTICS_SEEN_COLLECTION, { siteId }, tx);
    if (tx !== undefined) {
      await this.giveBackAiUses(scope, siteId, tx);
    }
    await this.deleteAll(scope, AI_JOB_COLLECTION, owned, tx);
    // Workspace templates stay, with their own images (ADR-030): the site only leaves the list of
    // sites that may use them.
    await this.databases
      .model(scope, TEMPLATE_COLLECTION)
      .updateMany(
        { workspaceId: scope.workspaceId, 'scope.siteIds': siteId },
        { $pull: { 'scope.siteIds': siteId } },
        tx === undefined ? {} : { session: tx },
      )
      .exec();
  }

  /**
   * Gives back the uses of the site's AI jobs still on their first run (ADR-031), in the
   * transaction that deletes the jobs: their runs' own ends will match no job, so this is the one
   * time each use goes back. A run that ends at the same moment writes the same job, so one of the
   * two transactions is retried and sees what the other did. The sweep after the commit finds no
   * such job: starting one writes the site (`dataSeq`), which is gone.
   */
  private async giveBackAiUses(scope: WorkspaceScope, siteId: ObjectId, tx: Tx): Promise<void> {
    const months = await this.databases
      .model(scope, AI_JOB_COLLECTION)
      .aggregate<{ _id: string; uses: number }>([
        {
          $match: {
            workspaceId: scope.workspaceId,
            siteId,
            status: 'running',
            pageId: null,
            'quota.refunded': false,
          },
        },
        { $group: { _id: '$quota.month', uses: { $sum: 1 } } },
      ])
      .session(tx)
      .exec();
    const now = new Date();
    // One counter per month a use was taken in: at most a couple.
    for (const { _id: month, uses } of months) {
      await this.databases
        .model(scope, AI_USAGE_COLLECTION)
        .updateOne(
          { workspaceId: scope.workspaceId, month },
          [{ $set: { used: { $max: [0, { $subtract: ['$used', uses] }] }, updatedAt: now } }],
          { updatePipeline: true, session: tx },
        )
        .exec();
    }
  }

  private async deleteAll<T extends SiteDocument>(
    scope: WorkspaceScope,
    collection: WorkspaceCollection<T>,
    filter: { siteId: ObjectId; workspaceId?: ObjectId },
    tx: Tx | undefined,
  ): Promise<void> {
    await this.databases.model(scope, collection).deleteMany(filter, erasureOptions(tx)).exec();
  }
}
