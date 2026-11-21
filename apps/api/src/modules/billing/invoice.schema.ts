import {
  type BillingCycle,
  billingCycles,
  chargeOutcomes,
  type ChargeOutcome,
  invoiceKinds,
  type InvoiceKind,
  invoicePaymentMethods,
  type InvoicePaymentMethod,
  invoiceStatuses,
  type InvoiceStatus,
  paymentDeclineCodes,
  type PaymentDeclineCode,
} from '@plp/contracts';
import { Schema, type Types } from 'mongoose';

export const INVOICE_MODEL = 'Invoice';
export const INVOICE_COUNTER_MODEL = 'InvoiceCounter';

/** One charge of an invoice; its idempotency key at the gateway is `{invoiceId}-{number}`. */
export interface InvoiceAttemptRecord {
  number: number;
  at: Date;
  outcome: ChargeOutcome;
  code: PaymentDeclineCode | null;
  /** The `Idempotency-Key` of the "Thanh toán lại" request that made it; null otherwise. */
  requestKey: string | null;
}

export interface InvoicePlanChoice {
  planId: string;
  cycle: BillingCycle;
}

/** "Chuyển khoản" (T3): what the gateway gave for the transfer, and when it started. */
export interface InvoiceTransferRecord {
  bankName: string;
  accountNumber: string;
  accountName: string;
  content: string;
  /** What the QR code encodes; null when the gateway gives none. */
  qrPayload: string | null;
  /** The gateway's page for the transfer (the fake gateway's confirmation page); usually null. */
  pageUrl: string | null;
  startedAt: Date;
}

/**
 * An invoice in the master DB (ADR-035): payment records outlive the workspace's data, and the
 * gateway's events find it by its id. It is written only through `InvoicesRepository`, which
 * never changes a paid or void one.
 */
export interface InvoiceRecord {
  _id: Types.ObjectId;
  /** `HD-{năm}-{6 chữ số}`, from `invoice_counters`. */
  number: string;
  workspaceId: Types.ObjectId;
  kind: InvoiceKind;
  planId: string;
  /** The plan's name when the invoice was made, as the receipt shows it. */
  planName: string;
  cycle: BillingCycle;
  periodStart: Date;
  periodEnd: Date;
  /** In đồng, VAT included. */
  amount: number;
  /** "Thông tin xuất hóa đơn" as it was when the invoice was made. */
  billingInfo: { companyName: string; taxCode: string; address: string; email: string } | null;
  method: InvoicePaymentMethod;
  /** The card of the last charge: what the owner sees of it, never the token. */
  card: { brand: string; last4: string } | null;
  status: InvoiceStatus;
  attempts: InvoiceAttemptRecord[];
  /**
   * The plan a change paid now moves from (or a canceled plan paid for again); null for the job's
   * charge at the end of a trial or period (T3).
   */
  from: InvoicePlanChoice | null;
  /** Paying it ends the trial and starts the first paid period. */
  endsTrial: boolean;
  /** The bank transfer it waits for or was paid by (T3); null for a card. */
  transfer: InvoiceTransferRecord | null;
  /** The member who chose the change; null for the subscription's own jobs (T3). */
  createdBy: Types.ObjectId | null;
  paidAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const choiceSchema = new Schema<InvoicePlanChoice>(
  {
    planId: { type: String, required: true },
    cycle: { type: String, enum: billingCycles, required: true },
  },
  { _id: false },
);

const attemptSchema = new Schema<InvoiceAttemptRecord>(
  {
    number: { type: Number, required: true, min: 1 },
    at: { type: Date, required: true },
    outcome: { type: String, enum: chargeOutcomes, required: true },
    code: { type: String, enum: [...paymentDeclineCodes, null], default: null },
    requestKey: { type: String, default: null },
  },
  { _id: false },
);

const invoiceBillingInfoSchema = new Schema(
  {
    companyName: { type: String, required: true },
    taxCode: { type: String, required: true },
    address: { type: String, required: true },
    email: { type: String, required: true },
  },
  { _id: false },
);

const transferSchema = new Schema<InvoiceTransferRecord>(
  {
    bankName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    accountName: { type: String, required: true },
    content: { type: String, required: true },
    qrPayload: { type: String, default: null },
    pageUrl: { type: String, default: null },
    startedAt: { type: Date, required: true },
  },
  { _id: false },
);

const cardSchema = new Schema(
  {
    brand: { type: String, required: true },
    last4: { type: String, required: true },
  },
  { _id: false },
);

export const invoiceSchema = new Schema<InvoiceRecord>(
  {
    number: { type: String, required: true },
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: invoiceKinds, required: true },
    planId: { type: String, required: true },
    planName: { type: String, required: true },
    cycle: { type: String, enum: billingCycles, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    billingInfo: { type: invoiceBillingInfoSchema, default: null },
    method: { type: String, enum: invoicePaymentMethods, required: true },
    card: { type: cardSchema, default: null },
    status: { type: String, enum: invoiceStatuses, required: true },
    attempts: { type: [attemptSchema], default: [] },
    from: { type: choiceSchema, default: null },
    endsTrial: { type: Boolean, required: true },
    transfer: { type: transferSchema, default: null },
    createdBy: { type: Schema.Types.ObjectId, default: null },
    paidAt: { type: Date, default: null },
    voidedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'invoices', versionKey: false },
);
invoiceSchema.index({ number: 1 }, { unique: true });
// "Lịch sử giao dịch", newest first.
invoiceSchema.index({ workspaceId: 1, createdAt: -1, _id: -1 });
// A charge being decided blocks another; a new change voids the unpaid ones it replaces.
invoiceSchema.index({ workspaceId: 1, status: 1 });

/** `invoice_counters`: the last number given in a year, `_id` "HD-2026". */
export interface InvoiceCounterRecord {
  _id: string;
  seq: number;
}

export const invoiceCounterSchema = new Schema<InvoiceCounterRecord>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, min: 0 },
  },
  { collection: 'invoice_counters', versionKey: false },
);
