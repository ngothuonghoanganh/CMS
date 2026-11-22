import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { InvoiceStatus } from '@plp/contracts';
import type { Model } from 'mongoose';
import {
  afterCursor,
  type KeysetPage,
  NEWEST_FIRST,
  toKeysetPage,
} from '../../shared/persistence/keyset.js';
import { newObjectId, type ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import { formatInvoiceNumber, invoiceCounterId } from './domain/invoice-number.js';
import { isFinalInvoiceStatus } from './domain/invoice-state.js';
import { vnYearOf } from './domain/billing-period.js';
import {
  INVOICE_COUNTER_MODEL,
  INVOICE_MODEL,
  type InvoiceAttemptRecord,
  type InvoiceCounterRecord,
  type InvoiceRecord,
  type InvoiceTransferRecord,
  type MarketplaceInvoiceRecord,
  type PlanInvoiceRecord,
} from './invoice.schema.js';

/** Invoices of a workspace whose charge's outcome is unknown, read at once at most. */
const UNDECIDED_MAX = 10;

/** What the repository sets on a new invoice itself. */
type SetOnCreate =
  | '_id'
  | 'number'
  | 'status'
  | 'attempts'
  | 'paidAt'
  | 'voidedAt'
  | 'createdAt'
  | 'updatedAt'
  | 'transfer';

/**
 * A new invoice of the plan: everything but its number and the dates the repository sets. It is
 * `open`, or `pending` from the start when it waits for a transfer (`awaitingTransfer`, T3), whose
 * details the gateway gives once its number is known (`startTransfer`).
 */
export type NewPlanInvoice = Omit<PlanInvoiceRecord, SetOnCreate> & {
  awaitingTransfer?: boolean;
};

/** A new invoice of a marketplace item (ADR-036): `open`, paid by card only. */
export type NewMarketplaceInvoice = Omit<MarketplaceInvoiceRecord, SetOnCreate>;

export type NewInvoice = NewPlanInvoice | NewMarketplaceInvoice;

/** What a charge changes besides the attempt it adds. */
export interface InvoiceChange {
  status: Exclude<InvoiceStatus, 'void'>;
  card?: { brand: string; last4: string };
  paidAt?: Date;
  /** The period it was paid for, when not the one it was made for (`periodPaidAt`). */
  period?: { start: Date; end: Date };
}

/**
 * The statuses a write may start from. A paid or void invoice never changes (ADR-035, §2 rule
 * 12): every write of this repository filters by a list from here, so none can reach one.
 */
function changeableFrom(statuses: readonly InvoiceStatus[]): { $in: InvoiceStatus[] } {
  const final = statuses.filter(isFinalInvoiceStatus);
  if (final.length > 0 || statuses.length === 0) {
    throw new Error(`A paid or void invoice never changes (asked to change ${final.join(', ')})`);
  }
  return { $in: [...statuses] };
}

/**
 * `invoices` and `invoice_counters` of the master DB (ADR-035). A workspace's invoices are read
 * through a scope; the webhook finds one by the id the gateway echoes back.
 */
@Injectable()
export class InvoicesRepository {
  constructor(
    @InjectModel(INVOICE_MODEL) private readonly invoices: Model<InvoiceRecord>,
    @InjectModel(INVOICE_COUNTER_MODEL) private readonly counters: Model<InvoiceCounterRecord>,
  ) {}

  /** Stores an `open` invoice numbered in `tx`, so a number is used only if the invoice is. */
  async create(invoice: NewInvoice, at: Date, tx: Tx): Promise<InvoiceRecord> {
    const year = vnYearOf(at);
    // An upsert that returns the document after it always has one.
    const counter = await this.counters
      .findOneAndUpdate(
        { _id: invoiceCounterId(year) },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after', session: tx },
      )
      .lean<InvoiceCounterRecord>()
      .exec();
    const set = {
      _id: newObjectId(),
      number: formatInvoiceNumber(year, counter.seq),
      transfer: null,
      attempts: [],
      paidAt: null,
      voidedAt: null,
      createdAt: at,
      updatedAt: at,
    };
    let record: InvoiceRecord;
    if (invoice.kind === 'marketplace') {
      record = { ...invoice, ...set, status: 'open' };
    } else {
      const { awaitingTransfer, ...fields } = invoice;
      record = { ...fields, ...set, status: awaitingTransfer === true ? 'pending' : 'open' };
    }
    await this.invoices.create([record], { session: tx });
    return record;
  }

  /**
   * The purchase a request's `Idempotency-Key` made in the workspace (ADR-036); null when it made
   * none. Unique per workspace (`INVOICES_REQUEST_KEY_INDEX`).
   */
  findByRequestKey(
    ref: WorkspaceRef,
    requestKey: string,
    tx?: Tx,
  ): Promise<MarketplaceInvoiceRecord | null> {
    return this.invoices
      .findOne({ workspaceId: ref.workspaceId, kind: 'marketplace', requestKey })
      .session(tx ?? null)
      .lean<MarketplaceInvoiceRecord>()
      .exec();
  }

  /**
   * Voids the refused purchases of an item (ADR-036), which a new purchase of it replaces: only the
   * new one can be paid from then on. An undecided one (`open`) blocks the new purchase instead,
   * since its charge may have gone through. How many it voided.
   */
  async voidRefusedPurchases(ref: WorkspaceRef, itemId: string, at: Date, tx: Tx): Promise<number> {
    const result = await this.invoices
      .updateMany(
        {
          workspaceId: ref.workspaceId,
          kind: 'marketplace',
          'item.itemId': itemId,
          status: changeableFrom(['failed']),
        },
        { $set: { status: 'void', voidedAt: at, updatedAt: at } },
        { session: tx },
      )
      .exec();
    return result.modifiedCount;
  }

  findOfWorkspace(ref: WorkspaceRef, invoiceId: ObjectId, tx?: Tx): Promise<InvoiceRecord | null> {
    return this.invoices
      .findOne({ _id: invoiceId, workspaceId: ref.workspaceId })
      .session(tx ?? null)
      .lean<InvoiceRecord>()
      .exec();
  }

  /** By the id a gateway echoes back (ADR-035): the webhook knows no workspace before it. */
  findByReference(invoiceId: ObjectId, tx?: Tx): Promise<InvoiceRecord | null> {
    return this.invoices
      .findById(invoiceId)
      .session(tx ?? null)
      .lean<InvoiceRecord>()
      .exec();
  }

  /** "Lịch sử giao dịch", newest first, `limit` at a time. */
  async list(
    ref: WorkspaceRef,
    page: { cursor: string | undefined; limit: number },
  ): Promise<KeysetPage<InvoiceRecord>> {
    const records = await this.invoices
      .find({ workspaceId: ref.workspaceId, ...afterCursor(page.cursor) })
      .sort(NEWEST_FIRST)
      .limit(page.limit + 1)
      .lean<InvoiceRecord[]>()
      .exec();
    return toKeysetPage(records, page.limit);
  }

  /**
   * Whether a card charge of the workspace is still being decided by the gateway. A transfer
   * waiting for its confirmation is not one (T3): nothing is decided at the gateway for it.
   */
  async hasPending(ref: WorkspaceRef, tx?: Tx): Promise<boolean> {
    const found = await this.invoices
      .exists({ workspaceId: ref.workspaceId, status: 'pending', method: 'card' })
      .session(tx ?? null)
      .exec();
    return found !== null;
  }

  /** The newest card charge of the workspace the gateway is still deciding; null for none. */
  findPending(ref: WorkspaceRef, tx?: Tx): Promise<InvoiceRecord | null> {
    return this.invoices
      .findOne({ workspaceId: ref.workspaceId, status: 'pending', method: 'card' })
      .sort(NEWEST_FIRST)
      .session(tx ?? null)
      .lean<InvoiceRecord>()
      .exec();
  }

  /** Every invoice of the workspace whose charge may have gone through (`open`), newest first. */
  listUndecided(ref: WorkspaceRef, tx?: Tx): Promise<InvoiceRecord[]> {
    return this.invoices
      .find({ workspaceId: ref.workspaceId, status: 'open' })
      .sort(NEWEST_FIRST)
      .limit(UNDECIDED_MAX)
      .session(tx ?? null)
      .lean<InvoiceRecord[]>()
      .exec();
  }

  /**
   * "Chuyển khoản" (T3): the invoice waits for the transfer, `pending`, with what the gateway gave
   * for it. Only from a refused charge (`failed`), or for a transfer waiting without them yet; null
   * otherwise.
   */
  startTransfer(
    invoiceId: ObjectId,
    transfer: InvoiceTransferRecord,
    tx: Tx,
  ): Promise<InvoiceRecord | null> {
    return this.invoices
      .findOneAndUpdate(
        {
          _id: invoiceId,
          $or: [
            { status: changeableFrom(['failed']) },
            { status: changeableFrom(['pending']), method: 'transfer', transfer: null },
          ],
        },
        {
          $set: {
            status: 'pending',
            method: 'transfer',
            transfer,
            updatedAt: transfer.startedAt,
          },
        },
        { returnDocument: 'after', session: tx },
      )
      .lean<InvoiceRecord>()
      .exec();
  }

  /**
   * Voids the transfers still waiting for plans paid now that a new choice replaces (T3): a
   * transfer that arrives for one later is refunded outside the system. The invoices voided.
   */
  async voidReplacedTransfers(ref: WorkspaceRef, at: Date, tx: Tx): Promise<ObjectId[]> {
    const filter = {
      workspaceId: ref.workspaceId,
      from: { $ne: null },
      method: 'transfer' as const,
      status: changeableFrom(['pending']),
    };
    const replaced = await this.invoices
      .find(filter, { _id: 1 })
      .session(tx)
      .lean<Pick<InvoiceRecord, '_id'>[]>()
      .exec();
    if (replaced.length === 0) {
      return [];
    }
    const ids = replaced.map((invoice) => invoice._id);
    await this.invoices
      .updateMany(
        { ...filter, _id: { $in: ids } },
        { $set: { status: 'void', voidedAt: at, updatedAt: at } },
        { session: tx },
      )
      .exec();
    return ids;
  }

  /**
   * Voids the early invoice of a renewal by transfer (T4) that a plan change replaces: waiting for
   * its transfer, or refused when the owner tried a card. Never one whose card charge is being
   * decided or may have gone through. Null when it was paid or decided meanwhile.
   */
  voidRenewalTransfer(invoiceId: ObjectId, at: Date, tx: Tx): Promise<PlanInvoiceRecord | null> {
    return this.invoices
      .findOneAndUpdate(
        {
          _id: invoiceId,
          transferRenewal: true,
          $or: [
            { status: changeableFrom(['pending']), method: 'transfer' },
            { status: changeableFrom(['failed']) },
          ],
        },
        { $set: { status: 'void', voidedAt: at, updatedAt: at } },
        { returnDocument: 'after', session: tx },
      )
      .lean<PlanInvoiceRecord>()
      .exec();
  }

  /**
   * The early invoice of a renewal by transfer, unpaid at the end, is charged to the card instead
   * (T4: the method went back to the card): `open` again, as any invoice of the job before its
   * charge, so a charge never recorded is asked about with its key. Null when it was paid or
   * decided meanwhile.
   */
  reopenForCard(invoiceId: ObjectId, at: Date, tx: Tx): Promise<PlanInvoiceRecord | null> {
    return this.invoices
      .findOneAndUpdate(
        { _id: invoiceId, status: changeableFrom(['pending']), method: 'transfer' },
        { $set: { status: 'open', method: 'card', transfer: null, updatedAt: at } },
        { returnDocument: 'after', session: tx },
      )
      .lean<PlanInvoiceRecord>()
      .exec();
  }

  /**
   * Voids an invoice whose charge's outcome the gateway still cannot tell once what it paid for is
   * over (T3): it is never charged again. Null when it was decided meanwhile.
   */
  voidUndecided(invoiceId: ObjectId, at: Date, tx: Tx): Promise<InvoiceRecord | null> {
    return this.invoices
      .findOneAndUpdate(
        { _id: invoiceId, status: changeableFrom(['open']) },
        { $set: { status: 'void', voidedAt: at, updatedAt: at } },
        { returnDocument: 'after', session: tx },
      )
      .lean<InvoiceRecord>()
      .exec();
  }

  /**
   * The newest invoice of the workspace whose charge may have gone through without the API knowing
   * (ADR-035): `open` after an unknown outcome, or after a charge the API never recorded. Only
   * "Thanh toán lại" on it, with the same key at the gateway, decides it. `except` leaves out the
   * invoice about to be charged itself.
   */
  findUndecided(ref: WorkspaceRef, tx: Tx, except?: ObjectId): Promise<InvoiceRecord | null> {
    return this.invoices
      .findOne({
        workspaceId: ref.workspaceId,
        status: 'open',
        ...(except === undefined ? {} : { _id: { $ne: except } }),
      })
      .sort(NEWEST_FIRST)
      .session(tx)
      .lean<InvoiceRecord>()
      .exec();
  }

  /**
   * Voids the refused invoices of earlier plan changes, which a new change replaces: none of them
   * can be paid after it. An undecided one (`open`) is never voided, since its charge may have
   * gone through. How many it voided.
   */
  async voidRefusedChanges(ref: WorkspaceRef, at: Date, tx: Tx): Promise<number> {
    const result = await this.invoices
      .updateMany(
        {
          workspaceId: ref.workspaceId,
          from: { $ne: null },
          status: changeableFrom(['failed']),
        },
        { $set: { status: 'void', voidedAt: at, updatedAt: at } },
        { session: tx },
      )
      .exec();
    return result.modifiedCount;
  }

  /**
   * Adds the outcome of a charge, only while the invoice's status is one of `from`; the invoice
   * after, or null when its status was not (another charge or event decided it first).
   */
  async recordCharge(
    invoiceId: ObjectId,
    from: readonly InvoiceStatus[],
    attempt: InvoiceAttemptRecord,
    change: InvoiceChange,
    tx: Tx,
  ): Promise<InvoiceRecord | null> {
    const status = changeableFrom(from);
    return this.invoices
      .findOneAndUpdate(
        { _id: invoiceId, status },
        {
          $set: {
            status: change.status,
            updatedAt: attempt.at,
            // A card paying a transfer still waiting (T3) makes it a card payment again.
            ...(change.card ? { card: change.card, method: 'card', transfer: null } : {}),
            ...(change.paidAt ? { paidAt: change.paidAt } : {}),
            ...(change.period
              ? { periodStart: change.period.start, periodEnd: change.period.end }
              : {}),
          },
          $push: { attempts: attempt },
        },
        { returnDocument: 'after', session: tx },
      )
      .lean<InvoiceRecord>()
      .exec();
  }
}
