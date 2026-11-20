import {
  type GatewayUnavailableProblemContext,
  type PaymentDeclineCode,
  paymentDeclineLabels,
  type PaymentFailedProblemContext,
  type PlanChangeQuote,
  type QuoteChangedProblemContext,
} from '@plp/contracts';
import { AppError } from '../../shared/errors.js';

/*
 * The problems of payments (ADR-035, T2). A refused charge is 402, like the plan's limits, but
 * with its own code: the admin shows the gateway's reason and "Đổi thẻ", never "Nâng cấp".
 */

type InvoiceRef = { _id: { toHexString(): string }; number: string };

/** 503 `payments_disabled`: `PAYMENT_PROVIDER=none`. */
export function paymentsDisabled(): AppError {
  return new AppError(503, 'payments_disabled', 'Thanh toán chưa được bật', {
    detail: 'Hệ thống chưa nối cổng thanh toán. Gói hiện tại vẫn giữ nguyên.',
  });
}

/** 422 `payment_method_required`: the change charges, and no card that can pay is saved. */
export function paymentMethodRequired(expired: boolean): AppError {
  return new AppError(
    422,
    'payment_method_required',
    expired ? 'Thẻ đã lưu đã hết hạn' : 'Cần thêm thẻ thanh toán',
    { detail: 'Thêm thẻ ở "Thanh toán & hóa đơn" rồi thử lại.' },
  );
}

/** 402 `payment_failed`: the gateway refused the charge; nothing changed but the invoice. */
export function paymentFailed(invoice: InvoiceRef, code: PaymentDeclineCode): AppError {
  return new AppError(402, 'payment_failed', 'Thanh toán không thành công', {
    detail: `${paymentDeclineLabels[code]}. Gói hiện tại vẫn giữ nguyên. Đổi thẻ rồi thử lại.`,
    context: {
      invoiceId: invoice._id.toHexString(),
      invoiceNumber: invoice.number,
      code,
    } satisfies PaymentFailedProblemContext,
  });
}

/**
 * 503 `gateway_unavailable`: the gateway did not answer, so it may have charged. "Thanh toán lại"
 * asks it again with the same idempotency key, which never charges twice.
 */
export function gatewayUnavailable(invoice: InvoiceRef, cause: unknown): AppError {
  return new AppError(503, 'gateway_unavailable', 'Chưa rõ kết quả thanh toán', {
    detail: `Cổng thanh toán chưa trả lời. Bấm "Thanh toán lại" ở hóa đơn ${invoice.number} để biết kết quả; tiền không bị trừ hai lần.`,
    context: {
      invoiceId: invoice._id.toHexString(),
      invoiceNumber: invoice.number,
    } satisfies GatewayUnavailableProblemContext,
    cause,
  });
}

/** 409 `payment_in_progress`: another charge of the workspace is still being decided. */
export function paymentInProgress(): AppError {
  return new AppError(409, 'payment_in_progress', 'Đang có một thanh toán chưa xong', {
    detail: 'Chờ thanh toán đó có kết quả rồi thử lại.',
  });
}

/** 409 `quote_changed`: the change no longer charges what the owner confirmed. */
export function quoteChanged(quote: PlanChangeQuote): AppError {
  return new AppError(409, 'quote_changed', 'Số tiền vừa thay đổi', {
    detail: 'Xem lại số tiền mới rồi xác nhận.',
    context: { quote } satisfies QuoteChangedProblemContext,
  });
}

/** 409 `invoice_not_payable`: paid, void, being decided, or what it paid for no longer applies. */
export function invoiceNotPayable(): AppError {
  return new AppError(409, 'invoice_not_payable', 'Không thanh toán được hóa đơn này', {
    detail:
      'Hóa đơn đã được thanh toán, đã hủy, đang chờ cổng thanh toán, hoặc gói đã đổi từ khi hóa đơn được tạo. Chọn lại gói để có số tiền mới.',
  });
}

/** 409 `conflict`: the subscription changed since it was read. */
export function subscriptionChanged(): AppError {
  return new AppError(409, 'conflict', 'Gói vừa thay đổi', {
    detail: 'Tải lại trang để xem gói hiện tại rồi chọn lại.',
  });
}
