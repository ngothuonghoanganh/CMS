import { Injectable } from '@nestjs/common';
import { DEFAULT_RETENTION_MONTHS, type PublicLeadValues } from '@plp/contracts';
import { leadFormContentSchema, leadFormSectionOf } from '@plp/sections/schema';
import { type Env, siteOrigin } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { AppError, notFound } from '../../shared/errors.js';
import { isObjectIdString, type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import type { RendererClient } from '../../shared/renderer-channel/renderer-request.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { releaseLeadCapture } from '../publishing/release-presentation.js';
import type { ReleaseRecord } from '../publishing/release.schema.js';
import { ReleasesRepository } from '../publishing/releases.repository.js';
import { type SiteRecord, sitePrivacyOf } from '../sites/site.schema.js';
import { SitesRepository } from '../sites/sites.repository.js';
import {
  addMonthsUtc,
  clientLimitKey,
  deviceFromUserAgent,
  siteLimitKey,
  spamReasons,
} from './domain/lead-intake-rules.js';
import { normalizeLeadSource } from './domain/lead-source.js';
import { LeadNotifier } from '../notifications/lead-notifier.service.js';
import { LeadLimitsRepository } from './lead-limits.repository.js';
import type { LeadRecord } from './lead.schema.js';
import { LeadsRepository, SubmissionTakenError } from './leads.repository.js';

export const FORM_NOT_FOUND = 'Form này không còn nhận đăng ký';
const RATE_LIMITED = 'Bạn đã gửi nhiều lần, hãy thử lại sau ít phút.';

export interface IntakeOutcome {
  /** The submission had already been received: nothing new was stored. */
  replayed: boolean;
}

interface FormRelease {
  site: SiteRecord;
  release: ReleaseRecord;
}

/**
 * Receives a visitor's lead relayed by the renderer (ADR-016). The form and consent text are the
 * ones of the release the visitor saw, never the draft. Spam is kept, flagged, and answered like
 * any lead, so bots learn nothing.
 */
@Injectable()
export class LeadIntakeService {
  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly sites: SitesRepository,
    private readonly pages: PagesRepository,
    private readonly releases: ReleasesRepository,
    private readonly leads: LeadsRepository,
    private readonly limits: LeadLimitsRepository,
    private readonly notifier: LeadNotifier,
  ) {}

  async submit(
    subdomain: string,
    input: PublicLeadValues,
    client: RendererClient,
  ): Promise<IntakeOutcome> {
    const { site, release } = await this.formRelease(subdomain, input.releaseId);
    const form = leadFormSectionOf(release.composition);
    const capture = releaseLeadCapture(release);
    if (form === null || capture === null) {
      throw notFound(FORM_NOT_FOUND);
    }
    const content = leadFormContentSchema.parse(form.content);
    if (
      input.submissionId !== null &&
      (await this.leads.existsPublicSubmission(site._id, input.submissionId))
    ) {
      return { replayed: true };
    }
    const now = new Date();
    await this.countRequest(site._id, client.ip, now);

    const reasons = spamReasons({ honeypot: input.honeypot, elapsedMs: input.elapsedMs });
    const spam = reasons.length > 0;
    // Null keeps leads until deleted by hand; the default only applies without settings, which a
    // form's release cannot have (it snapshotted them).
    const privacy = sitePrivacyOf(site);
    const retention = privacy === null ? DEFAULT_RETENTION_MONTHS : privacy.retentionMonths;
    let stored: LeadRecord;
    try {
      stored = await this.leads.insertPublic(site, {
        pageId: release.pageId,
        releaseId: release._id,
        releaseVersion: release.version,
        submissionId: input.submissionId,
        fields: {
          name: input.name,
          phone: input.phone,
          // Fields the visitor's form did not ask are not stored, whatever was sent.
          email: content.showEmail ? input.email : null,
          message: content.showMessage ? input.message : null,
        },
        consent: {
          // Without a marketing checkbox on the form there is nothing to agree to.
          marketing: capture.marketingText !== null && input.marketing,
          at: now,
          marketingWithdrawnAt: null,
        },
        source: normalizeLeadSource({
          ...input.source,
          siteHost: new URL(siteOrigin(this.env, site.subdomain)).host,
        }),
        device: deviceFromUserAgent(client.userAgent),
        spam: { suspected: spam, reasons },
        // Spam is never emailed (ADR-018).
        notification: {
          status: spam ? 'skipped' : 'pending',
          attempts: 0,
          lastErrorCode: null,
          sentAt: null,
          recipients: null,
          updatedAt: now,
        },
        createdAt: now,
        expiresAt: retention === null ? null : addMonthsUtc(now, retention),
      });
    } catch (error) {
      if (error instanceof SubmissionTakenError) {
        return { replayed: true };
      }
      throw error;
    }
    if (!spam) {
      // The visitor gets the answer now; the email goes out in the background.
      this.notifier.enqueue(stored._id);
    }
    return { replayed: false };
  }

  /**
   * The release the visitor's form came from. It may be older than the page's live release when
   * the visitor opened the page before a publish; the page must still be live.
   */
  private async formRelease(subdomain: string, releaseId: string): Promise<FormRelease> {
    const site = await this.sites.findBySubdomain(subdomain);
    if (!site || !isObjectIdString(releaseId)) {
      throw notFound(FORM_NOT_FOUND);
    }
    const release = await this.releases.findPublicById(toObjectId(releaseId));
    if (!release || !release.siteId.equals(site._id)) {
      throw notFound(FORM_NOT_FOUND);
    }
    const page = await this.pages.findPublicById(release.pageId);
    if (!page || !page.siteId.equals(site._id) || page.publishedReleaseId === null) {
      throw notFound(FORM_NOT_FOUND);
    }
    return { site, release };
  }

  /**
   * Counts the request in the visitor's bucket and the site's, before storing anything; over
   * either limit answers 429 and stores nothing.
   */
  private async countRequest(siteId: ObjectId, ip: string | null, now: Date): Promise<void> {
    const clientWindowEnd = new Date(
      now.getTime() + this.env.LEAD_LIMIT_PER_CLIENT_WINDOW_MINUTES * 60_000,
    );
    const client = await this.limits.hit(clientLimitKey(siteId, ip), now, clientWindowEnd);
    if (client.count > this.env.LEAD_LIMIT_PER_CLIENT) {
      throw new AppError(429, 'rate_limited', RATE_LIMITED, { detail: RATE_LIMITED });
    }
    const site = await this.limits.hit(
      siteLimitKey(siteId),
      now,
      new Date(now.getTime() + 3_600_000),
    );
    if (site.count > this.env.LEAD_LIMIT_PER_SITE_PER_HOUR) {
      throw new AppError(429, 'rate_limited', RATE_LIMITED, { detail: RATE_LIMITED });
    }
  }
}
