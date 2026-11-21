import {
  type BillingInfo,
  invoiceStatusLabels,
  type InvoicePaymentMethod,
  type InvoiceStatus,
  type InvoiceSummary,
  type PaymentMethodView,
} from '@plp/contracts';
import type { BadgeTone } from '@plp/ui';
import { formatDate, formatVnd } from '../../lib/format';

/**
 * Invoices per page of "Lịch sử giao dịch" ("Xem thêm" loads the next). It lives here, not in
 * `queries.ts`: that file is a client module, and the server page reads it too.
 */
export const INVOICE_PAGE_SIZE = 10;

const BRAND_NAMES: Readonly<Record<string, string>> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  jcb: 'JCB',
};

/** "Visa": the card network, capitalised when it is not one of the known. */
export function brandName(brand: string): string {
  return BRAND_NAMES[brand.toLowerCase()] ?? brand.charAt(0).toUpperCase() + brand.slice(1);
}

/** "Thẻ Visa •••• 4242" (board 29 "Thẻ quốc tế •••• 6411"). */
export function cardLabel(card: Pick<PaymentMethodView, 'brand' | 'last4'>): string {
  return `Thẻ ${brandName(card.brand)} •••• ${card.last4}`;
}

/** Whether two cards are the same as far as the owner sees them: brand and last four digits. */
export function sameCard(
  a: Pick<PaymentMethodView, 'brand' | 'last4'>,
  b: Pick<PaymentMethodView, 'brand' | 'last4'>,
): boolean {
  return a.brand === b.brand && a.last4 === b.last4;
}

/** "Hết hạn 08/2028", or "Đã hết hạn 08/2026" for a card that cannot be charged. */
export function cardExpiryNote(card: PaymentMethodView): { text: string; danger: boolean } {
  const date = `${String(card.expMonth).padStart(2, '0')}/${card.expYear}`;
  return card.expired
    ? { text: `Đã hết hạn ${date}. Đổi thẻ để thanh toán.`, danger: true }
    : { text: `Hết hạn ${date}`, danger: false };
}

const STATUS_TONES: Record<InvoiceStatus, BadgeTone> = {
  paid: 'success',
  failed: 'danger',
  pending: 'warning',
  open: 'warning',
  void: 'neutral',
};

/** A transfer that waits for the bank says so ("Chờ xác nhận"); any other `pending` is the gateway. */
export function invoiceStatusView(
  status: InvoiceStatus,
  method: InvoicePaymentMethod = 'card',
): { label: string; tone: BadgeTone } {
  if (status === 'pending' && method === 'transfer') {
    return { label: 'Đang chờ xác nhận', tone: 'warning' };
  }
  return { label: invoiceStatusLabels[status], tone: STATUS_TONES[status] };
}

/** "Gói Agency · kỳ 01/11 – 30/11", or the rest of a period paid for an upgrade. */
export function invoiceDescription(
  invoice: Pick<InvoiceSummary, 'kind' | 'planName' | 'periodStart' | 'periodEnd'>,
): string {
  const period = `kỳ ${formatDate(invoice.periodStart)} – ${formatDate(invoice.periodEnd)}`;
  return invoice.kind === 'upgrade'
    ? `Nâng cấp lên Gói ${invoice.planName} · ${period}`
    : `Gói ${invoice.planName} · ${period}`;
}

/** The invoice's number with how it was paid: "HD-2026-000012 · Thẻ Visa •••• 4242". */
export function invoiceReference(
  invoice: Pick<InvoiceSummary, 'number' | 'method' | 'card'>,
): string {
  const method =
    invoice.method === 'transfer'
      ? 'Chuyển khoản'
      : invoice.card === null
        ? 'Thẻ'
        : cardLabel(invoice.card);
  return `${invoice.number} · ${method}`;
}

/** The date column: when it was paid, otherwise when it was made. */
export function invoiceDate(invoice: Pick<InvoiceSummary, 'paidAt' | 'createdAt'>): string {
  return formatDate(invoice.paidAt ?? invoice.createdAt);
}

export function invoiceAmount(invoice: Pick<InvoiceSummary, 'amount'>): string {
  return formatVnd(invoice.amount);
}

/**
 * The message under the tax code field: the board counts the digits ("Hiện có 9") when the value
 * is only short or long; any other message is the contract's.
 */
export function taxCodeMessage(value: string, message: string | undefined): string | undefined {
  if (message === undefined) {
    return undefined;
  }
  const compact = value.replace(/[\s-]/g, '');
  if (/^\d*$/.test(compact) && compact.length !== 10 && compact.length !== 13) {
    return `Mã số thuế gồm 10 hoặc 13 chữ số. Hiện có ${compact.length}.`;
  }
  return message;
}

/** The billing info as text inputs; an empty form before it has ever been filled. */
export function billingInfoValues(info: BillingInfo | null): Record<keyof BillingInfo, string> {
  return {
    companyName: info?.companyName ?? '',
    taxCode: info?.taxCode ?? '',
    address: info?.address ?? '',
    email: info?.email ?? '',
  };
}
