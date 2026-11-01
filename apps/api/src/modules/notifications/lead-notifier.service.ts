import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import type { LeadRecord } from '../leads/lead.schema.js';
import { type LeadRef, LeadsRepository } from '../leads/leads.repository.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { confirmedRecipientsOf } from '../sites/site.schema.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
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
    private readonly workspaces: WorkspacesRepository,
    private readonly sender: EmailSender,
    @Inject(NOTIFICATION_RETRY_DELAYS) private readonly retryDelays: readonly number[],
  ) {}

  /** A lead intake just stored (not spam), or one a member asked to send again. */
  enqueue(ref: LeadRef): void {
    this.schedule(ref, 0);
  }

  /**
   * Takes on the notifications a stopped instance left: pending ones, and those stuck in
   * `sending` for ten minutes. At most `NOTIFICATION_SWEEP_LIMIT`, oldest first in each workspace.
   */
  async onApplicationBootstrap(): Promise<void> {
    const staleBefore = new Date(Date.now() - STALE_SENDING_MS);
    let taken = 0;
    // Each workspace database holds its own leads (ADR-025).
    for await (const workspaceId of this.workspaces.allIds()) {
      if (taken >= NOTIFICATION_SWEEP_LIMIT) {
        break;
      }
      const backlog = await this.leads.findNotificationBacklog(
        { workspaceId },
        staleBefore,
        NOTIFICATION_SWEEP_LIMIT - taken,
      );
      for (const lead of backlog) {
        const ref: LeadRef = { workspaceId, leadId: lead._id };
        if (
          lead.notification?.status === 'sending' &&
          !(await this.leads.requeueStaleNotification(ref, staleBefore))
        ) {
          continue;
        }
        this.enqueue(ref);
        taken += 1;
      }
    }
    if (taken > 0) {
      this.logger.log({ count: taken }, 'Lead notifications taken on at startup');
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

  private schedule(ref: LeadRef, delayMs: number): void {
    this.later(delayMs, ref, () => this.attempt(ref, true));
  }

  /** Runs `task` after `delayMs`, unless the module stops first; failures are logged. */
  private later(delayMs: number, ref: LeadRef, task: () => Promise<void>): void {
    if (this.stopped) {
      return;
    }
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      const running = task()
        .catch((error: unknown) => {
          this.logger.error(
            { err: error, leadId: ref.leadId.toHexString() },
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

  /**
   * One attempt: claim the lead, deliver, and record how it went. When the claim itself fails,
   * claims once more after the first wait; past that the startup sweep takes the lead on.
   */
  private async attempt(ref: LeadRef, retry: boolean): Promise<void> {
    let lead: LeadRecord | null;
    try {
      lead = await this.leads.claimNotification(ref, new Date());
    } catch (error) {
      // No attempt was counted and the lead stays `pending`, which nothing else takes on before a
      // restart: "Gửi lại" only applies to `failed`.
      this.logger.error(
        { err: error, leadId: ref.leadId.toHexString() },
        'Lead notification not claimed',
      );
      if (retry) {
        this.later(this.retryDelays[0] ?? 0, ref, () => this.attempt(ref, false));
      }
      return;
    }
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
      await this.recover(ref, attempts, true);
    }
  }

  /**
   * Records an attempt that crashed and schedules the next one. When the database still fails,
   * tries once more after the next wait; past that the startup sweep takes the lead on.
   */
  private async recover(ref: LeadRef, attempts: number, retry: boolean): Promise<void> {
    const delay = nextAttemptDelay(attempts, this.retryDelays);
    try {
      await this.leads.finishNotification(ref, attempts, {
        status: delay === null ? 'failed' : 'pending',
        lastErrorCode: 'unknown',
        sentAt: null,
        recipients: null,
        rejectedRecipients: null,
        at: new Date(),
      });
    } catch (error) {
      this.logger.error(
        { err: error, leadId: ref.leadId.toHexString() },
        'Lead notification outcome not recorded',
      );
      if (retry) {
        this.later(delay ?? this.retryDelays.at(-1) ?? 0, ref, () =>
          this.recover(ref, attempts, false),
        );
      }
      return;
    }
    if (delay !== null) {
      this.schedule(ref, delay);
    }
  }

  /**
   * Sends the email of a claimed lead and records the outcome. A database error before the email
   * goes out propagates (the attempt is then recorded as failed); after it, `recordSent` copes.
   */
  private async deliver(lead: LeadRecord, attempts: number): Promise<void> {
    const ref: LeadRef = { workspaceId: lead.workspaceId, leadId: lead._id };
    const outcome = { sentAt: null, recipients: null, rejectedRecipients: null };
    if (lead.spam.suspected) {
      // Moved to spam by a member after intake: spam is never emailed (ADR-016).
      await this.leads.finishNotification(ref, attempts, {
        ...outcome,
        status: 'skipped',
        lastErrorCode: null,
        at: new Date(),
      });
      return;
    }
    const site = await this.sites.findNotificationSite(lead, lead.siteId);
    const recipients = site === null ? [] : confirmedRecipientsOf(site).map((item) => item.email);
    if (site === null || recipients.length === 0) {
      await this.leads.finishNotification(ref, attempts, {
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
    const pageTitle = (await this.pages.findPublicTitle(lead, lead.pageId)) ?? '(trang không còn)';
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
      await this.leads.finishNotification(ref, attempts, {
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
        this.schedule(ref, delay);
      }
      return;
    }
    await this.recordSent(ref, attempts, delivery, new Date(), true);
  }

  /**
   * Records an email the server took. When the database fails, tries once more later: the email
   * must not go out again. Some addresses may have refused while others accepted; sending again
   * would repeat it to the others, so the lead is `sent` and shows the refusal.
   */
  private async recordSent(
    ref: LeadRef,
    attempts: number,
    delivery: EmailDelivery,
    sentAt: Date,
    retry: boolean,
  ): Promise<void> {
    try {
      await this.leads.finishNotification(ref, attempts, {
        status: 'sent',
        lastErrorCode: delivery.rejectionCode,
        sentAt,
        recipients: delivery.accepted,
        rejectedRecipients: delivery.rejected,
        at: new Date(),
      });
    } catch (error) {
      this.logger.error(
        { err: error, leadId: ref.leadId.toHexString() },
        'Lead notification sent but not recorded',
      );
      if (retry) {
        this.later(this.retryDelays[0] ?? 0, ref, () =>
          this.recordSent(ref, attempts, delivery, sentAt, false),
        );
      }
      return;
    }
    if (delivery.rejected > 0) {
      this.logger.warn(
        {
          leadId: ref.leadId.toHexString(),
          code: delivery.rejectionCode,
          rejected: delivery.rejected,
        },
        'Some addresses refused a lead notification',
      );
    }
  }
}
