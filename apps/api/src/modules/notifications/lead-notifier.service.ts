import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { LeadRecord } from '../leads/lead.schema.js';
import { LeadsRepository } from '../leads/leads.repository.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { confirmedRecipientsOf } from '../sites/site.schema.js';
import { SitesRepository } from '../sites/sites.repository.js';
import {
  nextAttemptDelay,
  NOTIFICATION_SWEEP_LIMIT,
  STALE_SENDING_MS,
} from './domain/notification-rules.js';
import { type EmailDelivery, EmailSender, EmailSendError } from './email-sender.js';
import { leadNotificationEmail } from './email-templates.js';

/** Injection token of the waits between attempts; tests shorten them. */
export const NOTIFICATION_RETRY_DELAYS = Symbol('NOTIFICATION_RETRY_DELAYS');

/**
 * Emails a new lead to the site's confirmed addresses (ADR-018), in the background: intake
 * answers the visitor first. Up to three attempts, a few minutes apart. Each attempt claims the
 * lead with a conditional update, so instances never send the same attempt twice. Retries live in
 * this instance's memory; a restart picks up what is left (`onApplicationBootstrap`). Logs carry
 * the lead id and an error code, never the email.
 */
@Injectable()
export class LeadNotifier implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(LeadNotifier.name);
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly running = new Set<Promise<void>>();
  private stopped = false;

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly leads: LeadsRepository,
    private readonly sites: SitesRepository,
    private readonly pages: PagesRepository,
    private readonly sender: EmailSender,
    @Inject(NOTIFICATION_RETRY_DELAYS) private readonly retryDelays: readonly number[],
  ) {}

  /** A lead intake just stored (not spam), or one a member asked to send again. */
  enqueue(leadId: ObjectId): void {
    this.schedule(leadId, 0);
  }

  /**
   * Takes on the notifications a stopped instance left: pending ones, and those stuck in
   * `sending` for ten minutes. At most `NOTIFICATION_SWEEP_LIMIT`, oldest first.
   */
  async onApplicationBootstrap(): Promise<void> {
    const staleBefore = new Date(Date.now() - STALE_SENDING_MS);
    const backlog = await this.leads.findNotificationBacklog(staleBefore, NOTIFICATION_SWEEP_LIMIT);
    for (const lead of backlog) {
      if (
        lead.notification?.status === 'sending' &&
        !(await this.leads.requeueStaleNotification(lead._id, staleBefore))
      ) {
        continue;
      }
      this.enqueue(lead._id);
    }
    if (backlog.length > 0) {
      this.logger.log({ count: backlog.length }, 'Lead notifications taken on at startup');
    }
  }

  /** Stops scheduling and waits for the attempts already sending. */
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
    await Promise.allSettled([...this.running]);
  }

  private schedule(leadId: ObjectId, delayMs: number): void {
    this.later(delayMs, leadId, () => this.attempt(leadId));
  }

  /** Runs `task` after `delayMs`, unless the module stops first; failures are logged. */
  private later(delayMs: number, leadId: ObjectId, task: () => Promise<void>): void {
    if (this.stopped) {
      return;
    }
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      const running = task()
        .catch((error: unknown) => {
          this.logger.error(
            { err: error, leadId: leadId.toHexString() },
            'Lead notification task failed',
          );
        })
        .finally(() => {
          this.running.delete(running);
        });
      this.running.add(running);
    }, delayMs);
    // Pending retries never keep the process alive; a restart sweeps them up.
    timer.unref();
    this.timers.add(timer);
  }

  /** One attempt: claim the lead, deliver, and record how it went. */
  private async attempt(leadId: ObjectId): Promise<void> {
    const lead = await this.leads.claimNotification(leadId, new Date());
    if (lead?.notification === undefined) {
      return;
    }
    const { attempts } = lead.notification;
    try {
      await this.deliver(lead, attempts);
    } catch (error) {
      // The database failed between the claim and the outcome. Record a failed attempt rather
      // than leave the lead `sending` until the next restart.
      this.logger.error(
        { err: error, leadId: lead._id.toHexString() },
        'Lead notification attempt crashed',
      );
      await this.recover(lead._id, attempts, true);
    }
  }

  /**
   * Records an attempt that crashed and schedules the next one. When the database still fails,
   * tries once more after the next wait; past that the startup sweep takes the lead on.
   */
  private async recover(leadId: ObjectId, attempts: number, retry: boolean): Promise<void> {
    const delay = nextAttemptDelay(attempts, this.retryDelays);
    try {
      await this.leads.finishNotification(leadId, attempts, {
        status: delay === null ? 'failed' : 'pending',
        lastErrorCode: 'unknown',
        sentAt: null,
        recipients: null,
        rejectedRecipients: null,
        at: new Date(),
      });
    } catch (error) {
      this.logger.error(
        { err: error, leadId: leadId.toHexString() },
        'Lead notification outcome not recorded',
      );
      if (retry) {
        this.later(delay ?? this.retryDelays.at(-1) ?? 0, leadId, () =>
          this.recover(leadId, attempts, false),
        );
      }
      return;
    }
    if (delay !== null) {
      this.schedule(leadId, delay);
    }
  }

  /**
   * Sends the email of a claimed lead and records the outcome. A database error before the email
   * goes out propagates (the attempt is then recorded as failed); after it, `recordSent` copes.
   */
  private async deliver(lead: LeadRecord, attempts: number): Promise<void> {
    const outcome = { sentAt: null, recipients: null, rejectedRecipients: null };
    if (lead.spam.suspected) {
      // Moved to spam by a member after intake: spam is never emailed (ADR-016).
      await this.leads.finishNotification(lead._id, attempts, {
        ...outcome,
        status: 'skipped',
        lastErrorCode: null,
        at: new Date(),
      });
      return;
    }
    const site = await this.sites.findNotificationSite(lead.siteId);
    const recipients = site === null ? [] : confirmedRecipientsOf(site).map((item) => item.email);
    if (site === null || recipients.length === 0) {
      await this.leads.finishNotification(lead._id, attempts, {
        ...outcome,
        status: 'failed',
        lastErrorCode: 'no_recipients',
        at: new Date(),
      });
      this.logger.warn(
        { leadId: lead._id.toHexString(), code: 'no_recipients' },
        'Lead notification not sent',
      );
      return;
    }
    // Pages cannot be deleted; an email still goes out if the data was edited by hand.
    const pageTitle = (await this.pages.findPublicTitle(lead.pageId)) ?? '(trang không còn)';
    const email = leadNotificationEmail({
      siteName: site.name,
      pageTitle,
      releaseVersion: lead.releaseVersion,
      lead: {
        name: lead.fields.name,
        phone: lead.fields.phone,
        email: lead.fields.email,
        message: lead.fields.message,
        source: lead.source,
        createdAt: lead.createdAt,
      },
      leadUrl: `${this.env.ADMIN_ORIGIN}/sites/${lead.siteId.toHexString()}/leads?lead=${lead._id.toHexString()}&range=all`,
    });
    let delivery: EmailDelivery;
    try {
      delivery = await this.sender.send({ to: recipients, ...email });
    } catch (error) {
      const code = error instanceof EmailSendError ? error.code : 'unknown';
      const delay = nextAttemptDelay(attempts, this.retryDelays);
      await this.leads.finishNotification(lead._id, attempts, {
        ...outcome,
        status: delay === null ? 'failed' : 'pending',
        lastErrorCode: code,
        at: new Date(),
      });
      this.logger.warn(
        { leadId: lead._id.toHexString(), code, attempt: attempts },
        'Lead notification attempt failed',
      );
      if (delay !== null) {
        this.schedule(lead._id, delay);
      }
      return;
    }
    await this.recordSent(lead._id, attempts, delivery, new Date(), true);
  }

  /**
   * Records an email the server took. When the database fails, tries once more later: the email
   * must not go out again. Some addresses may have refused while others accepted; sending again
   * would repeat it to the others, so the lead is `sent` and shows the refusal.
   */
  private async recordSent(
    leadId: ObjectId,
    attempts: number,
    delivery: EmailDelivery,
    sentAt: Date,
    retry: boolean,
  ): Promise<void> {
    try {
      await this.leads.finishNotification(leadId, attempts, {
        status: 'sent',
        lastErrorCode: delivery.rejectionCode,
        sentAt,
        recipients: delivery.accepted,
        rejectedRecipients: delivery.rejected,
        at: new Date(),
      });
    } catch (error) {
      this.logger.error(
        { err: error, leadId: leadId.toHexString() },
        'Lead notification sent but not recorded',
      );
      if (retry) {
        this.later(this.retryDelays[0] ?? 0, leadId, () =>
          this.recordSent(leadId, attempts, delivery, sentAt, false),
        );
      }
      return;
    }
    if (delivery.rejected > 0) {
      this.logger.warn(
        { leadId: leadId.toHexString(), code: delivery.rejectionCode, rejected: delivery.rejected },
        'Some addresses refused a lead notification',
      );
    }
  }
}
