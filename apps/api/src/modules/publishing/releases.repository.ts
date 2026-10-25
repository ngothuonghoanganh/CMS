import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ChangeItem, Composition, Seo } from '@plp/contracts';
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import {
  afterCursor,
  type KeysetPage,
  NEWEST_FIRST,
  toKeysetPage,
} from '../../shared/persistence/keyset.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import type { SitePresentation } from './domain/site-presentation.js';
import { RELEASE_MODEL, RELEASES_IDEMPOTENCY_INDEX, type ReleaseRecord } from './release.schema.js';

export interface InsertReleaseInput {
  siteId: ObjectId;
  pageId: ObjectId;
  version: number;
  slug: string;
  composition: Composition;
  seo: Seo;
  sitePresentation: SitePresentation;
  sourceRevision: number;
  note: string;
  changeSummary: ChangeItem[];
  warningsAcknowledged: string[];
  idempotencyKey: string;
}

/** Another request already published with the same `Idempotency-Key` for this page. */
export class IdempotencyKeyUsedError extends Error {
  constructor(options: { cause: unknown }) {
    super('A release with this idempotency key already exists', options);
    this.name = 'IdempotencyKeyUsedError';
  }
}

function uniqueIds(ids: readonly ObjectId[]): ObjectId[] {
  return [...new Map(ids.map((id) => [id.toHexString(), id])).values()];
}

/**
 * Releases are immutable (ADR-005): this repository only inserts and finds. There is deliberately
 * no update or delete method, and the schema rejects update/delete queries.
 */
@Injectable()
export class ReleasesRepository {
  constructor(@InjectModel(RELEASE_MODEL) private readonly releases: Model<ReleaseRecord>) {}

  /** Inserts a release created by the scope's user, inside the publish transaction. */
  async insert(scope: WorkspaceScope, input: InsertReleaseInput, tx: Tx): Promise<ReleaseRecord> {
    const { warningsAcknowledged, ...fields } = input;
    const document = {
      workspaceId: scope.workspaceId,
      ...fields,
      checks: { warningsAcknowledged },
      createdBy: scope.userId,
      createdAt: new Date(),
    };
    try {
      const [release] = await this.releases.create([document], { session: tx });
      if (!release) {
        throw new Error('Release insert returned no document');
      }
      return release.toObject();
    } catch (error) {
      if (isDuplicateKeyError(error, RELEASES_IDEMPOTENCY_INDEX)) {
        throw new IdempotencyKeyUsedError({ cause: error });
      }
      throw error;
    }
  }

  findById(scope: WorkspaceScope, id: ObjectId): Promise<ReleaseRecord | null> {
    return this.releases
      .findOne({ _id: id, workspaceId: scope.workspaceId })
      .lean<ReleaseRecord>()
      .exec();
  }

  /** Releases among `ids`, keyed by id hex (e.g. the live releases of a page list, one `$in`). */
  async findByIds(
    scope: WorkspaceScope,
    ids: readonly ObjectId[],
  ): Promise<Map<string, ReleaseRecord>> {
    const unique = uniqueIds(ids);
    if (unique.length === 0) {
      return new Map();
    }
    const releases = await this.releases
      .find({ workspaceId: scope.workspaceId, _id: { $in: unique } })
      .lean<ReleaseRecord[]>()
      .exec();
    return new Map(releases.map((release) => [release._id.toHexString(), release]));
  }

  findByIdempotencyKey(
    scope: WorkspaceScope,
    pageId: ObjectId,
    idempotencyKey: string,
  ): Promise<ReleaseRecord | null> {
    return this.releases
      .findOne({ workspaceId: scope.workspaceId, pageId, idempotencyKey })
      .lean<ReleaseRecord>()
      .exec();
  }

  /** Releases of a page, newest first (history). */
  async listForPage(
    scope: WorkspaceScope,
    pageId: ObjectId,
    cursor: string | undefined,
    limit: number,
  ): Promise<KeysetPage<ReleaseRecord>> {
    const records = await this.releases
      .find({ workspaceId: scope.workspaceId, pageId, ...afterCursor(cursor) })
      .sort(NEWEST_FIRST)
      .limit(limit + 1)
      .lean<ReleaseRecord[]>()
      .exec();
    return toKeysetPage(records, limit);
  }

  /**
   * Unscoped lookup for public delivery and signed previews, which have no user. Callers check
   * that the release belongs to the site resolved from the request (host or signed token).
   */
  findPublicById(id: ObjectId): Promise<ReleaseRecord | null> {
    return this.releases.findById(id).lean<ReleaseRecord>().exec();
  }

  /** Unscoped variant of `findByIds` for public delivery, limited to one site (the sitemap). */
  async findPublicForSite(
    siteId: ObjectId,
    ids: readonly ObjectId[],
  ): Promise<Map<string, ReleaseRecord>> {
    const unique = uniqueIds(ids);
    if (unique.length === 0) {
      return new Map();
    }
    const releases = await this.releases
      .find({ siteId, _id: { $in: unique } })
      .lean<ReleaseRecord[]>()
      .exec();
    return new Map(releases.map((release) => [release._id.toHexString(), release]));
  }
}
