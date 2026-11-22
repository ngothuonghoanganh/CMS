import {
  gatewayUnavailableProblemContextSchema,
  invoiceProblemContextSchema,
  type PaymentDeclineCode,
  paymentDeclineLabels,
  paymentFailedProblemContextSchema,
  type PlanChangeQuote,
  type PlanChangeUnavailableReason,
  planChangeUnavailableProblemContextSchema,
  quoteChangedProblemContextSchema,
} from '@plp/contracts';
import { ApiError } from '../../lib/api-core';
import { problemMessage } from '../shell/problem-message';

/**
 * What stopped a payment (ADR-035, T2). A 402 `payment_failed` is the gateway refusing the card:
 * it is not a plan problem and never says "Nâng cấp" (`planProblemOf` ignores it).
 */
export type PaymentProblem =
  | { kind: 'declined'; code: PaymentDeclineCode | null; invoiceNumber: string | null }
  | { kind: 'unknown_outcome'; invoiceNumber: string | null }
  /**
   * Another charge is under way; or, with its number, an earlier charge's outcome is unknown, or
   * (`transfer`) that invoice waits for a bank transfer (T3).
   */
  | { kind: 'in_progress'; invoiceNumber: string | null; transfer: boolean }
  | { kind: 'card_required' }
  | { kind: 'disabled' }
  | { kind: 'not_payable' }
  | { kind: 'quote_changed'; quote: PlanChangeQuote | null }
  | { kind: 'unavailable'; reason: PlanChangeUnavailableReason | null };

export function paymentProblemOf(error: unknown): PaymentProblem | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  const context = error.problem.context;
  switch (error.code) {
    case 'payment_failed': {
      const parsed = paymentFailedProblemContextSchema.safeParse(context);
      return {
        kind: 'declined',
        code: parsed.success ? parsed.data.code : null,
        invoiceNumber: parsed.success ? parsed.data.invoiceNumber : null,
      };
    }
    case 'gateway_unavailable': {
      const parsed = gatewayUnavailableProblemContextSchema.safeParse(context);
      return {
        kind: 'unknown_outcome',
        invoiceNumber: parsed.success ? parsed.data.invoiceNumber : null,
      };
    }
    case 'payment_in_progress': {
      const parsed = invoiceProblemContextSchema.safeParse(context);
      return {
        kind: 'in_progress',
        invoiceNumber: parsed.success ? parsed.data.invoiceNumber : null,
        transfer: parsed.success && parsed.data.awaiting === 'transfer',
      };
    }
    case 'payment_method_required':
      return { kind: 'card_required' };
    case 'payments_disabled':
      return { kind: 'disabled' };
    case 'invoice_not_payable':
      return { kind: 'not_payable' };
    case 'quote_changed': {
      const parsed = quoteChangedProblemContextSchema.safeParse(context);
      return { kind: 'quote_changed', quote: parsed.success ? parsed.data.quote : null };
    }
    case 'plan_change_unavailable': {
      const parsed = planChangeUnavailableProblemContextSchema.safeParse(context);
      return { kind: 'unavailable', reason: parsed.success ? parsed.data.reason : null };
    }
    default:
      return null;
  }
}

/** Why a plan cannot change now, as the dialog and the API's problem both say it. */
export const unavailableReasonText: Record<PlanChangeUnavailableReason, string> = {
  payment_required: 'Thời gian dùng thử đã hết. Chọn "Thanh toán ngay" để dùng tiếp gói bạn chọn.',
  unpaid: 'Kỳ hiện tại chưa được thanh toán. Thanh toán kỳ này trước khi đổi gói.',
  next_period_paid:
    'Kỳ sau đã được thanh toán cho gói hiện tại. Bạn đổi được gói từ ngày kỳ đó bắt đầu.',
};

/**
 * What was refused: a plan change (`plan`, the default), after which the owner chooses the plan
 * again, or "Thanh toán lại" of an invoice (`invoice`, a plan's or a marketplace item's), which
 * they try again.
 */
export type PaymentSubject = 'plan' | 'invoice';

/** The sentence a payment problem shows; null for a problem that is not about payments. */
export function paymentProblemText(
  problem: PaymentProblem,
  subject: PaymentSubject = 'plan',
): string {
  switch (problem.kind) {
    case 'declined': {
      const why =
        problem.code === null ? 'Thanh toán không thành công' : paymentDeclineLabels[problem.code];
      const invoice =
        problem.invoiceNumber === null
          ? ''
          : ` Hóa đơn ${problem.invoiceNumber} chưa được thanh toán.`;
      return `${why}.${invoice}`;
    }
    case 'unknown_outcome':
      return `Chưa biết kết quả thanh toán${problem.invoiceNumber === null ? '' : ` hóa đơn ${problem.invoiceNumber}`}: cổng thanh toán chưa trả lời. Xem lịch sử giao dịch trước khi thử lại.`;
    case 'in_progress':
      if (problem.invoiceNumber === null) {
        return 'Một khoản thanh toán của workspace đang được xử lý. Chờ kết quả rồi thử lại.';
      }
      // A transfer may be on its way: paying again now could pay the period twice.
      if (problem.transfer) {
        return `Hóa đơn ${problem.invoiceNumber} đang chờ chuyển khoản. Chờ xác nhận, hoặc thanh toán hóa đơn đó bằng thẻ ở "Thanh toán & hóa đơn".`;
      }
      // Paying an invoice again waits for a charge being decided (`pending`) or undecided: its row
      // in the history says which, with its own "Thanh toán lại" when asking again decides it.
      return subject === 'invoice'
        ? `Hóa đơn ${problem.invoiceNumber} chưa có kết quả. Xem nó trong lịch sử giao dịch rồi thử lại.`
        : `Chưa biết kết quả thanh toán hóa đơn ${problem.invoiceNumber}. Bấm "Thanh toán lại" ở hóa đơn đó trong lịch sử giao dịch để biết kết quả, rồi chọn lại gói.`;
    case 'card_required':
      return 'Chưa có thẻ dùng được. Thêm thẻ rồi thử lại.';
    case 'disabled':
      return 'Thanh toán chưa được bật trên hệ thống này.';
    case 'not_payable':
      return 'Hóa đơn này không còn thanh toán được nữa.';
    case 'quote_changed':
      return 'Số tiền đã thay đổi. Xem lại số tiền mới rồi xác nhận.';
    case 'unavailable':
      return problem.reason === null
        ? 'Chưa đổi được gói lúc này.'
        : unavailableReasonText[problem.reason];
  }
}

/** "Hủy gói", "Giữ lại gói" and "Hủy thay đổi" of board 28 (T3). */
export type PlanAction = 'cancel' | 'keep' | 'drop_schedule';

/** Why each of them is refused: the change dialog's words are about choosing a plan. */
const ACTION_UNAVAILABLE_TEXT: Record<PlanAction, Record<PlanChangeUnavailableReason, string>> = {
  cancel: {
    unpaid: 'Kỳ hiện tại chưa được thanh toán. Thanh toán kỳ này trước khi hủy gói.',
    payment_required: 'Gói đã dừng nên không cần hủy. Chọn gói mới khi muốn dùng tiếp.',
    next_period_paid: 'Kỳ sau đã được thanh toán. Bạn hủy được gói từ ngày kỳ đó bắt đầu.',
  },
  keep: {
    unpaid: 'Kỳ hiện tại chưa được thanh toán. Thanh toán kỳ này để dùng tiếp gói.',
    payment_required: 'Gói đã dừng. Chọn gói mới để dùng tiếp.',
    next_period_paid: 'Kỳ sau đã được thanh toán, gói tiếp tục bình thường.',
  },
  drop_schedule: {
    unpaid:
      'Kỳ này chưa được thanh toán, và hóa đơn gia hạn đã tính theo gói đã lên lịch. Thanh toán hóa đơn đó trước.',
    payment_required: 'Gói đã dừng. Chọn gói mới để dùng tiếp.',
    next_period_paid:
      'Kỳ sau đã được thanh toán theo gói đã lên lịch, nên lịch đó không bỏ được nữa.',
  },
};

/** What a refused "Hủy gói", "Giữ lại gói" or "Hủy thay đổi" says, in words for that action. */
export function planActionMessage(error: unknown, action: PlanAction): string {
  const problem = paymentProblemOf(error);
  if (problem?.kind === 'unavailable' && problem.reason !== null) {
    return ACTION_UNAVAILABLE_TEXT[action][problem.reason];
  }
  return paymentsMessage(error);
}

/** What a failed payments request says: a 403 is the role (Quản trị views the plan, not payments). */
export function paymentsMessage(error: unknown, subject: PaymentSubject = 'plan'): string {
  if (error instanceof ApiError && error.status === 403) {
    return 'Chỉ Chủ sở hữu xem được thanh toán';
  }
  const problem = paymentProblemOf(error);
  return problem === null ? problemMessage(error) : paymentProblemText(problem, subject);
}
