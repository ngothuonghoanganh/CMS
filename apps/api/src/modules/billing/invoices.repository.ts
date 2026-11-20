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
} from './invoice.schema.js';

/** A new invoice: everything but its id, number and the dates the repository sets. */
export type NewInvoice = Omit<
  InvoiceRecord,
  '_id' | 'number' | 'status' | 'attempts' | 'paidAt' | 'voidedAt' | 'createdAt' | 'updatedAt'
>;

/** What a charge changes besides the attempt it adds. */
export interface InvoiceChange {
  status: Exclude<InvoiceStatus, 'void'>;
  card?: { brand: string; last4: string };
  paidAt?: Date;
  /** A trial paid late starts its period when it is paid. */
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
    const record: InvoiceRecord = {
      _id: newObjectId(),
      number: formatInvoiceNumber(year, counter.seq),
      ...invoice,
      status: 'open',
      attempts: [],
      paidAt: null,
      voidedAt: null,
      createdAt: at,
      updatedAt: at,
    };
    await this.invoices.create([record], { session: tx });
    return record;
  }

  findOfWorkspace(ref: WorkspaceRef, invoiceId: ObjectId, tx?: Tx): Promise<InvoiceRecord | null> {
    return this.invoices
      .findOne({ _id: invoiceId, workspaceId: ref.workspaceId })
      .session(tx ?? null)
      .lean<InvoiceRecord>()
      .exec();
  }

  /** By the id a gateway echoes back (ADR-035): the webhook knows no workspace before it. */
  findByReference(invoiceId: ObjectId, tx: Tx): Promise<InvoiceRecord | null> {
    return this.invoices.findById(invoiceId).session(tx).lean<InvoiceRecord>().exec();
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

  /** Whether a charge of the workspace is still being decided by the gateway. */
  async hasPending(ref: WorkspaceRef, tx: Tx): Promise<boolean> {
    const found = await this.invoices
      .exists({ workspaceId: ref.workspaceId, status: 'pending' })
      .session(tx)
      .exec();
    return found !== null;
  }

  /**
   * The newest invoice of the workspace whose charge may have gone through without the API knowing
   * (ADR-035): `open` after an unknown outcome, or after a charge the API never recorded. Only
   * "Thanh toán lại" on it, with the same key at the gateway, decides it.
   */
  findUndecided(ref: WorkspaceRef, tx: Tx): Promise<InvoiceRecord | null> {
    return this.invoices
      .findOne({ workspaceId: ref.workspaceId, status: 'open' })
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
            ...(change.card ? { card: change.card } : {}),
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
