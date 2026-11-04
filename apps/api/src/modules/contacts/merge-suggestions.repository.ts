import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  WorkspaceDatabases,
  type WorkspaceRef,
} from '../../shared/persistence/workspace-databases.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import {
  MERGE_SUGGESTION_COLLECTION,
  type MergeSuggestionRecord,
  MERGE_SUGGESTIONS_PAIR_INDEX,
  type StoredMergeReason,
} from './contact.schema.js';
import { pairOf } from './domain/contact-rules.js';

/**
 * "Có thể trùng" (ADR-033). A pair whose profile expired is read as gone: the reader deletes it,
 * so the TTL of either profile needs nothing from the pairs.
 */
@Injectable()
export class MergeSuggestionsRepository {
  constructor(private readonly databases: WorkspaceDatabases) {}

  /** Suggests the pair unless it was suggested before (open or dismissed): nothing happens then. */
  async suggest(
    ref: WorkspaceRef,
    siteId: ObjectId,
    a: ObjectId,
    b: ObjectId,
    reason: StoredMergeReason,
    at: Date,
    expiresAt: Date | null,
  ): Promise<void> {
    const pair = pairOf(a, b);
    try {
      await this.suggestions(ref).create({
        workspaceId: ref.workspaceId,
        siteId,
        contactIds: pair.ids,
        pairKey: pair.key,
        reason,
        dismissedAt: null,
        createdAt: at,
        expiresAt,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error, MERGE_SUGGESTIONS_PAIR_INDEX)) {
        throw error;
      }
    }
  }

  /** The open pairs of the site, oldest first. */
  listOpen(
    scope: WorkspaceScope,
    siteId: ObjectId,
    limit: number,
  ): Promise<MergeSuggestionRecord[]> {
    return this.suggestions(scope)
      .find({ workspaceId: scope.workspaceId, siteId, dismissedAt: null })
      .sort({ createdAt: 1, _id: 1 })
      .limit(limit)
      .lean<MergeSuggestionRecord[]>()
      .exec();
  }

  countOpen(scope: WorkspaceScope, siteId: ObjectId, limit: number): Promise<number> {
    return this.suggestions(scope)
      .countDocuments({ workspaceId: scope.workspaceId, siteId, dismissedAt: null }, { limit })
      .exec();
  }

  /** Which of these profiles are in an open pair: the "CÓ THỂ TRÙNG" mark of a row. */
  async openFor(
    scope: WorkspaceScope,
    siteId: ObjectId,
    contactIds: readonly ObjectId[],
  ): Promise<MergeSuggestionRecord[]> {
    if (contactIds.length === 0) {
      return [];
    }
    return this.suggestions(scope)
      .find({
        workspaceId: scope.workspaceId,
        siteId,
        contactIds: { $in: contactIds },
        dismissedAt: null,
      })
      .lean<MergeSuggestionRecord[]>()
      .exec();
  }

  findOpen(
    scope: WorkspaceScope,
    siteId: ObjectId,
    id: ObjectId,
    tx?: Tx,
  ): Promise<MergeSuggestionRecord | null> {
    return this.suggestions(scope)
      .findOne({ _id: id, workspaceId: scope.workspaceId, siteId, dismissedAt: null })
      .session(tx ?? null)
      .lean<MergeSuggestionRecord>()
      .exec();
  }

  /** "Không phải cùng người": the pair stays, dismissed, so it is never suggested again. */
  async dismiss(scope: WorkspaceScope, siteId: ObjectId, id: ObjectId, at: Date): Promise<boolean> {
    const result = await this.suggestions(scope)
      .updateOne(
        { _id: id, workspaceId: scope.workspaceId, siteId, dismissedAt: null },
        { $set: { dismissedAt: at } },
      )
      .exec();
    return result.modifiedCount === 1;
  }

  /** The pairs of profiles that are gone: merged, deleted with the person, or expired. */
  async deleteForContacts(
    ref: WorkspaceRef,
    siteId: ObjectId,
    contactIds: readonly ObjectId[],
    tx?: Tx,
  ): Promise<void> {
    if (contactIds.length === 0) {
      return;
    }
    await this.suggestions(ref)
      .deleteMany({ workspaceId: ref.workspaceId, siteId, contactIds: { $in: contactIds } })
      .session(tx ?? null)
      .exec();
  }

  private suggestions(ref: WorkspaceRef): Model<MergeSuggestionRecord> {
    return this.databases.model(ref, MERGE_SUGGESTION_COLLECTION);
  }
}
