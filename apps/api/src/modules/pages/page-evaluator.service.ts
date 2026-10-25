import { Injectable } from '@nestjs/common';
import type { ChecksResult, Draft, PageSummary, UserRef } from '@plp/contracts';
import { isObjectIdString, type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import { AssetsRepository } from '../assets/assets.repository.js';
import { UsersRepository } from '../auth/users.repository.js';
import { evaluateChecks, type LivePageRef } from '../publishing/domain/checks.js';
import { referencedAssetIds } from '../publishing/domain/content-refs.js';
import { derivePageStatus } from '../publishing/domain/page-status.js';
import type { ReleaseRecord } from '../publishing/release.schema.js';
import { ReleasesRepository } from '../publishing/releases.repository.js';
import type { SiteRecord } from '../sites/site.schema.js';
import { SitesService } from '../sites/sites.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { toDraft, toPageSummary, toPointerEvent } from './page-dto.js';
import type { PageRecord } from './page.schema.js';
import { type LivePageRow, PagesRepository } from './pages.repository.js';

/** A page with everything derived from it on the server: status, checks and contract views. */
export interface EvaluatedPage {
  page: PageRecord;
  summary: PageSummary;
  draft: Draft;
  checks: ChecksResult;
}

function userRef(users: ReadonlyMap<string, UserRef>, id: ObjectId, what: string): UserRef {
  const user = users.get(id.toHexString());
  if (!user) {
    throw new Error(`${what} refers to unknown user ${id.toHexString()}`);
  }
  return user;
}

/**
 * `evaluateDraft` of ADR-005: status + checks of pages, used by the page list, the editor,
 * autosave and publishing. Evaluating any number of pages of one site takes a constant number of
 * queries (live releases with one `$in`, pointer events with one aggregation, assets and users
 * with one query each), never one per page.
 */
@Injectable()
export class PageEvaluator {
  constructor(
    private readonly pages: PagesRepository,
    private readonly releases: ReleasesRepository,
    private readonly activity: ActivityRepository,
    private readonly assets: AssetsRepository,
    private readonly users: UsersRepository,
    private readonly sites: SitesService,
  ) {}

  /** One page; loads the live pages of its site for the slug and link checks. */
  async evaluate(
    scope: WorkspaceScope,
    site: SiteRecord,
    page: PageRecord,
  ): Promise<EvaluatedPage> {
    const livePages = await this.pages.listLiveForSite(scope, site._id);
    const [evaluated] = await this.evaluateMany(scope, site, [page], livePages);
    if (!evaluated) {
      throw new Error('Evaluating one page returned nothing');
    }
    return evaluated;
  }

  /** Pages of one site, given the site's live pages. */
  async evaluateMany(
    scope: WorkspaceScope,
    site: SiteRecord,
    pages: readonly PageRecord[],
    livePages: readonly LivePageRow[],
  ): Promise<EvaluatedPage[]> {
    if (pages.length === 0) {
      return [];
    }
    const assetIds = [...new Set(pages.flatMap((page) => referencedAssetIds(page.draft)))]
      .filter(isObjectIdString)
      .map((id) => toObjectId(id));
    const [liveReleases, pointerEvents, assets] = await Promise.all([
      this.releases.findByIds(
        scope,
        pages.flatMap((page) => (page.publishedReleaseId ? [page.publishedReleaseId] : [])),
      ),
      this.activity.latestPointerEvents(
        scope,
        pages.map((page) => page._id),
      ),
      this.assets.findForSite(scope, site._id, assetIds),
    ]);
    const users = await this.users.findRefs([
      ...pages.flatMap((page) => [page.createdBy, page.draft.updatedBy]),
      ...[...pointerEvents.values()].map((event) => event.actorId),
    ]);
    const existingAssetIds = new Set(assets.keys());
    const origin = this.sites.defaultOrigin(site);
    const live: LivePageRef[] = livePages.map((row) => ({
      id: row._id.toHexString(),
      title: row.title,
      slug: row.publishedSlug,
    }));

    return pages.map((page) => {
      const pageId = page._id.toHexString();
      const liveRelease = this.liveReleaseOf(page, liveReleases);
      const status = derivePageStatus({
        releaseCount: page.releaseSeq,
        liveRelease,
        draft: page.draft,
      });
      const checks = evaluateChecks({
        revision: page.draft.revision,
        pageId,
        snapshot: page.draft,
        existingAssetIds,
        otherLivePages: live.filter((ref) => ref.id !== pageId),
      });
      const event = pointerEvents.get(pageId);
      const summary = toPageSummary({
        page,
        status,
        liveRelease,
        lastPointerEvent: event
          ? toPointerEvent(
              event,
              userRef(users, event.actorId, `Activity ${event._id.toHexString()}`),
            )
          : null,
        origin,
        checks: { blocking: checks.blocking.length, warnings: checks.warnings.length },
        createdBy: userRef(users, page.createdBy, `Page ${pageId}`),
      });
      const draft = toDraft(page, userRef(users, page.draft.updatedBy, `Draft of page ${pageId}`));
      return { page, summary, draft, checks };
    });
  }

  private liveReleaseOf(
    page: PageRecord,
    releases: ReadonlyMap<string, ReleaseRecord>,
  ): ReleaseRecord | null {
    if (page.publishedReleaseId === null) {
      return null;
    }
    const release = releases.get(page.publishedReleaseId.toHexString());
    if (!release) {
      throw new Error(
        `Page ${page._id.toHexString()} points to missing release ${page.publishedReleaseId.toHexString()}`,
      );
    }
    return release;
  }
}
