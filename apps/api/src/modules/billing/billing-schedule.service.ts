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
} from './domain/billing-agenda.js';
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
  items: AgendaItem[];
}

function agendaInvoice(invoice: InvoiceRecord): AgendaInvoice {
  return { status: invoice.status, createdAt: invoice.createdAt, attempts: invoice.attempts };
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
    const due =
      dueId === null
        ? null
        : (open.find((invoice) => invoice._id.toHexString() === dueId) ??
          (await this.invoices.findByReference(toObjectId(dueId), tx)));
    const undecided = open.filter((invoice) => invoice._id.toHexString() !== dueId);
    const items = billingAgendaOf({
      facts,
      policy: this.catalog,
      due: due === null ? null : agendaInvoice(due),
      undecided: undecided.map(agendaInvoice),
    });
    return { facts, due, undecided, items };
  }

  /**
   * Sets `nextActionAt` after a write in `tx`, at `now`: the next thing on the timeline. A time
   * already due stays, since the job runs then and sets it when it ends; an earlier time than
   * before wakes the job on every instance.
   */
  async reschedule(ref: WorkspaceRef, now: Date, tx: Tx): Promise<void> {
    const { facts, items } = await this.timelineOf(ref, tx);
    const before = facts.nextActionAt;
    if (before !== null && before.getTime() <= now.getTime()) {
      return;
    }
    const next = nextActionAfter(items, now);
    if (next?.getTime() !== before?.getTime()) {
      await this.subscriptions.setNextAction(ref, { at: next, before }, tx);
    }
  }
}
