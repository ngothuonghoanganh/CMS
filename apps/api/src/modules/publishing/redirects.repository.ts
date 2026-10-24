import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { REDIRECT_MODEL, type RedirectRecord } from './redirect.schema.js';

/** Redirects are written only by `movePointer`, in the same transaction as the pointer move. */
@Injectable()
export class RedirectsRepository {
  constructor(@InjectModel(REDIRECT_MODEL) private readonly redirects: Model<RedirectRecord>) {}

  /** Makes `fromSlug` of the site lead to `pageId`, replacing any earlier target. */
  async upsert(
    scope: WorkspaceScope,
    siteId: ObjectId,
    fromSlug: string,
    pageId: ObjectId,
    tx: Tx,
  ): Promise<void> {
    await this.redirects
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
    await this.redirects
      .deleteOne({ workspaceId: scope.workspaceId, siteId, fromSlug }, { session: tx })
      .exec();
  }

  /** Unscoped lookup for public delivery; the site comes from the request host. */
  findPublic(siteId: ObjectId, fromSlug: string): Promise<RedirectRecord | null> {
    return this.redirects.findOne({ siteId, fromSlug }).lean<RedirectRecord>().exec();
  }
}
