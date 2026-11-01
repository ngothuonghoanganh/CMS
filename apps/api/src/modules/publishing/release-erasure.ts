import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import { erasureOptions } from '../../shared/persistence/erasure.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import { WorkspaceDatabases } from '../../shared/persistence/workspace-databases.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { RELEASE_COLLECTION, type ReleaseRecord } from './release.schema.js';

/**
 * The one way releases leave (ADR-027), apart from `ReleasesRepository`, which only inserts and
 * reads (ADR-005). Nothing here edits a release.
 */
@Injectable()
export class ReleaseErasure {
  constructor(private readonly databases: WorkspaceDatabases) {}

  /**
   * Deletes the releases of a page being deleted, except `keep`: those leads refer to as the text
   * their visitor agreed to (rule 10). In the transaction that deletes the page; returns how many
   * went.
   */
  async deleteForPage(
    scope: WorkspaceScope,
    page: { siteId: ObjectId; pageId: ObjectId },
    keep: readonly ObjectId[],
    tx: Tx,
  ): Promise<number> {
    const result = await this.releases(scope)
      .deleteMany(
        {
          workspaceId: scope.workspaceId,
          siteId: page.siteId,
          pageId: page.pageId,
          ...(keep.length === 0 ? {} : { _id: { $nin: [...keep] } }),
        },
        erasureOptions(tx),
      )
      .exec();
    return result.deletedCount;
  }

  private releases(scope: WorkspaceScope): Model<ReleaseRecord> {
    return this.databases.model(scope, RELEASE_COLLECTION);
  }
}
