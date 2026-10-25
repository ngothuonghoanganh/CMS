import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  type ConfirmLeadRecipientResponse,
  LEAD_RECIPIENTS_MAX,
  type LeadRecipient,
  type LeadRecipientListResponse,
  RECIPIENT_CONFIRM_PATH,
  RECIPIENT_CONFIRMATION_DAYS,
} from '@plp/contracts';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { AppError, notFound } from '../../shared/errors.js';
import { newObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import {
  type LeadRecipientRecord,
  leadRecipientsOf,
  type SiteRecord,
} from '../sites/site.schema.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { SITE_NOT_FOUND, SitesService } from '../sites/sites.service.js';
import { AccessService } from '../workspaces/access.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { confirmationExpiry } from './domain/notification-rules.js';
import { EmailSender, EmailSendError } from './email-sender.js';
import { recipientConfirmationEmail } from './email-templates.js';
import { toLeadRecipientDto } from './recipient-dto.js';

export const RECIPIENT_NOT_FOUND = 'Không tìm thấy địa chỉ nhận lead';
const LINK_EXPIRED = 'Liên kết xác nhận không còn hiệu lực';

/** A confirmation link's secret and what the database keeps of it. */
function newConfirmationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Where a site's leads go (ADR-018). Members see the addresses; the owner adds, removes and
 * re-sends confirmations. An address receives leads only after it opened its confirmation link.
 */
@Injectable()
export class LeadRecipientsService {
  private readonly logger = new Logger(LeadRecipientsService.name);

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly sitesService: SitesService,
    private readonly sites: SitesRepository,
    private readonly access: AccessService,
    private readonly activity: ActivityRepository,
    private readonly transactions: TransactionRunner,
    private readonly sender: EmailSender,
  ) {}

  async list(user: AuthenticatedUser, siteId: string): Promise<LeadRecipientListResponse> {
    const { site } = await this.sitesService.access(user, siteId);
    const now = new Date();
    return { items: leadRecipientsOf(site).map((item) => toLeadRecipientDto(item, now)) };
  }

  /**
   * Adds the address with its activity in one transaction, then emails the confirmation link.
   * When that email fails the address stays, `unsent`, and "Gửi lại" tries again.
   */
  async add(user: AuthenticatedUser, siteId: string, email: string): Promise<LeadRecipient> {
    const { scope, site } = await this.sitesService.access(user, siteId);
    this.access.requireOwner(scope);
    const now = new Date();
    const { token, tokenHash } = newConfirmationToken();
    const recipient: LeadRecipientRecord = {
      _id: newObjectId(),
      email,
      addedAt: now,
      invitedAt: null,
      confirmedAt: null,
      tokenHash,
      tokenExpiresAt: confirmationExpiry(now),
    };
    await this.transactions.run(async (tx) => {
      const outcome = await this.sites.addLeadRecipient(scope, site._id, recipient, tx);
      switch (outcome.kind) {
        case 'exists':
          throw new AppError(409, 'recipient_exists', 'Địa chỉ này đã có trong nơi nhận lead');
        case 'limit_reached':
          throw new AppError(
            409,
            'recipient_limit_reached',
            `Mỗi site có tối đa ${LEAD_RECIPIENTS_MAX} địa chỉ nhận lead`,
          );
        case 'site_missing':
          throw notFound(SITE_NOT_FOUND);
        case 'added':
          await this.activity.record(
            scope,
            { siteId: site._id, type: 'lead.recipients_changed', data: { count: outcome.count } },
            tx,
          );
      }
    });
    const invitedAt = await this.sendConfirmation(scope, site, recipient, token, user.name);
    return toLeadRecipientDto({ ...recipient, invitedAt }, new Date());
  }

  /** A new confirmation link for an address that has not confirmed; the old link stops working. */
  async resend(
    user: AuthenticatedUser,
    siteId: string,
    recipientId: string,
  ): Promise<LeadRecipient> {
    const { scope, site } = await this.sitesService.access(user, siteId);
    this.access.requireOwner(scope);
    const id = toObjectId(recipientId, RECIPIENT_NOT_FOUND);
    const recipient = leadRecipientsOf(site).find((item) => item._id.equals(id));
    if (!recipient) {
      throw notFound(RECIPIENT_NOT_FOUND);
    }
    if (recipient.confirmedAt !== null) {
      throw new AppError(409, 'conflict', 'Địa chỉ này đã xác nhận nhận lead');
    }
    const now = new Date();
    const { token, tokenHash } = newConfirmationToken();
    const invite = { tokenHash, tokenExpiresAt: confirmationExpiry(now) };
    if (!(await this.sites.renewRecipientInvite(scope, site._id, id, invite))) {
      // Removed or confirmed since the site was read.
      throw notFound(RECIPIENT_NOT_FOUND);
    }
    const renewed = { ...recipient, ...invite, invitedAt: null };
    const invitedAt = await this.sendConfirmation(scope, site, renewed, token, user.name);
    return toLeadRecipientDto({ ...renewed, invitedAt }, new Date());
  }

  async remove(user: AuthenticatedUser, siteId: string, recipientId: string): Promise<void> {
    const { scope, site } = await this.sitesService.access(user, siteId);
    this.access.requireOwner(scope);
    const id = toObjectId(recipientId, RECIPIENT_NOT_FOUND);
    await this.transactions.run(async (tx) => {
      const left = await this.sites.removeLeadRecipient(scope, site._id, id, tx);
      if (left === null) {
        throw notFound(RECIPIENT_NOT_FOUND);
      }
      await this.activity.record(
        scope,
        { siteId: site._id, type: 'lead.recipients_changed', data: { count: left } },
        tx,
      );
    });
  }

  /** The person who received the link confirms it; no session. A link works once, for 7 days. */
  async confirm(token: string): Promise<ConfirmLeadRecipientResponse> {
    const confirmed = await this.sites.confirmLeadRecipient(hashToken(token), new Date());
    if (confirmed === null) {
      throw new AppError(404, 'not_found', LINK_EXPIRED, {
        detail: `Liên kết đã được dùng hoặc đã quá ${RECIPIENT_CONFIRMATION_DAYS} ngày. Nhờ chủ site gửi lại thư xác nhận.`,
      });
    }
    return confirmed;
  }

  /** Emails the confirmation link; returns when it went out, or null when it could not be sent. */
  private async sendConfirmation(
    scope: WorkspaceScope,
    site: SiteRecord,
    recipient: Pick<LeadRecipientRecord, '_id' | 'email'>,
    token: string,
    invitedBy: string,
  ): Promise<Date | null> {
    const email = recipientConfirmationEmail({
      siteName: site.name,
      invitedBy,
      confirmUrl: `${this.env.ADMIN_ORIGIN}${RECIPIENT_CONFIRM_PATH}#token=${token}`,
      validDays: RECIPIENT_CONFIRMATION_DAYS,
    });
    try {
      await this.sender.send({ to: [recipient.email], ...email });
    } catch (error) {
      this.logger.warn(
        {
          siteId: site._id.toHexString(),
          recipientId: recipient._id.toHexString(),
          code: error instanceof EmailSendError ? error.code : 'unknown',
        },
        'Lead recipient confirmation not sent',
      );
      return null;
    }
    const invitedAt = new Date();
    await this.sites.markRecipientInvited(scope, site._id, recipient._id, invitedAt);
    return invitedAt;
  }
}
