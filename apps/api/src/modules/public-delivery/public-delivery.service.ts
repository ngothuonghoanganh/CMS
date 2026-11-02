import { Injectable } from '@nestjs/common';
import {
  type ActivityType,
  type PathStatusResponse,
  type PublicImage,
  type PublicLeadCapture,
  type PublicPageData,
  type PublicPreviewResponse,
  publicPreviewResponseSchema,
  type PublicPreviewStatusResponse,
  publicPreviewStatusResponseSchema,
  type ResolveResponse,
  resolveResponseSchema,
  type SitemapResponse,
  sitemapResponseSchema,
} from '@plp/contracts';
import { pageCapturesLeads } from '@plp/sections/schema';
import { notFound } from '../../shared/errors.js';
import { isObjectIdString, type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import { AssetsRepository } from '../assets/assets.repository.js';
import { AssetsService } from '../assets/assets.service.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { PreviewTokens, type VerifiedPreview } from '../preview/preview-tokens.js';
import { ConsentVersionsRepository } from '../privacy/consent-versions.repository.js';
import { imageOccurrences, linkedPageIds } from '../publishing/domain/content-refs.js';
import type { LeadCapture } from '../publishing/domain/lead-capture.js';
import { resolveSeo } from '../publishing/domain/resolve-seo.js';
import type { SitePresentation } from '../publishing/domain/site-presentation.js';
import type { PageSnapshot } from '../publishing/domain/snapshot.js';
import { RedirectsRepository } from '../publishing/redirects.repository.js';
import {
  currentSiteLeadCapture,
  currentSitePresentation,
  releaseLeadCapture,
  releasePresentation,
} from '../publishing/release-presentation.js';
import type { ReleaseRecord } from '../publishing/release.schema.js';
import { ReleasesRepository } from '../publishing/releases.repository.js';
import type { SiteRecord } from '../sites/site.schema.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { SitesService } from '../sites/sites.service.js';
import { SiteHosts } from '../domains/site-hosts.js';

const PUBLIC_PAGE_NOT_FOUND = 'Không tìm thấy trang';

/** Path of a live slug on the site: "/" for the home page (""), "/uu-dai" otherwise. */
function livePath(slug: string): string {
  return `/${slug}`;
}

/** The renderer sends the slug; tolerate surrounding slashes ("/uu-dai/" → "uu-dai"). */
export function slugFromPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, '');
}

/** Pointer moves that make an existing, older release live again. */
const RELEASE_RESTORED: ReadonlySet<ActivityType> = new Set([
  'page.rolled_back',
  'page.rollback_undone',
]);

/** What visitors see of a lead capture: the texts and the policy link, nothing internal. */
function publicLeadCapture(capture: LeadCapture | null): PublicLeadCapture | null {
  return (
    capture && {
      requiredText: capture.requiredText,
      marketingText: capture.marketingText,
      policyUrl: capture.policyUrl,
    }
  );
}

/** A release as the renderer shows it: its own snapshots (ADR-015, ADR-017). */
function releaseShown(release: ReleaseRecord): ShownVersion {
  return {
    releaseId: release._id,
    presentation: (site) => releasePresentation(release, site),
    leadCapture: releaseLeadCapture(release),
  };
}

/**
 * Which version of the page is shown and the site settings it is shown with: a release with its
 * snapshots, or a draft (no release) with the current settings its next publish will freeze.
 */
interface ShownVersion {
  releaseId: ObjectId | null;
  presentation: (site: SiteRecord) => SitePresentation;
  leadCapture: LeadCapture | null;
}

function toObjectIds(ids: readonly (string | null)[]): ObjectId[] {
  return [...new Set(ids.filter((id): id is string => id !== null && isObjectIdString(id)))].map(
    (id) => toObjectId(id),
  );
}

/**
 * What the renderer may see (ADR-009/010/011): live releases resolved from host + slug, redirects,
 * the sitemap and signed previews. There is no user here, so reads are unscoped but always bound
 * to the site resolved from the request; every response is parsed with its public contract, which
 * strips anything internal.
 */
@Injectable()
export class PublicDeliveryService {
  constructor(
    private readonly sites: SitesRepository,
    private readonly sitesService: SitesService,
    private readonly pages: PagesRepository,
    private readonly releases: ReleasesRepository,
    private readonly redirects: RedirectsRepository,
    private readonly assets: AssetsRepository,
    private readonly assetsService: AssetsService,
    private readonly previews: PreviewTokens,
    private readonly consentVersions: ConsentVersionsRepository,
    private readonly activity: ActivityRepository,
    private readonly siteHosts: SiteHosts,
  ) {}

  /**
   * site → live page at the slug → its release. Otherwise a redirect from an old slug to the
   * page's current live slug. Otherwise 404; a draft is never served (business rule 5).
   */
  async resolve(subdomain: string, path: string): Promise<ResolveResponse> {
    const site = await this.siteOrNotFound(subdomain);
    const slug = slugFromPath(path);
    const live = await this.pages.findPublicLiveBySlug(site, site._id, slug);
    if (live) {
      const release = await this.releases.findPublicById(site, live.publishedReleaseId);
      if (!release || !release.pageId.equals(live._id) || !release.siteId.equals(site._id)) {
        throw new Error(
          `Live page ${live._id.toHexString()} points to an invalid release ${live.publishedReleaseId.toHexString()}`,
        );
      }
      return resolveResponseSchema.parse({
        kind: 'page',
        data: await this.pageData(site, live._id, release, releaseShown(release)),
      });
    }
    const location = await this.redirectLocation(site, slug);
    if (location !== null) {
      return resolveResponseSchema.parse({ kind: 'redirect', location });
    }
    throw notFound(PUBLIC_PAGE_NOT_FOUND);
  }

  /**
   * The same decision as `resolve` without loading the release: a live page, a redirect (with its
   * location, so the renderer's proxy answers the 308 itself) or 404. Cheap enough for the proxy
   * to ask on every page request.
   */
  async pathStatus(subdomain: string, path: string): Promise<PathStatusResponse> {
    const site = await this.siteOrNotFound(subdomain);
    const slug = slugFromPath(path);
    const [live, primaryHost] = await Promise.all([
      this.pages.findPublicLiveBySlug(site, site._id, slug),
      this.siteHosts.activePrimaryHost(site),
    ]);
    if (live) {
      return { kind: 'page', releaseId: live.publishedReleaseId.toHexString(), primaryHost };
    }
    const location = await this.redirectLocation(site, slug);
    if (location !== null) {
      return { kind: 'redirect', location, primaryHost };
    }
    throw notFound(PUBLIC_PAGE_NOT_FOUND);
  }

  /** Live path of the page an old slug redirects to; null when there is none or it is not live. */
  private async redirectLocation(site: SiteRecord, slug: string): Promise<string | null> {
    const redirect = await this.redirects.findPublic(site, site._id, slug);
    if (!redirect) {
      return null;
    }
    const target = await this.pages.findPublicById(site, redirect.pageId);
    if (
      target?.siteId.equals(site._id) &&
      target.publishedSlug !== null &&
      target.publishedSlug !== slug
    ) {
      return livePath(target.publishedSlug);
    }
    return null;
  }

  /**
   * Live pages that may be indexed, with the time their content went live: the publish, or the
   * rollback or undo that made an older release live again. Crawlers then see a change whenever
   * the page changed, never a time that goes back.
   */
  async sitemap(subdomain: string): Promise<SitemapResponse> {
    const site = await this.siteOrNotFound(subdomain);
    const live = await this.pages.listPublicLiveForSite(site, site._id);
    const [releases, moves] = await Promise.all([
      this.releases.findPublicForSite(
        site,
        site._id,
        live.map((page) => page.publishedReleaseId),
      ),
      this.activity.latestPublicPointerEvents(
        site,
        site._id,
        live.map((page) => page._id),
      ),
    ]);
    const entries = live
      .flatMap((page) => {
        const release = releases.get(page.publishedReleaseId.toHexString());
        if (!release) {
          throw new Error(
            `Live page ${page._id.toHexString()} points to missing release ${page.publishedReleaseId.toHexString()}`,
          );
        }
        const move = moves.get(page._id.toHexString());
        const wentLive =
          move !== undefined && RELEASE_RESTORED.has(move.type)
            ? move.createdAt
            : release.createdAt;
        return release.seo.noindex
          ? []
          : [{ path: livePath(page.publishedSlug), lastModified: wentLive.toISOString() }];
      })
      .sort((a, b) => a.path.localeCompare(b.path));
    return sitemapResponseSchema.parse({ origin: this.sitesService.publicOrigin(site), entries });
  }

  /**
   * A signed preview (ADR-010): the latest draft of a page or one release. Any invalid, expired or
   * foreign token is 404, like a page that does not exist. A draft shows the current site settings,
   * which its next publish will snapshot; a release shows its own snapshot (ADR-015).
   */
  async preview(token: string): Promise<PublicPreviewResponse> {
    const { claims, site } = await this.previewSite(token);
    const expiresAt = claims.expiresAt.toISOString();
    if (claims.kind === 'draft') {
      const page = await this.pages.findPublicById(site, toObjectId(claims.pageId));
      if (!page?.siteId.equals(site._id)) {
        throw notFound(PUBLIC_PAGE_NOT_FOUND);
      }
      const consent = pageCapturesLeads(page.draft.composition)
        ? await this.consentVersions.findPublicCurrent(site, site._id)
        : null;
      return publicPreviewResponseSchema.parse({
        data: await this.pageData(site, page._id, page.draft, {
          releaseId: null,
          presentation: currentSitePresentation,
          leadCapture: consent && currentSiteLeadCapture(site, consent),
        }),
        preview: { kind: 'draft', version: null, expiresAt },
      });
    }
    const release = await this.releases.findPublicById(site, toObjectId(claims.releaseId));
    if (!release?.siteId.equals(site._id) || !(await this.pageInSite(site, release.pageId))) {
      throw notFound(PUBLIC_PAGE_NOT_FOUND);
    }
    return publicPreviewResponseSchema.parse({
      data: await this.pageData(site, release.pageId, release, releaseShown(release)),
      preview: { kind: 'release', version: release.version, expiresAt },
    });
  }

  /**
   * What a signed preview opens, checked like `preview` but without loading the draft, the release
   * or any asset: the token, its site, and that the page or release is still in that site. The
   * renderer's proxy asks this before rendering, and the page then loads the preview once.
   */
  async previewStatus(token: string): Promise<PublicPreviewStatusResponse> {
    const { claims, site } = await this.previewSite(token);
    let opens: boolean;
    if (claims.kind === 'draft') {
      opens = await this.pageInSite(site, toObjectId(claims.pageId));
    } else {
      const release = await this.releases.findPublicOwner(site, toObjectId(claims.releaseId));
      opens =
        release !== null &&
        release.siteId.equals(site._id) &&
        (await this.pageInSite(site, release.pageId));
    }
    if (!opens) {
      throw notFound(PUBLIC_PAGE_NOT_FOUND);
    }
    return publicPreviewStatusResponseSchema.parse({
      kind: claims.kind,
      subdomain: site.subdomain,
    });
  }

  /**
   * The claims of a valid preview token and the site they name. Any invalid, expired or foreign
   * token is 404, like a page that does not exist.
   */
  private async previewSite(token: string): Promise<{ claims: VerifiedPreview; site: SiteRecord }> {
    const claims = await this.previews.verify(token);
    if (!claims) {
      throw notFound(PUBLIC_PAGE_NOT_FOUND);
    }
    const site = await this.sites.findBySubdomain(claims.subdomain);
    if (
      !site ||
      site._id.toHexString() !== claims.siteId ||
      site.workspaceId.toHexString() !== claims.workspaceId
    ) {
      throw notFound(PUBLIC_PAGE_NOT_FOUND);
    }
    return { claims, site };
  }

  /**
   * Whether the page still exists in the site. A version leads keep after their page was deleted
   * stays in the database as consent evidence, and is never shown again, not even in a preview
   * signed before (ADR-027).
   */
  private async pageInSite(site: SiteRecord, pageId: ObjectId): Promise<boolean> {
    return (await this.pages.findPublicSiteId(site, pageId))?.equals(site._id) ?? false;
  }

  private async siteOrNotFound(subdomain: string): Promise<SiteRecord> {
    const site = await this.sites.findBySubdomain(subdomain);
    if (!site) {
      throw notFound(PUBLIC_PAGE_NOT_FOUND);
    }
    return site;
  }

  /**
   * Everything the renderer needs for one page: only the assets the composition references (with
   * public URLs), the live path of every linked page and the resolved SEO. The site's name, theme,
   * logo and default share image come from the shown version's presentation, never from the site
   * record (ADR-015), and so do the form's consent texts (ADR-017); the record only gives the
   * site's identity and address.
   */
  private async pageData(
    site: SiteRecord,
    pageId: ObjectId,
    snapshot: PageSnapshot,
    shown: ShownVersion,
  ): Promise<PublicPageData> {
    const presentation = shown.presentation(site);
    const imageIds = [
      ...new Set(
        imageOccurrences(snapshot.composition).flatMap(({ image }) =>
          image.assetId === null ? [] : [image.assetId],
        ),
      ),
    ];
    const siteImageIds = [
      snapshot.seo.shareImageAssetId,
      presentation.defaultShareImageAssetId,
      presentation.logoAssetId,
    ];
    const linkedIds = linkedPageIds(snapshot.composition);
    const [found, liveSlugs] = await Promise.all([
      this.assets.findPublicForSite(site, site._id, toObjectIds([...imageIds, ...siteImageIds])),
      this.pages.findPublicLiveSlugs(site, site._id, toObjectIds(linkedIds)),
    ]);
    const images: Record<string, PublicImage> = {};
    for (const [id, asset] of found) {
      images[id] = {
        url: this.assetsService.publicUrl(asset),
        width: asset.width,
        height: asset.height,
      };
    }
    const origin = this.sitesService.publicOrigin(site);
    const logoId = presentation.logoAssetId;
    return {
      site: {
        id: site._id.toHexString(),
        name: presentation.name,
        subdomain: site.subdomain,
        themePresetId: presentation.themePresetId,
        logo: logoId === null ? null : (images[logoId] ?? null),
        origin,
      },
      page: {
        id: pageId.toHexString(),
        slug: snapshot.slug,
        seo: resolveSeo(snapshot, presentation, origin, images),
        composition: snapshot.composition,
      },
      releaseId: shown.releaseId?.toHexString() ?? null,
      leadCapture: publicLeadCapture(shown.leadCapture),
      assets: Object.fromEntries(
        imageIds.flatMap((id) => {
          const image = images[id];
          return image ? [[id, image]] : [];
        }),
      ),
      pageLinks: Object.fromEntries(
        linkedIds.map((id) => {
          const slug = liveSlugs.get(id);
          return [id, slug === undefined ? null : livePath(slug)];
        }),
      ),
    };
  }
}
