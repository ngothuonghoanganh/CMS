import { Injectable } from '@nestjs/common';
import type {
  ChangeItem,
  ChecksResult,
  CursorQuery,
  HistoryEntry,
  HistoryResponse,
  PageSummary,
  PointerMoveRequest,
  PointerMoveResponse,
  PublishRequest,
  PublishResponse,
  UserRef,
} from '@plp/contracts';
import { AppError, notFound } from '../../shared/errors.js';
import type { KeysetPage } from '../../shared/persistence/keyset.js';
import { type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import type { ActivityRecord } from '../activity/activity.schema.js';
import { isUndoable } from '../activity/pointer-events.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { UsersRepository } from '../auth/users.repository.js';
import { PAGE_NOT_FOUND, PageAccessService } from '../pages/page-access.service.js';
import { liveUrlOf } from '../pages/page-dto.js';
import { revisionConflict } from '../pages/page-errors.js';
import { PageEvaluator } from '../pages/page-evaluator.service.js';
import type { PageRecord } from '../pages/page.schema.js';
import { PagesRepository } from '../pages/pages.repository.js';
import type { SiteRecord } from '../sites/site.schema.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { SitesService } from '../sites/sites.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { diffSnapshots } from './domain/diff-snapshots.js';
import { diffSitePresentation } from './domain/site-presentation.js';
import { emptyPageSnapshot } from './domain/snapshot.js';
import { mergeKeysetPages } from './history-merge.js';
import { pointerConflict, PointerService } from './pointer.service.js';
import { RELEASE_NOT_FOUND, toReleaseSummary } from './release-dto.js';
import { currentSitePresentation, releasePresentation } from './release-presentation.js';
import type { ReleaseRecord } from './release.schema.js';
import { IdempotencyKeyUsedError, ReleasesRepository } from './releases.repository.js';

export const ACTIVITY_NOT_FOUND = 'Không tìm thấy hoạt động';
export const UNDO_NOT_AVAILABLE_MESSAGE =
  'Không thể hoàn tác vì trang đã thay đổi sau lần khôi phục này';

/** Pointer moves listed in the history next to releases (publishing is shown by the release). */
const HISTORY_POINTER_TYPES = [
  'page.rolled_back',
  'page.rollback_undone',
  'page.unpublished',
] as const;

const HISTORY_POINTER_KIND = {
  'page.rolled_back': 'rolled_back',
  'page.rollback_undone': 'rollback_undone',
  'page.unpublished': 'unpublished',
} as const;

function undoNotAvailable(): AppError {
  return new AppError(409, 'undo_not_available', UNDO_NOT_AVAILABLE_MESSAGE);
}

function sameRelease(current: ObjectId | null, expected: string | null): boolean {
  return current === null ? expected === null : current.toHexString() === expected;
}

/** Whether the site-settings chips are the ones the user saw, in any order. */
function sameLabels(changes: readonly ChangeItem[], seen: readonly string[]): boolean {
  const expected = new Set(seen);
  return changes.length === expected.size && changes.every((change) => expected.has(change.label));
}

function userRef(users: ReadonlyMap<string, UserRef>, id: ObjectId): UserRef {
  const user = users.get(id.toHexString());
  if (!user) {
    throw new Error(`Unknown user ${id.toHexString()}`);
  }
  return user;
}

type HistoryRow =
  | { kind: 'release'; _id: ObjectId; createdAt: Date; release: ReleaseRecord }
  | { kind: 'pointer'; _id: ObjectId; createdAt: Date; event: ActivityRecord };

interface CommittedRelease {
  release: ReleaseRecord;
  activityId: ObjectId;
  /** The site as the publish transaction read it (its settings are in the release). */
  site: SiteRecord;
}

export interface PublishOutcome {
  response: PublishResponse;
  /** True when the idempotency key was already used: the earlier result is returned again. */
  replayed: boolean;
}

/** Publish, rollback, undo, unpublish and history (ADR-006). */
@Injectable()
export class PublishingService {
  constructor(
    private readonly pageAccess: PageAccessService,
    private readonly pages: PagesRepository,
    private readonly releases: ReleasesRepository,
    private readonly evaluator: PageEvaluator,
    private readonly pointer: PointerService,
    private readonly activity: ActivityRepository,
    private readonly users: UsersRepository,
    private readonly sites: SitesService,
    private readonly siteRecords: SitesRepository,
  ) {}

  async checks(user: AuthenticatedUser, pageId: string): Promise<ChecksResult> {
    const { scope, site, page } = await this.pageAccess.access(user, pageId);
    return (await this.evaluator.evaluate(scope, site, page)).checks;
  }

  /**
   * Publish (ADR-006):
   * 1. a release with this idempotency key exists → the same result again;
   * 2. the draft revision or the live pointer moved → 409;
   * 3. any blocking check or unacknowledged warning → 422 with the checks;
   * 4. one transaction: claim the version, insert the release, move the pointer, record activity;
   * 5. after the commit, revalidate the renderer.
   */
  async publish(
    user: AuthenticatedUser,
    pageId: string,
    idempotencyKey: string,
    input: PublishRequest,
  ): Promise<PublishOutcome> {
    const { scope, site, page } = await this.pageAccess.access(user, pageId);
    const existing = await this.releases.findByIdempotencyKey(scope, page._id, idempotencyKey);
    if (existing) {
      return { response: await this.replay(scope, site, existing), replayed: true };
    }
    if (page.draft.revision !== input.expectedRevision) {
      throw revisionConflict(page.draft.revision);
    }
    if (!sameRelease(page.publishedReleaseId, input.expectedPublishedReleaseId)) {
      throw pointerConflict();
    }
    const { checks } = await this.evaluator.evaluate(scope, site, page);
    const acknowledged = new Set(input.acknowledgedWarnings);
    if (
      checks.blocking.length > 0 ||
      checks.warnings.some((warning) => !acknowledged.has(warning.fingerprint))
    ) {
      throw new AppError(422, 'publish_blocked', 'Chưa thể xuất bản', {
        detail: 'Sửa các lỗi chặn, và sửa hoặc bỏ qua từng cảnh báo trước khi xuất bản.',
        context: { checks },
      });
    }
    let committed: CommittedRelease;
    try {
      committed = await this.commitRelease(scope, site, page, {
        idempotencyKey,
        note: input.note,
        warningsAcknowledged: checks.warnings.map((warning) => warning.fingerprint),
        acknowledgedSiteChanges: input.acknowledgedSiteChanges,
      });
    } catch (error) {
      const raced =
        error instanceof IdempotencyKeyUsedError ||
        (error instanceof AppError && error.status === 409);
      if (!raced) {
        throw error;
      }
      // A concurrent request with the same key may have committed first (its version claim or its
      // key made this one fail): then this request is a retry and gets that result.
      const winner = await this.releases.findByIdempotencyKey(scope, page._id, idempotencyKey);
      if (winner) {
        return { response: await this.replay(scope, site, winner), replayed: true };
      }
      if (error instanceof IdempotencyKeyUsedError) {
        throw new Error('The release that used this idempotency key disappeared', {
          cause: error,
        });
      }
      throw error;
    }

    const revalidation = await this.pointer.revalidate(site, committed.activityId);
    // The site as the transaction read it, so the summary compares the new release with it.
    const summary = await this.summaryOf(scope, committed.site, page._id);
    return {
      response: {
        release: toReleaseSummary(committed.release, {
          id: user.id.toHexString(),
          name: user.name,
        }),
        page: summary,
        liveUrl: liveUrlOf(this.sites.defaultOrigin(site), committed.release.slug),
        revalidation,
      },
      replayed: false,
    };
  }

  /**
   * Step 4 of publish, in one transaction: claim version `releaseSeq + 1` (guarded by revision,
   * pointer and sequence), snapshot the site settings, insert the release, then `movePointer`
   * records the activity. Any failure aborts everything, so no release exists without its pointer
   * move.
   */
  private async commitRelease(
    scope: WorkspaceScope,
    site: SiteRecord,
    page: PageRecord,
    {
      acknowledgedSiteChanges,
      ...meta
    }: {
      idempotencyKey: string;
      note: string;
      warningsAcknowledged: string[];
      acknowledgedSiteChanges: string[];
    },
  ): Promise<CommittedRelease> {
    const from = await this.liveReleaseOf(scope, page);
    const pageChanges = diffSnapshots(from ?? emptyPageSnapshot(page.draft.slug), page.draft);
    return this.pointer.transaction(scope, site._id, async (tx) => {
      if (!(await this.pages.claimReleaseVersion(scope, page, page.draft.revision, tx))) {
        throw await this.publishConflict(scope, page._id, page.draft.revision);
      }
      // The site settings are read in the transaction that makes the release live (ADR-015).
      const current = await this.siteRecords.findById(scope, site._id, tx);
      if (!current) {
        throw new Error(`Site ${site._id.toHexString()} of page ${page._id.toHexString()} is gone`);
      }
      const sitePresentation = currentSitePresentation(current);
      // A first publish (or one after unpublishing) has no previously live look to differ from.
      const siteChanges =
        from === null
          ? []
          : diffSitePresentation(releasePresentation(from, current), sitePresentation);
      if (!sameLabels(siteChanges, acknowledgedSiteChanges)) {
        throw new AppError(409, 'site_changed', 'Cài đặt site vừa thay đổi', {
          detail:
            'Giao diện site đã được đổi trong lúc bạn xuất bản. Xem lại thay đổi rồi xuất bản.',
        });
      }
      const release = await this.releases.insert(
        scope,
        {
          siteId: site._id,
          pageId: page._id,
          version: page.releaseSeq + 1,
          slug: page.draft.slug,
          composition: page.draft.composition,
          seo: page.draft.seo,
          sitePresentation,
          sourceRevision: page.draft.revision,
          changeSummary: [...pageChanges, ...siteChanges],
          ...meta,
        },
        tx,
      );
      const activityId = await this.pointer.movePointer(
        { scope, page, from, target: release, reason: null, activityType: 'page.published' },
        tx,
      );
      return { release, activityId, site: current };
    });
  }

  /**
   * Rollback (target = a release of this page) or unpublish (target = null). Only the pointer
   * moves; releases and the draft are never touched (business rule 4).
   */
  async movePointer(
    user: AuthenticatedUser,
    pageId: string,
    input: PointerMoveRequest,
  ): Promise<PointerMoveResponse> {
    const { scope, site, page } = await this.pageAccess.access(user, pageId);
    const target =
      input.targetReleaseId === null
        ? null
        : await this.releaseOfPage(scope, page, input.targetReleaseId);
    if (!sameRelease(page.publishedReleaseId, input.expectedCurrentReleaseId)) {
      throw pointerConflict();
    }
    if (sameRelease(page.publishedReleaseId, target?._id.toHexString() ?? null)) {
      throw new AppError(
        409,
        'conflict',
        target ? 'Phiên bản này đang live' : 'Trang hiện không live',
      );
    }
    const from = await this.liveReleaseOf(scope, page);
    const activityId = await this.pointer.transaction(scope, site._id, (tx) =>
      this.pointer.movePointer(
        {
          scope,
          page,
          from,
          target,
          reason: input.reason,
          activityType: target ? 'page.rolled_back' : 'page.unpublished',
        },
        tx,
      ),
    );
    return this.pointerMoved(scope, site, page._id, activityId);
  }

  /**
   * Undo of a rollback: moves the pointer back to the release live before it, while that rollback
   * is still the page's latest pointer event (ADR-006). The check runs again inside the
   * transaction, so a publish or rollback committed in between makes the undo fail with
   * `undo_not_available`, even when the pointer is back on the rollback's target.
   */
  async undo(user: AuthenticatedUser, activityId: string): Promise<PointerMoveResponse> {
    const id = toObjectId(activityId, ACTIVITY_NOT_FOUND);
    const ref = await this.activity.findAccessRef(id);
    if (!ref) {
      throw notFound(ACTIVITY_NOT_FOUND);
    }
    const { scope, site } = await this.sites.accessById(user, ref.siteId, ACTIVITY_NOT_FOUND);
    const rollback = await this.activity.findById(scope, id);
    if (!rollback) {
      throw notFound(ACTIVITY_NOT_FOUND);
    }
    const pageId = rollback.pageId;
    if (rollback.type !== 'page.rolled_back' || pageId === null) {
      throw undoNotAvailable();
    }
    const latest = await this.activity.latestPointerEvents(scope, [pageId]);
    if (!isUndoable(rollback, latest.get(pageId.toHexString()))) {
      throw undoNotAvailable();
    }
    const page = await this.pages.findById(scope, pageId);
    if (!page) {
      throw new Error(`Rollback ${activityId} refers to missing page ${pageId.toHexString()}`);
    }
    const [from, target] = await Promise.all([
      this.requiredRelease(scope, rollback.data.toReleaseId),
      this.requiredRelease(scope, rollback.data.fromReleaseId),
    ]);
    const reason =
      rollback.reason === null ? 'Hoàn tác khôi phục' : `Hoàn tác khôi phục: ${rollback.reason}`;
    const undoId = await this.pointer.transaction(scope, site._id, async (tx) => {
      const latestInTx = await this.activity.latestPointerEvents(scope, [pageId], tx);
      if (!isUndoable(rollback, latestInTx.get(pageId.toHexString()))) {
        throw undoNotAvailable();
      }
      return this.pointer.movePointer(
        {
          scope,
          page,
          from,
          target,
          reason,
          activityType: 'page.rollback_undone',
          onConflict: undoNotAvailable,
        },
        tx,
      );
    });
    return this.pointerMoved(scope, site, page._id, undoId);
  }

  /** Releases and pointer moves of a page, newest first, with one cursor across both. */
  async history(
    user: AuthenticatedUser,
    pageId: string,
    query: CursorQuery,
  ): Promise<HistoryResponse> {
    const { scope, page } = await this.pageAccess.access(user, pageId);
    const [releases, events, latest] = await Promise.all([
      this.releases.listForPage(scope, page._id, query.cursor, query.limit),
      this.activity.listForPage(scope, page._id, query.cursor, query.limit, HISTORY_POINTER_TYPES),
      this.activity.latestPointerEvents(scope, [page._id]),
    ]);
    const releaseRows: KeysetPage<HistoryRow> = {
      items: releases.items.map((release) => ({
        kind: 'release',
        _id: release._id,
        createdAt: release.createdAt,
        release,
      })),
      nextCursor: releases.nextCursor,
    };
    const eventRows: KeysetPage<HistoryRow> = {
      items: events.items.map((event) => ({
        kind: 'pointer',
        _id: event._id,
        createdAt: event.createdAt,
        event,
      })),
      nextCursor: events.nextCursor,
    };
    const merged = mergeKeysetPages([releaseRows, eventRows], query.limit);
    const users = await this.users.findRefs(
      merged.items.map((row) =>
        row.kind === 'release' ? row.release.createdBy : row.event.actorId,
      ),
    );
    const latestEvent = latest.get(page._id.toHexString());
    return {
      items: merged.items.map((row) => this.toHistoryEntry(row, users, latestEvent)),
      nextCursor: merged.nextCursor,
      liveReleaseId: page.publishedReleaseId?.toHexString() ?? null,
      releaseCount: page.releaseSeq,
    };
  }

  private toHistoryEntry(
    row: HistoryRow,
    users: ReadonlyMap<string, UserRef>,
    latestEvent: ActivityRecord | undefined,
  ): HistoryEntry {
    if (row.kind === 'release') {
      return {
        kind: 'release',
        release: toReleaseSummary(row.release, userRef(users, row.release.createdBy)),
      };
    }
    const { event } = row;
    if (
      event.type !== 'page.rolled_back' &&
      event.type !== 'page.rollback_undone' &&
      event.type !== 'page.unpublished'
    ) {
      throw new Error(`Activity ${event._id.toHexString()} (${event.type}) is not a history event`);
    }
    return {
      kind: 'pointer',
      activityId: event._id.toHexString(),
      type: HISTORY_POINTER_KIND[event.type],
      fromVersion: event.data.fromVersion,
      toVersion: event.data.toVersion,
      reason: event.reason,
      by: userRef(users, event.actorId),
      at: event.createdAt.toISOString(),
      undoable: isUndoable(event, latestEvent),
    };
  }

  /** The earlier result of a publish, for a request repeating its idempotency key. */
  private async replay(
    scope: WorkspaceScope,
    site: SiteRecord,
    release: ReleaseRecord,
  ): Promise<PublishResponse> {
    const [summary, users, published] = await Promise.all([
      this.summaryOf(scope, site, release.pageId),
      this.users.findRefs([release.createdBy]),
      this.publishedEventOf(scope, release),
    ]);
    return {
      release: toReleaseSummary(release, userRef(users, release.createdBy)),
      page: summary,
      liveUrl: liveUrlOf(this.sites.defaultOrigin(site), release.slug),
      revalidation: published.data.revalidationFailed ? 'failed' : 'ok',
    };
  }

  /** The `page.published` event of a release, written in the same transaction as the release. */
  private async publishedEventOf(
    scope: WorkspaceScope,
    release: ReleaseRecord,
  ): Promise<ActivityRecord> {
    let cursor: string | undefined;
    do {
      const page = await this.activity.listForPage(scope, release.pageId, cursor, 50, [
        'page.published',
      ]);
      const event = page.items.find((item) => item.data.toReleaseId?.equals(release._id));
      if (event) {
        return event;
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
    throw new Error(`Release ${release._id.toHexString()} has no page.published activity`);
  }

  private async pointerMoved(
    scope: WorkspaceScope,
    site: SiteRecord,
    pageId: ObjectId,
    activityId: ObjectId,
  ): Promise<PointerMoveResponse> {
    const revalidation = await this.pointer.revalidate(site, activityId);
    return {
      activityId: activityId.toHexString(),
      page: await this.summaryOf(scope, site, pageId),
      revalidation,
    };
  }

  private async summaryOf(
    scope: WorkspaceScope,
    site: SiteRecord,
    pageId: ObjectId,
  ): Promise<PageSummary> {
    const page = await this.pages.findById(scope, pageId);
    if (!page) {
      throw notFound(PAGE_NOT_FOUND);
    }
    return (await this.evaluator.evaluate(scope, site, page)).summary;
  }

  /** The release the page's pointer designates, or null when nothing is live. */
  private async liveReleaseOf(
    scope: WorkspaceScope,
    page: PageRecord,
  ): Promise<ReleaseRecord | null> {
    return this.requiredRelease(scope, page.publishedReleaseId);
  }

  private async requiredRelease(
    scope: WorkspaceScope,
    id: ObjectId | null,
  ): Promise<ReleaseRecord | null> {
    if (id === null) {
      return null;
    }
    const release = await this.releases.findById(scope, id);
    if (!release) {
      throw new Error(`Release ${id.toHexString()} is referenced but does not exist`);
    }
    return release;
  }

  private async releaseOfPage(
    scope: WorkspaceScope,
    page: PageRecord,
    releaseId: string,
  ): Promise<ReleaseRecord> {
    const release = await this.releases.findById(scope, toObjectId(releaseId, RELEASE_NOT_FOUND));
    if (!release || !release.pageId.equals(page._id)) {
      throw notFound(RELEASE_NOT_FOUND);
    }
    return release;
  }

  /** Why claiming the next version failed inside the transaction. */
  private async publishConflict(
    scope: WorkspaceScope,
    pageId: ObjectId,
    expectedRevision: number,
  ): Promise<AppError> {
    const current = await this.pages.findById(scope, pageId);
    if (!current) {
      return notFound(PAGE_NOT_FOUND);
    }
    return current.draft.revision === expectedRevision
      ? pointerConflict()
      : revisionConflict(current.draft.revision);
  }
}
