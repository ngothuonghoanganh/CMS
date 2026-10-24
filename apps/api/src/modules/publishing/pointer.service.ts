import { Injectable, Logger } from '@nestjs/common';
import type { ActivityType, RevalidationResult } from '@plp/contracts';
import { AppError } from '../../shared/errors.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner, type Tx } from '../../shared/persistence/transaction.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import type { PageRecord } from '../pages/page.schema.js';
import { LiveSlugTakenError, PagesRepository } from '../pages/pages.repository.js';
import { RevalidationClient } from '../revalidation/revalidation.client.js';
import type { SiteRecord } from '../sites/site.schema.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { RedirectsRepository } from './redirects.repository.js';
import type { ReleaseRecord } from './release.schema.js';

/** Pointer moves and the activity each one records. */
export type PointerActivityType = Extract<
  ActivityType,
  'page.published' | 'page.rolled_back' | 'page.rollback_undone' | 'page.unpublished'
>;

export interface PointerMove {
  scope: WorkspaceScope;
  page: Pick<PageRecord, '_id' | 'siteId' | 'title'>;
  /** The release live before the move (the expected current pointer), or null if none was. */
  from: ReleaseRecord | null;
  /** The release to make live, or null to unpublish the page. */
  target: ReleaseRecord | null;
  reason: string | null;
  activityType: PointerActivityType;
  /** Error when the pointer is no longer `from`; defaults to 409 `pointer_conflict`. */
  onConflict?: () => AppError;
}

/** 409 when the live pointer is not where the client (or this request) expected it. */
export function pointerConflict(): AppError {
  return new AppError(
    409,
    'pointer_conflict',
    'Trang live vừa được thay đổi bởi một thao tác khác',
    {
      detail: 'Tải lại để xem phiên bản đang live rồi thử lại.',
    },
  );
}

function liveSlugTaken(slug: string, ownerTitle: string | null, cause: unknown): AppError {
  const title =
    ownerTitle === null
      ? `Đường dẫn /${slug} đang được một trang khác dùng`
      : `Đường dẫn /${slug} đang được trang “${ownerTitle}” dùng`;
  return new AppError(409, 'slug_taken', title, { cause });
}

@Injectable()
export class PointerService {
  private readonly logger = new Logger(PointerService.name);

  constructor(
    private readonly pages: PagesRepository,
    private readonly redirects: RedirectsRepository,
    private readonly activity: ActivityRepository,
    private readonly revalidation: RevalidationClient,
    private readonly transactions: TransactionRunner,
  ) {}

  /**
   * Runs a unit of work containing a pointer move in one transaction (ADR-006). Another page live
   * at the target slug aborts everything and becomes 409 `slug_taken`, named after that page.
   */
  async transaction<T>(
    scope: WorkspaceScope,
    siteId: ObjectId,
    work: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.transactions.run(work);
    } catch (error) {
      if (error instanceof LiveSlugTakenError) {
        // The transaction is aborted; this read happens outside of it.
        const owner = await this.pages.findLiveBySlug(scope, siteId, error.slug);
        throw liveSlugTaken(error.slug, owner?.title ?? null, error);
      }
      throw error;
    }
  }

  /**
   * `movePointer` (ADR-006), the only path that changes what is live. Inside `tx`:
   * 1. conditional pointer update (`publishedReleaseId === from`), else 409;
   * 2. when the live slug changes, a redirect from the old slug to the page;
   * 3. removal of any redirect from the new live slug;
   * 4. the activity with versions, release ids, reason and the page title.
   * Unpublishing keeps existing redirects; they answer 404 while the page is not live.
   * Returns the activity id.
   */
  async movePointer(move: PointerMove, tx: Tx): Promise<ObjectId> {
    const { scope, page, from, target } = move;
    const moved = await this.pages.setPointer(
      scope,
      page._id,
      from?._id ?? null,
      target ? { releaseId: target._id, slug: target.slug } : null,
      tx,
    );
    if (!moved) {
      throw move.onConflict ? move.onConflict() : pointerConflict();
    }
    if (target) {
      if (from && from.slug !== target.slug) {
        await this.redirects.upsert(scope, page.siteId, from.slug, page._id, tx);
      }
      await this.redirects.deleteFrom(scope, page.siteId, target.slug, tx);
    }
    return this.activity.record(
      scope,
      {
        siteId: page.siteId,
        type: move.activityType,
        page: { id: page._id, title: page.title },
        data: {
          version: move.activityType === 'page.published' && target ? target.version : null,
          fromVersion: from?.version ?? null,
          toVersion: target?.version ?? null,
          fromReleaseId: from?._id ?? null,
          toReleaseId: target?._id ?? null,
        },
        reason: move.reason,
      },
      tx,
    );
  }

  /**
   * After the commit: refreshes the renderer's cache of the site (ADR-009). A failure never fails
   * the request; it flags the activity so the UI reports it.
   */
  async revalidate(
    site: Pick<SiteRecord, 'subdomain'>,
    activityId: ObjectId,
  ): Promise<RevalidationResult> {
    const result = await this.revalidation.revalidateSite(site.subdomain);
    if (result === 'failed') {
      try {
        await this.activity.markRevalidationFailed(activityId);
      } catch (error) {
        // The pointer move is committed; report the bookkeeping failure without failing the request.
        this.logger.error(
          { err: error, activityId: activityId.toHexString() },
          'Could not flag the activity after a failed revalidation',
        );
      }
    }
    return result;
  }
}
