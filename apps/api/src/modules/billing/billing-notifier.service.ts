import { Injectable, Logger } from '@nestjs/common';
import {
  type PaymentDeclineCode,
  paymentDeclineLabels,
  type PlanCatalog,
  type RenewalBlocker,
  type SubscriptionFacts,
  type SubscriptionState,
} from '@plp/contracts';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import { UsersRepository } from '../auth/users.repository.js';
import { EmailSender, EmailSendError } from '../notifications/email-sender.js';
import {
  billingChargeFailedEmail,
  billingExpiringSoonEmail,
  billingReadOnlyEmail,
  billingReceiptEmail,
  billingTrialEndingEmail,
  type KeyedEmail,
} from '../notifications/emails.js';
import { WorkspaceLinks } from '../workspaces/workspace-links.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import { BillingNoticesRepository } from './billing-notices.repository.js';
import { DAY_MS } from './domain/billing-period.js';
import { cardText, cycleText, periodText, vnDateText, vndText } from './domain/billing-text.js';
import { renewalBlockerOf } from './domain/renewal.js';
import type { InvoiceRecord } from './invoice.schema.js';
import { InjectPlanCatalog, planOf } from './plan-catalog.js';
import { readOnlyReasonOf } from './plan-problems.js';

/**
 * What became of an email of the plan: sent now, sent before (or being sent), not sent (logged),
 * or nobody to send it to (the workspace or its owner is gone).
 */
export type NoticeOutcome = 'sent' | 'sent_before' | 'failed' | 'nobody';

/** Where the email's links lead and whose workspace it is. */
interface NoticeContext {
  workspaceId: string;
  workspaceName: string;
  /** Board 28. */
  billingUrl: string;
  /** Board 29. */
  paymentsUrl: string;
  /** The admin of the workspace, for other links. */
  origin: string;
}

/**
 * The emails of a workspace's plan to its Chủ sở hữu (ADR-035, T3): the trial's reminder, a refused
 * charge of the job, "Sắp hết hạn", read-only, and the receipt of each paid invoice. Each goes once
 * (`billing_notices`, keyed by its idempotency key) to the owner of the moment. A send that fails
 * is logged and given back, so a later try of the same email may send it; nothing here throws.
 */
@Injectable()
export class BillingNotifier {
  private readonly logger = new Logger(BillingNotifier.name);

  constructor(
    @InjectPlanCatalog() private readonly catalog: PlanCatalog,
    private readonly notices: BillingNoticesRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly users: UsersRepository,
    private readonly links: WorkspaceLinks,
    private readonly sender: EmailSender,
  ) {}

  /** "Dùng thử sắp hết": what the end charges with the saved card, or how to keep going. */
  trialEnding(ref: WorkspaceRef, facts: SubscriptionFacts, at: Date): Promise<NoticeOutcome> {
    const trialEndsAt = facts.trialEndsAt;
    if (trialEndsAt === null) {
      return Promise.resolve('nobody');
    }
    const plan = planOf(this.catalog, facts.planId);
    const card =
      facts.paymentMethod !== null && renewalBlockerOf(facts.paymentMethod, trialEndsAt) === null
        ? facts.paymentMethod
        : null;
    return this.deliver(ref, (context) =>
      billingTrialEndingEmail({
        workspaceId: context.workspaceId,
        trialEndsAt,
        workspaceName: context.workspaceName,
        planName: plan.name,
        trialEndsOn: vnDateText(trialEndsAt),
        daysLeft: Math.max(1, Math.ceil((trialEndsAt.getTime() - at.getTime()) / DAY_MS)),
        charge:
          card === null
            ? null
            : {
                amount: vndText(plan.prices[facts.cycle]),
                cycle: cycleText(facts.cycle),
                card: cardText(card),
              },
        billingUrl: context.billingUrl,
      }),
    );
  }

  /** A charge of the job did not go through: why, when it is tried again, until when it is free. */
  chargeFailed(
    invoice: InvoiceRecord,
    failure: {
      attempt: number;
      code: PaymentDeclineCode;
      nextRetryAt: Date | null;
      graceEndsAt: Date;
    },
  ): Promise<NoticeOutcome> {
    return this.deliver({ workspaceId: invoice.workspaceId }, (context) =>
      billingChargeFailedEmail({
        invoiceId: invoice._id.toHexString(),
        attempt: failure.attempt,
        workspaceName: context.workspaceName,
        planName: invoice.planName,
        invoiceNumber: invoice.number,
        amount: vndText(invoice.amount),
        reason: paymentDeclineLabels[failure.code],
        card: invoice.card === null ? null : cardText(invoice.card),
        nextRetryOn: failure.nextRetryAt === null ? null : vnDateText(failure.nextRetryAt),
        graceEndsOn: vnDateText(failure.graceEndsAt),
        paymentsUrl: context.paymentsUrl,
      }),
    );
  }

  /** "Sắp hết hạn": the period ends soon and the card cannot renew it. */
  expiringSoon(
    ref: WorkspaceRef,
    facts: SubscriptionFacts,
    blocker: RenewalBlocker,
    at: Date,
  ): Promise<NoticeOutcome> {
    const plan = planOf(this.catalog, facts.planId);
    const method = facts.paymentMethod;
    const reason =
      blocker === 'card_expires' && method !== null
        ? `Thẻ ${cardText(method)} hết hạn ${String(method.expMonth).padStart(2, '0')}/${method.expYear}, trước ngày gia hạn`
        : 'Workspace chưa có thẻ thanh toán';
    return this.deliver(ref, (context) =>
      billingExpiringSoonEmail({
        workspaceId: context.workspaceId,
        periodEnd: facts.periodEnd,
        workspaceName: context.workspaceName,
        planName: plan.name,
        periodEndsOn: vnDateText(facts.periodEnd),
        daysLeft: Math.max(1, Math.ceil((facts.periodEnd.getTime() - at.getTime()) / DAY_MS)),
        reason,
        paymentsUrl: context.paymentsUrl,
      }),
    );
  }

  /** The workspace turned read-only at `since`, in `state`. */
  readOnly(ref: WorkspaceRef, state: SubscriptionState, since: Date): Promise<NoticeOutcome> {
    const reason = readOnlyReasonOf(state);
    if (reason === null) {
      return Promise.resolve('nobody');
    }
    return this.deliver(ref, (context) =>
      billingReadOnlyEmail({
        workspaceId: context.workspaceId,
        since,
        workspaceName: context.workspaceName,
        reason,
        billingUrl: context.billingUrl,
      }),
    );
  }

  /** The receipt of a paid invoice, whoever or whatever paid it. */
  receipt(invoice: InvoiceRecord): Promise<NoticeOutcome> {
    const paidAt = invoice.paidAt;
    if (invoice.status !== 'paid' || paidAt === null) {
      return Promise.resolve('nobody');
    }
    const invoiceId = invoice._id.toHexString();
    return this.deliver({ workspaceId: invoice.workspaceId }, (context) =>
      billingReceiptEmail({
        invoiceId,
        workspaceName: context.workspaceName,
        invoiceNumber: invoice.number,
        planName: invoice.planName,
        period: periodText(invoice.periodStart, invoice.periodEnd),
        amount: vndText(invoice.amount),
        paidOn: vnDateText(paidAt),
        method:
          invoice.method === 'transfer' || invoice.card === null
            ? 'Chuyển khoản'
            : `Thẻ ${cardText(invoice.card)}`,
        receiptUrl: `${context.origin}/workspaces/${context.workspaceId}/billing/receipts/${invoiceId}`,
      }),
    );
  }

  /**
   * Sends the email to the workspace's Chủ sở hữu, once. Reading who and where is part of it: any
   * failure is logged and the email given back, never raised, since what it tells is stored.
   */
  private async deliver(
    ref: WorkspaceRef,
    build: (context: NoticeContext) => KeyedEmail,
  ): Promise<NoticeOutcome> {
    const workspaceId = ref.workspaceId.toHexString();
    let template: string | null = null;
    let claimed: string | null = null;
    try {
      const [workspace, owner] = await Promise.all([
        this.workspaces.findNameOf(ref.workspaceId),
        this.workspaces.findOwnerOf(ref.workspaceId),
      ]);
      const [contact] = owner === null ? [] : await this.users.findContacts([owner.userId]);
      if (workspace === null || contact === undefined) {
        return 'nobody';
      }
      const origin = this.links.originFor(workspace);
      const billingUrl = `${origin}/workspaces/${workspaceId}/billing`;
      const email = build({
        workspaceId,
        workspaceName: workspace.name,
        billingUrl,
        paymentsUrl: `${billingUrl}/payments`,
        origin,
      });
      template = email.template;
      if (!(await this.notices.claim(ref, { key: email.idempotencyKey, template }))) {
        return 'sent_before';
      }
      claimed = email.idempotencyKey;
      await this.sender.send({ to: [contact.email], ...email });
      return 'sent';
    } catch (error) {
      if (claimed !== null) {
        await this.notices.release(claimed).catch((releaseError: unknown) => {
          this.logger.error(
            { workspaceId, template, err: releaseError },
            'Giving back an email of the plan that was not sent failed',
          );
        });
      }
      this.logger.warn(
        {
          workspaceId,
          template,
          code: error instanceof EmailSendError ? error.code : 'unknown',
          err: error instanceof EmailSendError ? undefined : error,
        },
        'Email of the plan not sent',
      );
      return 'failed';
    }
  }
}
