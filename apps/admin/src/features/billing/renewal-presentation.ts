import type { BillingSummary, DueInvoice, PlanChangeQuote } from '@plp/contracts';
import { formatDate, formatVnd } from '../../lib/format';

type NoticeSummary = Pick<
  BillingSummary,
  'access' | 'awaitingTransfer' | 'dueInvoice' | 'graceEndsAt' | 'renewal'
>;

/**
 * What board 29 says of a renewal paid by bank transfer (ADR-035, T4), by what the summary holds:
 * - `awaiting`: the period ended unpaid; the invoice waits inside the grace ("Chờ chuyển khoản"),
 *   nothing failed and nothing is retried;
 * - `issued`: the early invoice of the next period waits for its transfer before the period ends;
 * - `paid`: the next period is paid and starts at its day with no charge.
 * Null when there is no such invoice.
 */
export type RenewalTransferNotice =
  | { kind: 'awaiting'; invoice: DueInvoice; deadline: string | null; readOnly: boolean }
  | { kind: 'issued'; invoice: DueInvoice; dueAt: string; cardFallback: boolean }
  | { kind: 'paid'; invoice: DueInvoice | null; startsAt: string; planName: string };

export type AwaitingTransferNotice = Extract<RenewalTransferNotice, { kind: 'awaiting' }>;

function waitsForTransfer(invoice: DueInvoice | null): invoice is DueInvoice {
  return invoice !== null && invoice.status === 'pending' && invoice.method === 'transfer';
}

export function renewalTransferNotice(summary: NoticeSummary): RenewalTransferNotice | null {
  const due = summary.dueInvoice;
  if (summary.awaitingTransfer && waitsForTransfer(due)) {
    return {
      kind: 'awaiting',
      invoice: due,
      deadline: summary.graceEndsAt,
      readOnly: summary.access === 'read_only',
    };
  }
  const renewal = summary.renewal;
  if (renewal === null) {
    return null;
  }
  if (renewal.paid) {
    return {
      kind: 'paid',
      invoice: renewal.invoice,
      startsAt: renewal.at,
      planName: renewal.planName,
    };
  }
  if (waitsForTransfer(renewal.invoice)) {
    return {
      kind: 'issued',
      invoice: renewal.invoice,
      dueAt: renewal.at,
      // Switched back to the card meanwhile: the end charges the saved card for this very invoice.
      cardFallback: renewal.method === 'card',
    };
  }
  return null;
}

/** "Hóa đơn gia hạn HD-… · 599.000 ₫ · chuyển khoản trước 01/12/2026". */
export function renewalInvoiceTitle(invoice: DueInvoice, dueAt: string): string {
  return `Hóa đơn gia hạn ${invoice.number} · ${formatVnd(invoice.amount)} · chuyển khoản trước ${formatDate(dueAt)}`;
}

/**
 * What the next period's invoice means for the owner, under "Gia hạn bằng" (board 29): when it is
 * sent, or that it is paid already. Null when nothing renews.
 */
export function renewalMethodStatus(renewal: BillingSummary['renewal']): string | null {
  if (renewal === null) {
    return null;
  }
  if (renewal.paid) {
    return `Kỳ sau (Gói ${renewal.planName}) đã thanh toán, bắt đầu ${formatDate(renewal.at)}.`;
  }
  if (renewal.invoice !== null && renewal.invoice.status === 'pending') {
    return renewal.method === 'transfer'
      ? `Hóa đơn ${renewal.invoice.number} đã gửi, chuyển khoản trước ${formatDate(renewal.at)}.`
      : `Hóa đơn ${renewal.invoice.number} đã gửi bằng chuyển khoản. Tới ${formatDate(renewal.at)} chưa nhận được tiền, hệ thống trừ thẻ đã lưu cho hóa đơn này.`;
  }
  if (renewal.method === 'transfer' && renewal.invoiceAt !== null) {
    return `Hóa đơn kỳ sau (${formatVnd(renewal.amount)}) được gửi ${formatDate(renewal.invoiceAt)}, hạn chuyển khoản ${formatDate(renewal.at)}.`;
  }
  return null;
}

/**
 * The warning a plan change, a cancellation or a scheduled change carries when it voids the early
 * renewal invoice of a bank transfer (T4). `replaced`: another invoice follows at once (the plan
 * still renews by transfer). `whenPaid`: an upgrade voids it only once its card payment went
 * through; refused or dismissed, the invoice and its details stay valid.
 */
export function voidedInvoiceNotice(
  voided: NonNullable<PlanChangeQuote['renewalInvoiceVoided']>,
  replaced: boolean,
  whenPaid = false,
): string {
  const lead = `${whenPaid ? 'Khi thanh toán xong, thông tin' : 'Thông tin'} chuyển khoản của hóa đơn ${voided.invoiceNumber} không còn dùng được`;
  if (replaced) {
    return `${lead}; hóa đơn mới sẽ được gửi.`;
  }
  return whenPaid ? `${lead}.` : `${lead}. Đừng chuyển khoản cho hóa đơn đó.`;
}

/**
 * The early invoice an owner's cancellation would void: the renewal invoice still waiting for its
 * transfer (the API voids it with the cancellation, T4).
 */
export function pendingRenewalInvoice(
  summary: Pick<BillingSummary, 'renewal'>,
): NonNullable<PlanChangeQuote['renewalInvoiceVoided']> | null {
  const invoice = summary.renewal?.invoice ?? null;
  return invoice !== null && invoice.status === 'pending' && !summary.renewal?.paid
    ? { invoiceId: invoice.id, invoiceNumber: invoice.number }
    : null;
}

/**
 * What a toast adds after a change that voided or issued the early renewal invoice (T4), by the
 * summary before it (null when unknown) and the one the API answered. Starts with a space; empty
 * when no early invoice was involved.
 */
export function replacedInvoiceNote(
  before: Pick<BillingSummary, 'renewal'> | null,
  after: Pick<BillingSummary, 'renewal'>,
): string {
  const was = before === null ? null : pendingRenewalInvoice(before);
  const now = pendingRenewalInvoice(after);
  if (now !== null && was !== null && now.invoiceId !== was.invoiceId) {
    return ` Hóa đơn ${was.invoiceNumber} không còn dùng được; hóa đơn chuyển khoản mới ${now.invoiceNumber} đã được gửi.`;
  }
  if (now !== null && was === null) {
    return ` Hóa đơn chuyển khoản ${now.invoiceNumber} đã được gửi.`;
  }
  if (now === null && was !== null) {
    return ` ${voidedInvoiceNotice(was, false)}`;
  }
  return '';
}
