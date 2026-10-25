import { Injectable } from '@nestjs/common';
import {
  type Composition,
  type createPageRequestSchema,
  EMPTY_SEO,
  MAX_PAGES_PER_SITE,
  type PageCountResponse,
  type PageDetailResponse,
  type PageListResponse,
  type pageListQuerySchema,
  type PageRefListResponse,
  type ProblemIssue,
  recentDaysWindow,
  reservedSlugs,
  type RestoreDraftRequest,
  type SaveDraftRequest,
  type SaveDraftResponse,
  type SlugAvailability,
  type slugAvailabilityQuerySchema,
  slugSchema,
} from '@plp/contracts';
import { buildCompositionFromGoal, splitPath, validateComposition } from '@plp/sections/schema';
import type { z } from 'zod';
import { AppError, notFound, validationFailed } from '../../shared/errors.js';
import { isObjectIdString, type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import { AssetsRepository } from '../assets/assets.repository.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { LeadsRepository } from '../leads/leads.repository.js';
import { imageOccurrences } from '../publishing/domain/content-refs.js';
import { RELEASE_NOT_FOUND } from '../publishing/release-dto.js';
import { ReleasesRepository } from '../publishing/releases.repository.js';
import { ASSET_NOT_IN_SITE_MESSAGE } from '../sites/site-management.service.js';
import type { SiteRecord } from '../sites/site.schema.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { SitesService } from '../sites/sites.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { PAGE_NOT_FOUND, PageAccessService } from './page-access.service.js';
import { revisionConflict } from './page-errors.js';
import { PageEvaluator } from './page-evaluator.service.js';
import { attentionOf, countPages, filterPages, paginatePages } from './page-list.js';
import type { PageRecord } from './page.schema.js';
import { type DraftContent, PagesRepository } from './pages.repository.js';
import { newSectionId } from './section-id.js';

export type PageListQueryValues = z.output<typeof pageListQuerySchema>;
export type CreatePageValues = z.output<typeof createPageRequestSchema>;
export type SlugAvailabilityQuery = z.output<typeof slugAvailabilityQuerySchema>;

export const PAGE_LIMIT_MESSAGE = `Mỗi site có tối đa ${MAX_PAGES_PER_SITE} trang`;

function firstIssueMessage(issues: readonly { message: string }[]): string {
  const issue = issues[0];
  if (!issue) {
    throw new Error('A failed slug validation reported no issue');
  }
  return issue.message;
}

@Injectable()
export class PagesService {
  constructor(
    private readonly pages: PagesRepository,
    private readonly pageAccess: PageAccessService,
    private readonly sites: SitesService,
    private readonly sitesRepository: SitesRepository,
    private readonly evaluator: PageEvaluator,
    private readonly releases: ReleasesRepository,
    private readonly assets: AssetsRepository,
    private readonly activity: ActivityRepository,
    private readonly transactions: TransactionRunner,
    private readonly leads: LeadsRepository,
  ) {}

  /**
   * Pages of a site with derived status and check counts. Status, counts and attention need every
   * page of the site, which `MAX_PAGES_PER_SITE` bounds (ADR-014); filtering and the keyset page
   * are applied afterwards. Each row carries its leads of the last 7 days, counted for every page
   * in one aggregation (ADR-018).
   */
  async list(
    user: AuthenticatedUser,
    siteId: string,
    query: PageListQueryValues,
  ): Promise<PageListResponse> {
    const { scope, site } = await this.sites.access(user, siteId);
    const pages = await this.pages.listForSite(scope, site._id);
    const livePages = pages.flatMap((page) =>
      page.publishedSlug !== null && page.publishedReleaseId !== null
        ? [
            {
              _id: page._id,
              title: page.title,
              publishedSlug: page.publishedSlug,
              publishedReleaseId: page.publishedReleaseId,
            },
          ]
        : [],
    );
    const [evaluated, recentLeads] = await Promise.all([
      this.evaluator.evaluateMany(scope, site, pages, livePages),
      this.leads.countRecentByPage(scope, site._id, recentDaysWindow(new Date(), 7).from),
    ]);
    const listed = evaluated.map(({ summary, checks }) => ({
      summary,
      blockingCount: checks.blocking.length,
    }));
    const page = paginatePages(
      filterPages(listed, { status: query.status, q: query.q }),
      query.cursor,
      query.limit,
    );
    return {
      items: page.items.map(({ summary }) => ({
        ...summary,
        leadsLast7Days: recentLeads.get(summary.id) ?? 0,
      })),
      nextCursor: page.nextCursor,
      counts: countPages(listed),
      attention: attentionOf(listed),
    };
  }

  /** Id and title of every page of the site, by title: the page filter of the lead inbox. */
  async listRefs(user: AuthenticatedUser, siteId: string): Promise<PageRefListResponse> {
    const { scope, site } = await this.sites.access(user, siteId);
    const pages = await this.pages.listTitlesForSite(scope, site._id);
    return {
      items: pages
        .map((page) => ({ id: page._id.toHexString(), title: page.title }))
        .sort((a, b) => a.title.localeCompare(b.title, 'vi')),
    };
  }

  /** The number of pages of a site, without evaluating them (the sidebar count). */
  async count(user: AuthenticatedUser, siteId: string): Promise<PageCountResponse> {
    const { scope, site } = await this.sites.access(user, siteId);
    return { count: await this.pages.countForSite(scope, site._id) };
  }

  /**
   * A blank page or a page built for a goal (screen 02), and its `page.created` activity. The
   * limit is checked inside the transaction, after a write to the site that serializes concurrent
   * creations in it, so the 201st page is refused even when requests race (ADR-014).
   */
  async create(
    user: AuthenticatedUser,
    siteId: string,
    input: CreatePageValues,
  ): Promise<PageDetailResponse> {
    const { scope, site } = await this.sites.access(user, siteId);
    const composition = this.initialComposition(site, input.start);
    const page = await this.transactions.run(async (tx) => {
      await this.sitesRepository.recordPageCreation(scope, site._id, tx);
      if ((await this.pages.countForSite(scope, site._id, tx)) >= MAX_PAGES_PER_SITE) {
        throw new AppError(409, 'page_limit_reached', PAGE_LIMIT_MESSAGE);
      }
      const created = await this.pages.create(
        scope,
        {
          siteId: site._id,
          title: input.title,
          goal: input.start.kind === 'goal' ? input.start.goal : null,
          slug: input.slug,
          composition,
          seo: { ...EMPTY_SEO },
        },
        tx,
      );
      await this.activity.record(
        scope,
        { siteId: site._id, type: 'page.created', page: { id: created._id, title: created.title } },
        tx,
      );
      return created;
    });
    return this.detail(scope, site, page);
  }

  async get(user: AuthenticatedUser, pageId: string): Promise<PageDetailResponse> {
    const { scope, site, page } = await this.pageAccess.access(user, pageId);
    return this.detail(scope, site, page);
  }

  /**
   * Autosave (ADR-005): validates the composition with the section registry, requires every image
   * to come from this site's library, then replaces the draft if it is still at `baseRevision`.
   * Saving never changes what is live.
   */
  async saveDraft(
    user: AuthenticatedUser,
    pageId: string,
    input: SaveDraftRequest,
  ): Promise<SaveDraftResponse> {
    const { scope, site, page } = await this.pageAccess.access(user, pageId);
    const issues = validateComposition(input.composition).map((issue) => ({
      ...issue,
      path: ['composition', ...issue.path],
    }));
    if (issues.length > 0) {
      throw validationFailed(issues, 'Nội dung trang không hợp lệ');
    }
    await this.requireSiteAssets(scope, site, input);
    const saved = await this.pages.replaceDraft(scope, page._id, input.baseRevision, {
      slug: input.slug,
      composition: input.composition,
      seo: input.seo,
    });
    if (!saved) {
      throw await this.conflictFor(scope, page._id);
    }
    const evaluated = await this.evaluator.evaluate(scope, site, saved);
    return {
      revision: saved.draft.revision,
      updatedAt: saved.draft.updatedAt.toISOString(),
      page: evaluated.summary,
      checks: evaluated.checks,
    };
  }

  /**
   * `restoreDraftFromRelease` (ARCHITECTURE §2.1.6): copies a release of this page into the draft
   * with the same revision guard as autosave. Releases and the live pointer are not touched.
   */
  async restoreDraft(
    user: AuthenticatedUser,
    pageId: string,
    input: RestoreDraftRequest,
  ): Promise<PageDetailResponse> {
    const { scope, site, page } = await this.pageAccess.access(user, pageId);
    const release = await this.releases.findById(
      scope,
      toObjectId(input.releaseId, RELEASE_NOT_FOUND),
    );
    if (!release || !release.pageId.equals(page._id)) {
      throw notFound(RELEASE_NOT_FOUND);
    }
    const restored = await this.transactions.run(async (tx) => {
      const updated = await this.pages.replaceDraft(
        scope,
        page._id,
        input.baseRevision,
        { slug: release.slug, composition: release.composition, seo: release.seo },
        tx,
      );
      if (!updated) {
        return null;
      }
      await this.activity.record(
        scope,
        {
          siteId: site._id,
          type: 'page.draft_restored',
          page: { id: page._id, title: updated.title },
          data: { version: release.version },
        },
        tx,
      );
      return updated;
    });
    if (!restored) {
      throw await this.conflictFor(scope, page._id);
    }
    return this.detail(scope, site, restored);
  }

  /** Whether a slug is free in the site: not another page's draft slug nor its live slug. */
  async slugAvailability(
    user: AuthenticatedUser,
    siteId: string,
    query: SlugAvailabilityQuery,
  ): Promise<SlugAvailability> {
    const { scope, site } = await this.sites.access(user, siteId);
    const parsed = slugSchema.safeParse(query.slug);
    if (!parsed.success) {
      const slug = query.slug.trim();
      return {
        slug,
        available: false,
        reason: reservedSlugs.includes(slug) ? 'reserved' : 'invalid',
        message: firstIssueMessage(parsed.error.issues),
      };
    }
    const slug = parsed.data;
    const owner = await this.pages.findSlugOwner(
      scope,
      site._id,
      slug,
      query.pageId === undefined ? null : toObjectId(query.pageId),
    );
    if (owner) {
      return {
        slug,
        available: false,
        reason: 'taken',
        message: `Đường dẫn này đang được trang “${owner.title}” dùng`,
      };
    }
    return { slug, available: true, reason: null, message: null };
  }

  private async detail(
    scope: WorkspaceScope,
    site: SiteRecord,
    page: PageRecord,
  ): Promise<PageDetailResponse> {
    const evaluated = await this.evaluator.evaluate(scope, site, page);
    return { page: evaluated.summary, draft: evaluated.draft, checks: evaluated.checks };
  }

  private initialComposition(site: SiteRecord, start: CreatePageValues['start']): Composition {
    if (start.kind === 'blank') {
      return { version: 1, sections: [] };
    }
    const composition = buildCompositionFromGoal({
      goal: start.goal,
      brief: start.brief,
      style: start.style,
      siteName: site.name,
      newId: newSectionId,
    });
    const issues = validateComposition(composition);
    if (issues.length > 0) {
      throw new Error(
        `The "${start.goal}" blueprint produced an invalid composition: ${JSON.stringify(issues)}`,
      );
    }
    return composition;
  }

  /** 422 for any image or share image whose asset is not in this site (no cross-site reference). */
  private async requireSiteAssets(
    scope: WorkspaceScope,
    site: SiteRecord,
    draft: DraftContent,
  ): Promise<void> {
    const references: { path: ProblemIssue['path']; assetId: string }[] = imageOccurrences(
      draft.composition,
    ).flatMap(({ sectionIndex, path, image }) =>
      image.assetId === null
        ? []
        : [
            {
              path: ['composition', 'sections', sectionIndex, 'content', ...splitPath(path)],
              assetId: image.assetId,
            },
          ],
    );
    if (draft.seo.shareImageAssetId !== null) {
      references.push({
        path: ['seo', 'shareImageAssetId'],
        assetId: draft.seo.shareImageAssetId,
      });
    }
    if (references.length === 0) {
      return;
    }
    const ids: ObjectId[] = references
      .map(({ assetId }) => assetId)
      .filter(isObjectIdString)
      .map((id) => toObjectId(id));
    const found = await this.assets.findForSite(scope, site._id, ids);
    const issues: ProblemIssue[] = references
      .filter(({ assetId }) => !found.has(assetId))
      .map(({ path }) => ({ path, code: 'asset_not_found', message: ASSET_NOT_IN_SITE_MESSAGE }));
    if (issues.length > 0) {
      throw validationFailed(issues);
    }
  }

  /** Why a guarded draft write matched nothing: the page is gone (404) or the revision moved. */
  private async conflictFor(scope: WorkspaceScope, pageId: ObjectId): Promise<AppError> {
    const current = await this.pages.findById(scope, pageId);
    return current ? revisionConflict(current.draft.revision) : notFound(PAGE_NOT_FOUND);
  }
}
