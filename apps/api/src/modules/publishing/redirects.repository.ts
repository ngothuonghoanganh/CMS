import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { REDIRECT_COLLECTION, type RedirectRecord } from './redirect.schema.js';
import {
  WorkspaceDatabases,
  type WorkspaceRef,
} from '../../shared/persistence/workspace-databases.js';

/** Redirects are written only by `movePointer`, in the same transaction as the pointer move. */
@Injectable()
export class RedirectsRepository {
  constructor(private readonly databases: WorkspaceDatabases) {}

  /** Makes `fromSlug` of the site lead to `pageId`, replacing any earlier target. */
  async upsert(
    scope: WorkspaceScope,
    siteId: ObjectId,
    fromSlug: string,
    pageId: ObjectId,
    tx: Tx,
  ): Promise<void> {
    await this.redirects(scope)
      .updateOne(
        { workspaceId: scope.workspaceId, siteId, fromSlug },
        // The filter's equality fields (workspace, site, slug) are copied into an inserted document.
        { $set: { pageId }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true, session: tx },
      )
      .exec();
  }

  /** Removes the redirect from `fromSlug`, because a page is now live at that slug. */
  async deleteFrom(
    scope: WorkspaceScope,
    siteId: ObjectId,
    fromSlug: string,
    tx: Tx,
  ): Promise<void> {
    await this.redirects(scope)
      .deleteOne({ workspaceId: scope.workspaceId, siteId, fromSlug }, { session: tx })
      .exec();
  }

  /** Unscoped lookup for public delivery; the site comes from the request host. */
  findPublic(
    ref: WorkspaceRef,
    siteId: ObjectId,
    fromSlug: string,
  ): Promise<RedirectRecord | null> {
    return this.redirects(ref)
      .findOne({ workspaceId: ref.workspaceId, siteId, fromSlug })
      .lean<RedirectRecord>()
      .exec();
  }

  private redirects(ref: WorkspaceRef): Model<RedirectRecord> {
    return this.databases.model(ref, REDIRECT_COLLECTION);
  }
}
