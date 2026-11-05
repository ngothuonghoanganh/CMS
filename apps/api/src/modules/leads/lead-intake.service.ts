import { Injectable, Logger } from '@nestjs/common';
import type { PublicLeadValues } from '@plp/contracts';
import { leadFormContentSchema, leadFormSectionOf } from '@plp/sections/schema';
import type { Env } from '../../config/env.js';
import { ContactLinker } from '../contacts/contact-linker.service.js';
import type { ContactRecord } from '../contacts/contact.schema.js';
import { ContactRecordsRepository } from '../contacts/contact-records.repository.js';
import { ContactsRepository } from '../contacts/contacts.repository.js';
import { SiteHosts } from '../domains/site-hosts.js';
import { InjectEnv } from '../../shared/env.js';
import { AppError, notFound } from '../../shared/errors.js';
import { isObjectIdString, type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { addressKeySecret } from '../../shared/renderer-channel/address-key.js';
import type { RendererClient } from '../../shared/renderer-channel/renderer-request.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { releaseLeadCapture } from '../publishing/release-presentation.js';
import type { ReleaseRecord } from '../publishing/release.schema.js';
import { ReleasesRepository } from '../publishing/releases.repository.js';
import { retentionOf, type SiteRecord, sitePrivacyOf } from '../sites/site.schema.js';
import { SitesRepository } from '../sites/sites.repository.js';
import {
  addMonthsUtc,
  clientLimitKey,
  deviceFromUserAgent,
  siteLimitKey,
  spamReasons,
  submissionKey,
} from './domain/lead-intake-rules.js';
import { normalizeLeadSource } from './domain/lead-source.js';
import { LeadNotifier } from '../notifications/lead-notifier.service.js';
import { LeadLimitsRepository } from './lead-limits.repository.js';
import type { LeadRecord } from './lead.schema.js';
import { LeadsRepository, SubmissionTakenError } from './leads.repository.js';

const FORM_NOT_FOUND = 'Form này không còn nhận đăng ký';

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
  private readonly logger = new Logger(LeadIntakeService.name);
  private readonly addressSecret: Buffer;

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly sites: SitesRepository,
    private readonly pages: PagesRepository,
    private readonly releases: ReleasesRepository,
    private readonly leads: LeadsRepository,
    private readonly limits: LeadLimitsRepository,
    private readonly notifier: LeadNotifier,
    private readonly siteHosts: SiteHosts,
    private readonly linker: ContactLinker,
    private readonly contacts: ContactsRepository,
    private readonly records: ContactRecordsRepository,
    private readonly transactions: TransactionRunner,
  ) {
    this.addressSecret = addressKeySecret(env.RENDERER_API_SECRET);
  }

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
    const submission =
      input.submissionId === null ? null : submissionKey(input.submissionId, input);
    if (
      submission !== null &&
      (await this.leads.existsPublicSubmission(site, site._id, submission))
    ) {
      return { replayed: true };
    }
    const now = new Date();
    await this.countRequest(site._id, client.ip, now);

    const reasons = spamReasons({ honeypot: input.honeypot, elapsedMs: input.elapsedMs });
    const spam = reasons.length > 0;
    const retention = retentionOf(sitePrivacyOf(site));
    let stored: LeadRecord;
    let contact: ContactRecord | null;
    try {
      // The profile is part of the lead (ADR-033): both are stored, or neither.
      ({ stored, contact } = await this.transactions.run(async (tx) => {
        const lead = await this.leads.insertPublic(
          site,
          {
            pageId: release.pageId,
            releaseId: release._id,
            releaseVersion: release.version,
            submissionId: submission,
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
              siteHosts: await this.siteHosts.of(site),
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
              rejectedRecipients: null,
              updatedAt: now,
            },
            createdAt: now,
            expiresAt: retention === null ? null : addMonthsUtc(now, retention),
          },
          tx,
        );
        // Suspected spam joins no profile until it is moved out of spam.
        return {
          stored: lead,
          contact: spam ? null : await this.linker.linkIn(site, lead, retention, tx),
        };
      }));
    } catch (error) {
      if (error instanceof SubmissionTakenError) {
        return { replayed: true };
      }
      throw error;
    }
    if (!spam) {
      // The visitor gets the answer now; the email goes out in the background. Queued before
      // anything else can fail: a resend of this submission is answered as a replay and queues
      // nothing, so the stored lead would wait for the next restart.
      this.notifier.enqueue({ workspaceId: site.workspaceId, leadId: stored._id });
    }
    // The owner may have changed the retention period since the site was read above. Settings
    // commit before they recompute every lead, so either that recompute covers this lead or this
    // read sees the new period (ADR-017).
    const current = await this.sites.findPublicPrivacy(site, site._id);
    if (current === null) {
      // The site was deleted meanwhile (ADR-027). The deletion sweeps the site's leads again after
      // its commit, which covers a lead stored while this read still saw the site; this lead may
      // have come after that sweep.
      await this.forget(site, stored, contact);
      throw notFound(FORM_NOT_FOUND);
    }
    if ((await this.releases.findPublicOwner(site, release._id)) === null) {
      // The page was unpublished and deleted meanwhile (ADR-027). The deletion keeps the releases
      // leads refer to, but it read them before this lead was stored, so this lead's consent
      // evidence went with the page (rule 10). A lead stored while the deletion's transaction was
      // still open can pass this read; reading such a lead shows its evidence as missing.
      await this.forget(site, stored, contact);
      throw notFound(FORM_NOT_FOUND);
    }
    const latest = retentionOf(current.privacy);
    if (latest !== retention) {
      await this.leads.setPublicExpiry(
        site,
        stored._id,
        latest === null ? null : addMonthsUtc(now, latest),
      );
      if (contact !== null) {
        const expiresAt = await this.contacts.setPublicExpiry(site, contact._id, latest);
        if (expiresAt !== undefined) {
          await this.records.alignExpiry(site, site._id, contact._id, expiresAt);
        }
      }
    }
    if (contact !== null) {
      await this.suggestDuplicates(site, contact, stored);
    }
    return { replayed: false };
  }

  /** Removes a lead stored for a page or site deleted meanwhile, and what it added to a profile. */
  private async forget(
    site: SiteRecord,
    lead: LeadRecord,
    contact: ContactRecord | null,
  ): Promise<void> {
    await this.leads.deletePublic(site, site._id, lead._id);
    if (contact !== null) {
      await this.contacts.dropLead(site, site._id, contact._id);
    }
  }

  /**
   * "Có thể trùng" for the profile the lead joined. The lead is stored and the visitor is answered
   * either way: a failed check is logged, and the next lead of either person checks again.
   */
  private async suggestDuplicates(
    site: SiteRecord,
    contact: ContactRecord,
    lead: LeadRecord,
  ): Promise<void> {
    try {
      await this.linker.suggestFor(site, contact, lead, new Date());
    } catch (error) {
      this.logger.error(
        { err: error, siteId: site._id.toHexString() },
        'Checking a contact for duplicates failed',
      );
    }
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
    const release = await this.releases.findPublicById(site, toObjectId(releaseId));
    if (!release || !release.siteId.equals(site._id)) {
      throw notFound(FORM_NOT_FOUND);
    }
    const page = await this.pages.findPublicById(site, release.pageId);
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
    const client = await this.limits.hit(
      clientLimitKey(this.addressSecret, siteId, ip),
      now,
      clientWindowEnd,
    );
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
