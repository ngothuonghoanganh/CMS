import { Injectable } from '@nestjs/common';
import type { ChecksResult, Draft, PageSummary, UserRef } from '@plp/contracts';
import { pageCapturesLeads } from '@plp/sections/schema';
import { isObjectIdString, type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import { pointerActorOf } from '../activity/pointer-events.js';
import { AssetsRepository } from '../assets/assets.repository.js';
import { UsersRepository } from '../auth/users.repository.js';
import { SiteHosts } from '../domains/site-hosts.js';
import { ConsentVersionsRepository } from '../privacy/consent-versions.repository.js';
import {
  evaluateChecks,
  type LivePageRef,
  type SiteAddressCheck,
} from '../publishing/domain/checks.js';
import { ApprovalsRepository } from '../publishing/approvals.repository.js';
import { visibleApproval } from '../publishing/domain/approval-rules.js';
import { referencedAssetIds } from '../publishing/domain/content-refs.js';
import { diffLeadCapture } from '../publishing/domain/lead-capture.js';
import { derivePageStatus } from '../publishing/domain/page-status.js';
import { diffSitePresentation } from '../publishing/domain/site-presentation.js';
import {
  currentSiteLeadCapture,
  currentSitePresentation,
  releaseLeadCapture,
  releasePresentation,
  siteLeadCaptureGaps,
} from '../publishing/release-presentation.js';
import type { ReleaseRecord } from '../publishing/release.schema.js';
import { ReleasesRepository } from '../publishing/releases.repository.js';
import { confirmedRecipientsOf, type SiteRecord, sitePrivacyOf } from '../sites/site.schema.js';
import { SitesService } from '../sites/sites.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { toDraft, toPageApproval, toPageSummary, toPointerEvent } from './page-dto.js';
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
 * queries (live releases with one `$in`, pointer events and requests to publish with one
 * aggregation each, assets and users with one query each), never one per page. `siteChanges` (ADR-015, ADR-017) compares those
 * releases with the site the caller already loaded and, when the site has consent settings or a
 * page has a form, with its current consent version (one more query). The primary custom domain,
 * when there is one, is read once for the address checks of every page (ADR-006).
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
    private readonly consentVersions: ConsentVersionsRepository,
    private readonly approvals: ApprovalsRepository,
    private readonly siteHosts: SiteHosts,
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
    // Without saved settings no release ever snapshotted consent, and no page needs them yet.
    const readsConsent =
      sitePrivacyOf(site) !== null ||
      pages.some((page) => pageCapturesLeads(page.draft.composition));
    const pageIds = pages.map((page) => page._id);
    const [liveReleases, pointerEvents, assets, consent, latestApprovals, address] =
      await Promise.all([
        this.releases.findByIds(
          scope,
          pages.flatMap((page) => (page.publishedReleaseId ? [page.publishedReleaseId] : [])),
        ),
        this.activity.latestPointerEvents(scope, pageIds),
        this.assets.findForSite(scope, site._id, assetIds),
        readsConsent ? this.consentVersions.findCurrent(scope, site._id) : null,
        this.approvals.latestOf(scope, pageIds),
        this.addressOf(site),
      ]);
    const approvals = new Map(
      pages.flatMap((page) => {
        const pageId = page._id.toHexString();
        const latest = latestApprovals.get(pageId) ?? null;
        return latest !== null && visibleApproval(latest, page.releaseSeq)
          ? [[pageId, latest] as const]
          : [];
      }),
    );
    const users = await this.users.findRefs([
      ...pages.flatMap((page) => [page.createdBy, page.draft.updatedBy]),
      ...[...pointerEvents.values()].map(pointerActorOf),
      ...[...approvals.values()].flatMap((approval) =>
        approval.decidedBy === null
          ? [approval.requestedBy]
          : [approval.requestedBy, approval.decidedBy],
      ),
    ]);
    const existingAssetIds = new Set(assets.keys());
    const origin = this.sites.publicOrigin(site);
    const presentation = currentSitePresentation(site);
    const capture = currentSiteLeadCapture(site, consent);
    const leadCaptureGaps = siteLeadCaptureGaps(site, consent);
    const leadDestinationReady = confirmedRecipientsOf(site).length > 0;
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
        leadCaptureGaps,
        leadDestinationReady,
        address,
      });
      const event = pointerEvents.get(pageId);
      const approval = approvals.get(pageId);
      const summary = toPageSummary({
        page,
        status,
        // The live page keeps its release's snapshot; the status ignores the site (ADR-015).
        siteChanges:
          liveRelease === null
            ? []
            : [
                ...diffSitePresentation(releasePresentation(liveRelease, site), presentation),
                ...diffLeadCapture(releaseLeadCapture(liveRelease), capture),
              ],
        liveRelease,
        lastPointerEvent: event
          ? toPointerEvent(
              event,
              userRef(users, pointerActorOf(event), `Activity ${event._id.toHexString()}`),
            )
          : null,
        origin,
        checks: { blocking: checks.blocking.length, warnings: checks.warnings.length },
        approval: approval
          ? toPageApproval(approval, (id) =>
              userRef(users, id, `Approval ${approval._id.toHexString()}`),
            )
          : null,
        createdBy: userRef(users, page.createdBy, `Page ${pageId}`),
      });
      const draft = toDraft(page, userRef(users, page.draft.updatedBy, `Draft of page ${pageId}`));
      return { page, summary, draft, checks };
    });
  }

  /** The primary address for the checks; the default one needs no query. */
  private async addressOf(site: SiteRecord): Promise<SiteAddressCheck> {
    if (!site.primaryDomain) {
      return { kind: 'default' };
    }
    return {
      kind: 'custom',
      hostname: site.primaryDomain.hostname,
      active: (await this.siteHosts.activePrimaryHost(site)) !== null,
    };
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
