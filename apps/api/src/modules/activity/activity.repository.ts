import { Injectable } from '@nestjs/common';
import type { ActivityType } from '@plp/contracts';
import type { Model } from 'mongoose';
import {
  afterCursor,
  type KeysetPage,
  NEWEST_FIRST,
  toKeysetPage,
} from '../../shared/persistence/keyset.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import {
  ACTIVITY_COLLECTION,
  type ActivityData,
  type ActivityRecord,
  EMPTY_ACTIVITY_DATA,
} from './activity.schema.js';
import { POINTER_EVENT_TYPES } from './pointer-events.js';
import {
  WorkspaceDatabases,
  type WorkspaceRef,
} from '../../shared/persistence/workspace-databases.js';

/** What happened; the actor is the scope's user and the time is now. */
export interface ActivityEntry {
  siteId: ObjectId;
  type: ActivityType;
  /** The page the event is about, with its title at that moment. Omit for site/asset events. */
  page?: { id: ObjectId; title: string } | null;
  /** Only the fields the event uses; the rest default to null (`revalidationFailed` to false). */
  data?: Partial<ActivityData>;
  reason?: string | null;
}

/** The minimum needed to check access to an activity, e.g. for `POST /activity/:id/undo`. */
@Injectable()
export class ActivityRepository {
  constructor(private readonly databases: WorkspaceDatabases) {}

  /** Appends an event done by `scope.userId`; pass `tx` to commit it with the change it logs. */
  async record(scope: WorkspaceScope, entry: ActivityEntry, tx?: Tx): Promise<ObjectId> {
    const document = {
      workspaceId: scope.workspaceId,
      siteId: entry.siteId,
      pageId: entry.page?.id ?? null,
      pageTitle: entry.page?.title ?? null,
      actorId: scope.userId,
      type: entry.type,
      data: { ...EMPTY_ACTIVITY_DATA, ...entry.data },
      reason: entry.reason ?? null,
      createdAt: new Date(),
    };
    const [created] = await this.activity(scope).create([document], tx ? { session: tx } : {});
    if (!created) {
      throw new Error('Activity insert returned no document');
    }
    return created._id;
  }

  /** Events of a site, newest first, optionally only some types (e.g. publishing events). */
  async listForSite(
    scope: WorkspaceScope,
    siteId: ObjectId,
    cursor: string | undefined,
    limit: number,
    types?: readonly ActivityType[],
  ): Promise<KeysetPage<ActivityRecord>> {
    const records = await this.activity(scope)
      .find({
        workspaceId: scope.workspaceId,
        siteId,
        ...(types ? { type: { $in: [...types] } } : {}),
        ...afterCursor(cursor),
      })
      .sort(NEWEST_FIRST)
      .limit(limit + 1)
      .lean<ActivityRecord[]>()
      .exec();
    return toKeysetPage(records, limit);
  }

  /** Events of a page, newest first, optionally only some types (e.g. pointer moves). */
  async listForPage(
    scope: WorkspaceScope,
    pageId: ObjectId,
    cursor: string | undefined,
    limit: number,
    types?: readonly ActivityType[],
  ): Promise<KeysetPage<ActivityRecord>> {
    const records = await this.activity(scope)
      .find({
        workspaceId: scope.workspaceId,
        pageId,
        ...(types ? { type: { $in: [...types] } } : {}),
        ...afterCursor(cursor),
      })
      .sort(NEWEST_FIRST)
      .limit(limit + 1)
      .lean<ActivityRecord[]>()
      .exec();
    return toKeysetPage(records, limit);
  }

  findById(scope: WorkspaceScope, id: ObjectId): Promise<ActivityRecord | null> {
    return this.activity(scope)
      .findOne({ _id: id, workspaceId: scope.workspaceId })
      .lean<ActivityRecord>()
      .exec();
  }

  /**
   * The newest pointer event (`POINTER_EVENT_TYPES`) of each page, keyed by page id hex, in one
   * aggregation. Pages without any pointer event are absent from the map. Pass `tx` to read
   * inside a transaction (e.g. the undo re-check right before it moves the pointer).
   */
  latestPointerEvents(
    scope: WorkspaceScope,
    pageIds: readonly ObjectId[],
    tx?: Tx,
  ): Promise<Map<string, ActivityRecord>> {
    return this.latestPointerEventsWhere(scope, { workspaceId: scope.workspaceId }, pageIds, tx);
  }

  /**
   * The same for live pages of a site that public delivery resolved from its host (the sitemap):
   * there is no member, so the site bounds the read.
   */
  latestPublicPointerEvents(
    ref: WorkspaceRef,
    siteId: ObjectId,
    pageIds: readonly ObjectId[],
  ): Promise<Map<string, ActivityRecord>> {
    return this.latestPointerEventsWhere(ref, { workspaceId: ref.workspaceId, siteId }, pageIds);
  }

  private async latestPointerEventsWhere(
    ref: WorkspaceRef,
    owner: { workspaceId: ObjectId; siteId?: ObjectId },
    pageIds: readonly ObjectId[],
    tx?: Tx,
  ): Promise<Map<string, ActivityRecord>> {
    const unique = [...new Map(pageIds.map((id) => [id.toHexString(), id])).values()];
    if (unique.length === 0) {
      return new Map();
    }
    const groups = await this.activity(ref)
      .aggregate<{ _id: ObjectId; latest: ActivityRecord }>([
        {
          $match: {
            ...owner,
            pageId: { $in: unique },
            type: { $in: [...POINTER_EVENT_TYPES] },
          },
        },
        { $sort: { pageId: 1, createdAt: -1, _id: -1 } },
        { $group: { _id: '$pageId', latest: { $first: '$$ROOT' } } },
      ])
      .session(tx ?? null)
      .exec();
    return new Map(groups.map((group) => [group._id.toHexString(), group.latest]));
  }

  /**
   * The pages among `pageIds` that were deleted (ADR-027), as id hex: those with a `page.deleted`
   * event, recorded in the transaction that deleted the page. One query on the page index.
   */
  async deletedPages(scope: WorkspaceScope, pageIds: readonly ObjectId[]): Promise<Set<string>> {
    const unique = [...new Map(pageIds.map((id) => [id.toHexString(), id])).values()];
    if (unique.length === 0) {
      return new Set();
    }
    const events = await this.activity(scope)
      .find(
        { workspaceId: scope.workspaceId, pageId: { $in: unique }, type: 'page.deleted' },
        { pageId: 1 },
      )
      .lean<Pick<ActivityRecord, '_id' | 'pageId'>[]>()
      .exec();
    return new Set(events.flatMap((event) => (event.pageId ? [event.pageId.toHexString()] : [])));
  }

  /** Flags a pointer event whose renderer revalidation failed after the commit (ADR-009). */
  async markRevalidationFailed(ref: WorkspaceRef, id: ObjectId): Promise<void> {
    const result = await this.activity(ref)
      .updateOne(
        { _id: id, workspaceId: ref.workspaceId },
        { $set: { 'data.revalidationFailed': true } },
      )
      .exec();
    if (result.matchedCount === 0) {
      throw new Error(`Activity ${id.toHexString()} does not exist`);
    }
  }

  private activity(ref: WorkspaceRef): Model<ActivityRecord> {
    return this.databases.model(ref, ACTIVITY_COLLECTION);
  }
}
