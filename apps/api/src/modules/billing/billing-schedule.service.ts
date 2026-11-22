import { Injectable } from '@nestjs/common';
import type { PlanCatalog, SubscriptionFacts } from '@plp/contracts';
import { toObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import {
  type AgendaInvoice,
  type AgendaItem,
  billingAgendaOf,
  nextActionAfter,
  outstandingAt,
} from './domain/billing-agenda.js';
import { isFinalInvoiceStatus } from './domain/invoice-state.js';
import type { InvoiceRecord } from './invoice.schema.js';
import { InvoicesRepository } from './invoices.repository.js';
import { InjectPlanCatalog } from './plan-catalog.js';
import { SubscriptionsRepository } from './subscriptions.repository.js';

/** The subscription with the invoices its timeline depends on. */
export interface BillingTimeline {
  facts: SubscriptionFacts;
  /** The invoice it waits for (`openInvoiceId`). */
  due: InvoiceRecord | null;
  /** Its other invoices whose charge's outcome is unknown. */
  undecided: InvoiceRecord[];
  /** The next period's invoice made before the end for a transfer (`renewalInvoiceId`, T4). */
  renewal: InvoiceRecord | null;
  items: AgendaItem[];
}

function agendaInvoice(invoice: InvoiceRecord): AgendaInvoice {
  return { status: invoice.status, createdAt: invoice.createdAt, attempts: invoice.attempts };
}

/**
 * Whether an invoice of a renewal by transfer (T4) still needs the gateway's details: made
 * without them (the gateway failed), or refused when the owner tried a card, which drops them.
 */
export function lacksTransferDetails(invoice: InvoiceRecord | null): invoice is InvoiceRecord {
  return (
    invoice !== null &&
    invoice.kind !== 'marketplace' &&
    invoice.transferRenewal === true &&
    !isFinalInvoiceStatus(invoice.status) &&
    (invoice.status === 'failed' ||
      (invoice.status === 'pending' && invoice.method === 'transfer' && invoice.transfer === null))
  );
}

/**
 * Keeps `nextActionAt` the next time the billing job has work for a subscription (ADR-035, T3):
 * every write that changes what the job does next sets it in its own transaction, from the
 * timeline of the facts after it (`billingAgendaOf`).
 */
@Injectable()
export class BillingSchedule {
  constructor(
    @InjectPlanCatalog() private readonly catalog: PlanCatalog,
    private readonly subscriptions: SubscriptionsRepository,
    private readonly invoices: InvoicesRepository,
  ) {}

  /**
   * The timeline of the workspace's subscription as `tx` sees it. One read after the other: the
   * first operations of a transaction cannot run at once.
   */
  async timelineOf(ref: WorkspaceRef, tx?: Tx): Promise<BillingTimeline> {
    const facts = await this.subscriptions.find(ref, tx);
    const open = await this.invoices.listUndecided(ref, tx);
    if (facts === null) {
      throw new Error(`Workspace ${ref.workspaceId.toHexString()} has no subscription (ADR-035)`);
    }
    const dueId = facts.openInvoiceId;
    const due = await this.invoiceOf(dueId, open, tx);
    const renewal = await this.invoiceOf(facts.renewalInvoiceId, open, tx);
    // The early invoice is among them while the owner's card charge of it is unknown (T4).
    const undecided = open.filter((invoice) => invoice._id.toHexString() !== dueId);
    // A renewal by transfer whose invoice still lacks the gateway's details (T4); a card that
    // replaced the transfer pays it at the end instead. Past the end, a card the owner tried
    // instead and the bank refused leaves the invoice to the retries of T3.
    const lacking =
      facts.renewalMethod !== 'transfer'
        ? undefined
        : lacksTransferDetails(renewal)
          ? renewal
          : lacksTransferDetails(due) && due.status !== 'failed'
            ? due
            : undefined;
    const items = billingAgendaOf({
      facts,
      policy: this.catalog,
      due: due === null ? null : agendaInvoice(due),
      undecided: undecided.map(agendaInvoice),
      transferDetailsLacking: lacking?.createdAt ?? null,
    });
    return { facts, due, undecided, renewal, items };
  }

  private async invoiceOf(
    id: string | null,
    open: readonly InvoiceRecord[],
    tx: Tx | undefined,
  ): Promise<InvoiceRecord | null> {
    if (id === null) {
      return null;
    }
    return (
      open.find((invoice) => invoice._id.toHexString() === id) ??
      (await this.invoices.findByReference(toObjectId(id), tx))
    );
  }

  /**
   * Sets `nextActionAt` after a write in `tx`, at `now`: the next thing on the timeline. A time
   * already due stays, since the job runs then and sets it when it ends; an earlier time than
   * before wakes the job on every instance. A payment never leaves a renewal due: one made once its
   * period had ended starts the period when it is paid (`periodPaidAt`). Work still owed past its
   * time (T4's transfer invoice) makes the job due now.
   */
  async reschedule(ref: WorkspaceRef, now: Date, tx: Tx): Promise<void> {
    const { facts, items } = await this.timelineOf(ref, tx);
    const before = facts.nextActionAt;
    if (before !== null && before.getTime() <= now.getTime()) {
      return;
    }
    const next = outstandingAt(items, now) ?? nextActionAfter(items, now);
    if (next?.getTime() !== before?.getTime()) {
      await this.subscriptions.setNextAction(ref, { at: next, before }, tx);
    }
  }
}
