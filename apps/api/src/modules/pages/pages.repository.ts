import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Composition, MAX_PAGES_PER_SITE, type PageGoal, type Seo } from '@plp/contracts';
import type { Model } from 'mongoose';
import { AppError } from '../../shared/errors.js';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import {
  PAGE_MODEL,
  PAGES_DRAFT_SLUG_INDEX,
  PAGES_PUBLISHED_SLUG_INDEX,
  type PageRecord,
} from './page.schema.js';

export const DRAFT_SLUG_TAKEN_MESSAGE = 'Đường dẫn này đã được một trang khác trong site dùng';

/** The minimum needed to check access to a page through its site. */
export interface PageAccessRef {
  id: ObjectId;
  workspaceId: ObjectId;
  siteId: ObjectId;
}

/** A page that is live, as other pages see it (slug checks, links, sitemap). */
export interface LivePageRow {
  _id: ObjectId;
  title: string;
  publishedSlug: string;
  publishedReleaseId: ObjectId;
}

export interface CreatePageInput {
  siteId: ObjectId;
  title: string;
  goal: PageGoal | null;
  slug: string;
  composition: Composition;
  seo: Seo;
}

export interface DraftContent {
  slug: string;
  composition: Composition;
  seo: Seo;
}

/** The live pointer after a move: a release and its slug, or null when unpublished. */
export interface PointerTarget {
  releaseId: ObjectId;
  slug: string;
}

/** Another page of the site is live at the slug a pointer move wanted (unique index). */
export class LiveSlugTakenError extends Error {
  constructor(
    readonly slug: string,
    options: { cause: unknown },
  ) {
    super(`Another page is live at slug "${slug}"`, options);
    this.name = 'LiveSlugTakenError';
  }
}

function draftSlugTaken(cause: unknown): AppError {
  return new AppError(409, 'slug_taken', DRAFT_SLUG_TAKEN_MESSAGE, {
    issues: [{ path: ['slug'], code: 'slug_taken', message: DRAFT_SLUG_TAKEN_MESSAGE }],
    cause,
  });
}

const LIVE_FILTER = { publishedSlug: { $type: 'string' } } as const;
const LIVE_PROJECTION = { title: 1, publishedSlug: 1, publishedReleaseId: 1 } as const;

@Injectable()
export class PagesRepository {
  constructor(@InjectModel(PAGE_MODEL) private readonly pages: Model<PageRecord>) {}

  /** Unscoped lookup by id that only returns where the page lives, for access checks. */
  async findAccessRef(id: ObjectId): Promise<PageAccessRef | null> {
    const page = await this.pages
      .findById(id, { workspaceId: 1, siteId: 1 })
      .lean<Pick<PageRecord, '_id' | 'workspaceId' | 'siteId'>>()
      .exec();
    return page ? { id: page._id, workspaceId: page.workspaceId, siteId: page.siteId } : null;
  }

  findById(scope: WorkspaceScope, id: ObjectId): Promise<PageRecord | null> {
    return this.pages
      .findOne({ _id: id, workspaceId: scope.workspaceId })
      .lean<PageRecord>()
      .exec();
  }

  /**
   * Every page of a site, most recently updated first. A site holds at most `MAX_PAGES_PER_SITE`
   * pages (ADR-014), so per-site computations (counts, attention) stay bounded.
   */
  listForSite(scope: WorkspaceScope, siteId: ObjectId): Promise<PageRecord[]> {
    return this.pages
      .find({ workspaceId: scope.workspaceId, siteId })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(MAX_PAGES_PER_SITE)
      .lean<PageRecord[]>()
      .exec();
  }

  countForSite(scope: WorkspaceScope, siteId: ObjectId): Promise<number> {
    return this.pages.countDocuments({ workspaceId: scope.workspaceId, siteId }).exec();
  }

  /** Pages of the site that are live right now. */
  listLiveForSite(scope: WorkspaceScope, siteId: ObjectId): Promise<LivePageRow[]> {
    return this.pages
      .find({ workspaceId: scope.workspaceId, siteId, ...LIVE_FILTER }, LIVE_PROJECTION)
      .limit(MAX_PAGES_PER_SITE)
      .lean<LivePageRow[]>()
      .exec();
  }

  /** Another page of the site that uses `slug` as its draft or live slug. */
  findSlugOwner(
    scope: WorkspaceScope,
    siteId: ObjectId,
    slug: string,
    exceptPageId: ObjectId | null,
  ): Promise<Pick<PageRecord, '_id' | 'title'> | null> {
    return this.pages
      .findOne(
        {
          workspaceId: scope.workspaceId,
          siteId,
          $or: [{ 'draft.slug': slug }, { publishedSlug: slug }],
          ...(exceptPageId ? { _id: { $ne: exceptPageId } } : {}),
        },
        { title: 1 },
      )
      .lean<Pick<PageRecord, '_id' | 'title'>>()
      .exec();
  }

  /** The page live at `slug` in the site, if any. */
  findLiveBySlug(
    scope: WorkspaceScope,
    siteId: ObjectId,
    slug: string,
  ): Promise<Pick<PageRecord, '_id' | 'title'> | null> {
    return this.pages
      .findOne({ workspaceId: scope.workspaceId, siteId, publishedSlug: slug }, { title: 1 })
      .lean<Pick<PageRecord, '_id' | 'title'>>()
      .exec();
  }

  /** Inserts a page created by the scope's user. A duplicate draft slug is 409 `slug_taken`. */
  async create(scope: WorkspaceScope, input: CreatePageInput, tx: Tx): Promise<PageRecord> {
    const now = new Date();
    const document = {
      workspaceId: scope.workspaceId,
      siteId: input.siteId,
      title: input.title,
      goal: input.goal,
      draft: {
        slug: input.slug,
        composition: input.composition,
        seo: input.seo,
        revision: 0,
        updatedAt: now,
        updatedBy: scope.userId,
      },
      publishedReleaseId: null,
      publishedSlug: null,
      releaseSeq: 0,
      createdBy: scope.userId,
      createdAt: now,
      updatedAt: now,
    };
    try {
      const [page] = await this.pages.create([document], { session: tx });
      if (!page) {
        throw new Error('Page insert returned no document');
      }
      return page.toObject();
    } catch (error) {
      if (isDuplicateKeyError(error, PAGES_DRAFT_SLUG_INDEX)) {
        throw draftSlugTaken(error);
      }
      throw error;
    }
  }

  /**
   * Replaces the draft if it is still at `baseRevision` and increments the revision (ADR-005).
   * Returns null when the page is not in scope or the revision moved on; a duplicate draft slug is
   * 409 `slug_taken`.
   */
  async replaceDraft(
    scope: WorkspaceScope,
    id: ObjectId,
    baseRevision: number,
    content: DraftContent,
    tx?: Tx,
  ): Promise<PageRecord | null> {
    const now = new Date();
    try {
      return await this.pages
        .findOneAndUpdate(
          { _id: id, workspaceId: scope.workspaceId, 'draft.revision': baseRevision },
          {
            $set: {
              'draft.slug': content.slug,
              'draft.composition': content.composition,
              'draft.seo': content.seo,
              'draft.updatedAt': now,
              'draft.updatedBy': scope.userId,
              updatedAt: now,
            },
            $inc: { 'draft.revision': 1 },
          },
          { returnDocument: 'after', ...(tx ? { session: tx } : {}) },
        )
        .lean<PageRecord>()
        .exec();
    } catch (error) {
      if (isDuplicateKeyError(error, PAGES_DRAFT_SLUG_INDEX)) {
        throw draftSlugTaken(error);
      }
      throw error;
    }
  }

  /**
   * Claims the next release version inside the publish transaction: increments `releaseSeq` only
   * while the draft revision, the pointer and the sequence are the ones the publish was checked
   * against. False means a concurrent change; nothing was written.
   */
  async claimReleaseVersion(
    scope: WorkspaceScope,
    page: Pick<PageRecord, '_id' | 'releaseSeq' | 'publishedReleaseId'>,
    revision: number,
    tx: Tx,
  ): Promise<boolean> {
    const result = await this.pages
      .updateOne(
        {
          _id: page._id,
          workspaceId: scope.workspaceId,
          'draft.revision': revision,
          releaseSeq: page.releaseSeq,
          publishedReleaseId: page.publishedReleaseId,
        },
        { $inc: { releaseSeq: 1 } },
        { session: tx },
      )
      .exec();
    return result.matchedCount === 1;
  }

  /**
   * The only write of `publishedReleaseId`/`publishedSlug`; called by `PointerService.movePointer`
   * and nothing else. Conditional on the pointer still being `expectedCurrent`: false means it
   * moved. Another page live at the target slug throws `LiveSlugTakenError`.
   */
  async setPointer(
    scope: WorkspaceScope,
    id: ObjectId,
    expectedCurrent: ObjectId | null,
    target: PointerTarget | null,
    tx: Tx,
  ): Promise<boolean> {
    try {
      const result = await this.pages
        .updateOne(
          { _id: id, workspaceId: scope.workspaceId, publishedReleaseId: expectedCurrent },
          {
            $set: {
              publishedReleaseId: target?.releaseId ?? null,
              publishedSlug: target?.slug ?? null,
              updatedAt: new Date(),
            },
          },
          { session: tx },
        )
        .exec();
      return result.matchedCount === 1;
    } catch (error) {
      if (target && isDuplicateKeyError(error, PAGES_PUBLISHED_SLUG_INDEX)) {
        throw new LiveSlugTakenError(target.slug, { cause: error });
      }
      throw error;
    }
  }

  /* Public delivery and signed previews have no user: these lookups are unscoped. The site always
     comes from the request host or a signed token, and callers check that records belong to it. */

  findPublicById(id: ObjectId): Promise<PageRecord | null> {
    return this.pages.findById(id).lean<PageRecord>().exec();
  }

  findPublicLiveBySlug(siteId: ObjectId, slug: string): Promise<LivePageRow | null> {
    return this.pages
      .findOne({ siteId, publishedSlug: slug }, LIVE_PROJECTION)
      .lean<LivePageRow>()
      .exec();
  }

  /** Live pages of a site (sitemap). */
  listPublicLiveForSite(siteId: ObjectId): Promise<LivePageRow[]> {
    return this.pages
      .find({ siteId, ...LIVE_FILTER }, LIVE_PROJECTION)
      .limit(MAX_PAGES_PER_SITE)
      .lean<LivePageRow[]>()
      .exec();
  }

  /** Live slugs of the pages among `ids` in the site, keyed by id hex; others are absent. */
  async findPublicLiveSlugs(
    siteId: ObjectId,
    ids: readonly ObjectId[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }
    const pages = await this.pages
      .find({ siteId, _id: { $in: [...ids] }, ...LIVE_FILTER }, { publishedSlug: 1 })
      .lean<Pick<LivePageRow, '_id' | 'publishedSlug'>[]>()
      .exec();
    return new Map(pages.map((page) => [page._id.toHexString(), page.publishedSlug]));
  }
}
