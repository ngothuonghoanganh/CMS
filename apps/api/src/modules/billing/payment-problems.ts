import {
  type GatewayUnavailableProblemContext,
  type IdempotencyKeyReusedProblemContext,
  type InvoiceKind,
  type InvoiceProblemContext,
  type PaymentDeclineCode,
  paymentDeclineLabels,
  type PaymentFailedProblemContext,
  type PlanChangeQuote,
  type QuoteChangedProblemContext,
} from '@plp/contracts';
import { AppError } from '../../shared/errors.js';

/*
 * The problems of payments (ADR-035, T2). A refused charge is 402, like the plan's limits, but
 * with its own code: the admin shows the gateway's reason and "Đổi thẻ", never "Nâng cấp". The
 * purchase of a marketplace item (ADR-036) has the same codes, and texts about the item instead of
 * the plan.
 */

type InvoiceRef = { _id: { toHexString(): string }; number: string; kind?: InvoiceKind };

function forItem(invoice: InvoiceRef | undefined): boolean {
  return invoice?.kind === 'marketplace';
}

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
    detail: forItem(invoice)
      ? `${paymentDeclineLabels[code]}. Bạn chưa bị trừ tiền và chưa sở hữu mẫu. Đổi phương thức rồi thử lại.`
      : `${paymentDeclineLabels[code]}. Gói hiện tại vẫn giữ nguyên. Đổi thẻ rồi thử lại.`,
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
    detail: forItem(invoice)
      ? `Cổng thanh toán chưa trả lời. Đừng mua lại: bấm "Thanh toán lại" ở hóa đơn ${invoice.number} (Thanh toán & hóa đơn) để hỏi lại cổng; tiền không bị trừ hai lần.`
      : `Cổng thanh toán chưa trả lời. Bấm "Thanh toán lại" ở hóa đơn ${invoice.number} để biết kết quả; tiền không bị trừ hai lần.`,
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

/**
 * 409 `payment_in_progress` with the invoice whose charge the gateway is still deciding (`pending`):
 * its event settles it, then another charge may start.
 */
export function paymentPending(invoice: InvoiceRef): AppError {
  return new AppError(409, 'payment_in_progress', 'Đang có một thanh toán chưa xong', {
    detail: `Cổng thanh toán đang xác nhận hóa đơn ${invoice.number}. Chờ kết quả rồi thử lại.`,
    context: {
      invoiceId: invoice._id.toHexString(),
      invoiceNumber: invoice.number,
    } satisfies InvoiceProblemContext,
  });
}

/**
 * 409 `payment_in_progress` with the invoice: an earlier charge's outcome is unknown, so it may have
 * gone through. A new change would make a second charge; "Thanh toán lại" on that invoice asks
 * the gateway about the first one with the same key, which never charges twice (ADR-035).
 */
export function paymentUndecided(
  invoice: InvoiceRef,
  blocked: 'plan_change' | 'purchase' = 'plan_change',
): AppError {
  const then = blocked === 'purchase' ? 'mua mẫu' : 'chọn lại gói';
  return new AppError(409, 'payment_in_progress', 'Chưa rõ kết quả một thanh toán', {
    detail: `Chưa rõ hóa đơn ${invoice.number} đã được thanh toán hay chưa. Bấm "Thanh toán lại" ở hóa đơn đó để biết kết quả rồi ${then}; tiền không bị trừ hai lần.`,
    context: {
      invoiceId: invoice._id.toHexString(),
      invoiceNumber: invoice.number,
    } satisfies InvoiceProblemContext,
  });
}

/**
 * 409 `payment_in_progress` with the invoice (T3): it waits for a bank transfer, which may be on
 * its way. Another payment now could pay the period twice; the owner waits for the transfer, or
 * pays that invoice by card instead on board 29.
 */
export function paymentAwaitingTransfer(invoice: InvoiceRef): AppError {
  return new AppError(409, 'payment_in_progress', 'Một hóa đơn đang chờ chuyển khoản', {
    detail: `Hóa đơn ${invoice.number} đang chờ chuyển khoản. Chờ xác nhận, hoặc thanh toán hóa đơn đó bằng thẻ ở "Thanh toán & hóa đơn".`,
    context: {
      invoiceId: invoice._id.toHexString(),
      invoiceNumber: invoice.number,
      awaiting: 'transfer',
    } satisfies InvoiceProblemContext,
  });
}

/**
 * 409 `payment_not_applied`: the gateway took the payment of an invoice that was decided while it
 * answered, so nothing changed. The payment is reported for a refund outside the system (ADR-035).
 */
export function paymentNotApplied(invoice: InvoiceRef): AppError {
  return new AppError(409, 'payment_not_applied', 'Thanh toán chưa được áp dụng', {
    detail: forItem(invoice)
      ? `Cổng thanh toán đã trừ tiền cho hóa đơn ${invoice.number}, nhưng workspace đã sở hữu mẫu này trước đó nên lần mua không được áp dụng. Khoản tiền này sẽ được hoàn lại.`
      : `Cổng thanh toán đã trừ tiền cho hóa đơn ${invoice.number}, nhưng hóa đơn đã được xử lý trước đó nên gói không đổi. Khoản tiền này sẽ được hoàn lại.`,
    context: {
      invoiceId: invoice._id.toHexString(),
      invoiceNumber: invoice.number,
    } satisfies InvoiceProblemContext,
  });
}

/** 409 `quote_changed`: the change no longer charges what the owner confirmed. */
export function quoteChanged(quote: PlanChangeQuote): AppError {
  return new AppError(409, 'quote_changed', 'Số tiền vừa thay đổi', {
    detail: 'Xem lại số tiền mới rồi xác nhận.',
    context: { quote } satisfies QuoteChangedProblemContext,
  });
}

/**
 * 409 `invoice_not_payable`: paid, void, being decided, or what it paid for no longer applies (the
 * plan moved on; the workspace holds the marketplace item, or it changed price or left the sale).
 */
export function invoiceNotPayable(invoice?: InvoiceRef): AppError {
  return new AppError(409, 'invoice_not_payable', 'Không thanh toán được hóa đơn này', {
    detail: forItem(invoice)
      ? 'Hóa đơn đã được thanh toán, đã hủy, đang chờ cổng thanh toán, hoặc workspace đã sở hữu mẫu, mẫu đã đổi giá hay ngừng bán. Mở mẫu ở Marketplace để xem giá hiện tại.'
      : 'Hóa đơn đã được thanh toán, đã hủy, đang chờ cổng thanh toán, hoặc gói đã đổi từ khi hóa đơn được tạo. Chọn lại gói để có số tiền mới.',
  });
}

/**
 * 409 `invoice_not_payable` for "Chuyển khoản" of a marketplace invoice (ADR-036): a marketplace
 * item is paid by card only, and its licence comes with the payment.
 */
export function purchaseNotByTransfer(): AppError {
  return new AppError(409, 'invoice_not_payable', 'Mẫu Marketplace chỉ thanh toán bằng thẻ', {
    detail: 'Bấm "Thanh toán lại" để trả hóa đơn này bằng thẻ đã lưu.',
  });
}

/**
 * 422 `idempotency_key_reused`: the purchase's `Idempotency-Key` made the purchase of another item
 * before (ADR-036). Each purchase sends a key of its own.
 */
export function idempotencyKeyReused(invoice: InvoiceRef): AppError {
  return new AppError(422, 'idempotency_key_reused', 'Idempotency-Key đã dùng cho lần mua khác', {
    detail: `Key này đã tạo hóa đơn ${invoice.number} cho một mẫu khác. Mỗi lần mua gửi một key mới.`,
    context: {
      invoiceId: invoice._id.toHexString(),
      invoiceNumber: invoice.number,
    } satisfies IdempotencyKeyReusedProblemContext,
  });
}

/** 409 `conflict`: the subscription changed since it was read. */
export function subscriptionChanged(): AppError {
  return new AppError(409, 'conflict', 'Gói vừa thay đổi', {
    detail: 'Tải lại trang để xem gói hiện tại rồi chọn lại.',
  });
}
