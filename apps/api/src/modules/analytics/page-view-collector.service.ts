import { Injectable } from '@nestjs/common';
import { type PageView, vnDayOf } from '@plp/contracts';
import { type Env, siteOrigin } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { RendererClient } from '../../shared/renderer-channel/renderer-request.js';
import { deviceFromUserAgent } from '../leads/domain/lead-intake-rules.js';
import { normalizeLeadSource } from '../leads/domain/lead-source.js';
import { LeadLimitsRepository } from '../leads/lead-limits.repository.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { slugFromPath } from '../public-delivery/public-delivery.service.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { AnalyticsRepository } from './analytics.repository.js';
import { pageViewClientKey, pageViewSiteKey } from './domain/page-view-limits.js';
import { SourceCapRegistry } from './domain/source-cap.js';
import { isCountableUserAgent } from './domain/user-agents.js';
import { visitorHash } from './domain/visitor-hash.js';

/**
 * Counts the views of live pages that the renderer relays (ADR-019). A view that is not counted (a
 * bot, an unknown site, a page that is not live, over a rate limit) is dropped quietly: the visitor
 * never waits on it and nothing is stored about them.
 */
@Injectable()
export class PageViewCollector {
  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly sites: SitesRepository,
    private readonly pages: PagesRepository,
    private readonly limits: LeadLimitsRepository,
    private readonly analytics: AnalyticsRepository,
    private readonly sourceCap: SourceCapRegistry,
  ) {}

  async record(subdomain: string, view: PageView, client: RendererClient): Promise<void> {
    if (!isCountableUserAgent(client.userAgent)) {
      return;
    }
    const site = await this.sites.findBySubdomain(subdomain);
    if (!site) {
      return;
    }
    const now = new Date();
    if (!(await this.withinLimits(site._id, client.ip, now))) {
      return;
    }
    const page = await this.pages.findPublicLiveBySlug(site._id, slugFromPath(view.path));
    if (!page) {
      return;
    }
    const day = vnDayOf(now);
    const salt = await this.analytics.saltOf(day);
    const hash = visitorHash({
      salt,
      siteId: site._id,
      ip: client.ip,
      userAgent: client.userAgent,
    });
    const firstSightings = await this.analytics.markSeen(site._id, page._id, day, hash);
    const source = normalizeLeadSource({
      ...view.source,
      siteHost: new URL(siteOrigin(this.env, site.subdomain)).host,
    });
    const pair = await this.sourceCap.pairFor(
      site._id.toHexString(),
      day,
      { source: source.source, medium: source.medium },
      () => this.analytics.pairsOf(site._id, day),
    );
    await this.analytics.addView(
      {
        workspaceId: site.workspaceId,
        siteId: site._id,
        pageId: page._id,
        day,
        ...pair,
        device: deviceFromUserAgent(client.userAgent),
      },
      firstSightings,
    );
  }

  /**
   * 60 views per visitor address per 10 minutes and 20,000 per site per hour by default. Without
   * a trusted address only the site's limit applies: one shared bucket would drop most real views
   * (ADR-019).
   */
  private async withinLimits(siteId: ObjectId, ip: string | null, now: Date): Promise<boolean> {
    if (ip !== null) {
      const windowEnd = new Date(
        now.getTime() + this.env.PAGE_VIEW_LIMIT_PER_CLIENT_WINDOW_MINUTES * 60_000,
      );
      const client = await this.limits.hit(pageViewClientKey(siteId, ip), now, windowEnd);
      if (client.count > this.env.PAGE_VIEW_LIMIT_PER_CLIENT) {
        return false;
      }
    }
    const site = await this.limits.hit(
      pageViewSiteKey(siteId),
      now,
      new Date(now.getTime() + 3_600_000),
    );
    return site.count <= this.env.PAGE_VIEW_LIMIT_PER_SITE_PER_HOUR;
  }
}
