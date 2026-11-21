import type { ErrorCode } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/api-core';
import { planProblemOf } from './plan-problem';
import { paymentProblemOf, paymentsMessage, planActionMessage } from './payment-problem';

function problem(
  status: number,
  code: ErrorCode,
  context?: Record<string, unknown>,
  title = 'Lỗi',
) {
  return new ApiError(status, {
    type: 'about:blank',
    title,
    status,
    code,
    ...(context === undefined ? {} : { context }),
  });
}

describe('paymentProblemOf', () => {
  it('reads a refused charge: the reason and the invoice', () => {
    const error = problem(402, 'payment_failed', {
      invoiceId: '64b0000000000000000000b1',
      invoiceNumber: 'HD-2026-000001',
      code: 'card_declined',
    });

    const parsed = paymentProblemOf(error);

    expect(parsed).toEqual({
      kind: 'declined',
      code: 'card_declined',
      invoiceNumber: 'HD-2026-000001',
    });
    expect(paymentsMessage(error)).toBe(
      'Ngân hàng từ chối thẻ. Hóa đơn HD-2026-000001 chưa được thanh toán.',
    );
  });

  it('is not a plan problem: a refused card never says "Nâng cấp"', () => {
    expect(planProblemOf(problem(402, 'payment_failed'))).toBeNull();
  });

  it('still answers when the context is missing', () => {
    expect(paymentProblemOf(problem(402, 'payment_failed'))).toEqual({
      kind: 'declined',
      code: null,
      invoiceNumber: null,
    });
    expect(paymentsMessage(problem(402, 'payment_failed'))).toBe('Thanh toán không thành công.');
  });

  it('tells an unknown outcome from a refusal', () => {
    const error = problem(503, 'gateway_unavailable', {
      invoiceId: '64b0000000000000000000b1',
      invoiceNumber: 'HD-2026-000001',
    });

    expect(paymentsMessage(error)).toContain('Chưa biết kết quả thanh toán hóa đơn HD-2026-000001');
  });

  it('points to the invoice whose unknown outcome blocks a new charge', () => {
    const blocked = problem(409, 'payment_in_progress', {
      invoiceId: '64b0000000000000000000b1',
      invoiceNumber: 'HD-2026-000001',
    });

    expect(paymentProblemOf(blocked)).toEqual({
      kind: 'in_progress',
      invoiceNumber: 'HD-2026-000001',
      transfer: false,
    });
    expect(paymentsMessage(blocked)).toBe(
      'Chưa biết kết quả thanh toán hóa đơn HD-2026-000001. Bấm "Thanh toán lại" ở hóa đơn đó trong lịch sử giao dịch để biết kết quả, rồi chọn lại gói.',
    );
    expect(paymentsMessage(problem(409, 'payment_in_progress'))).toBe(
      'Một khoản thanh toán của workspace đang được xử lý. Chờ kết quả rồi thử lại.',
    );
  });

  it('tells "Thanh toán lại" blocked by another invoice to try again, not to choose a plan', () => {
    // A refused marketplace purchase paid again waits for a charge still being decided (ADR-036).
    const blocked = problem(409, 'payment_in_progress', {
      invoiceId: '64b0000000000000000000b1',
      invoiceNumber: 'HD-2026-000001',
    });

    const text = paymentsMessage(blocked, 'invoice');
    expect(text).toBe(
      'Hóa đơn HD-2026-000001 chưa có kết quả. Xem nó trong lịch sử giao dịch rồi thử lại.',
    );
    expect(text).not.toContain('gói');
    expect(paymentsMessage(problem(409, 'payment_in_progress'), 'invoice')).toBe(
      'Một khoản thanh toán của workspace đang được xử lý. Chờ kết quả rồi thử lại.',
    );
  });

  it('tells an invoice waiting for a transfer from one whose charge is unknown (T3)', () => {
    const waiting = problem(409, 'payment_in_progress', {
      invoiceId: '64b0000000000000000000b1',
      invoiceNumber: 'HD-2026-000001',
      awaiting: 'transfer',
    });

    expect(paymentProblemOf(waiting)).toMatchObject({ kind: 'in_progress', transfer: true });
    const text = paymentsMessage(waiting);
    expect(text).toBe(
      'Hóa đơn HD-2026-000001 đang chờ chuyển khoản. Chờ xác nhận, hoặc thanh toán hóa đơn đó bằng thẻ ở "Thanh toán & hóa đơn".',
    );
    expect(text).not.toContain('Chưa biết kết quả');
  });

  it('carries the quote of a changed amount', () => {
    const error = problem(409, 'quote_changed', { quote: { not: 'a quote' } });

    expect(paymentProblemOf(error)).toEqual({ kind: 'quote_changed', quote: null });
  });

  it('names each reason a plan cannot change', () => {
    expect(
      paymentsMessage(problem(409, 'plan_change_unavailable', { reason: 'unpaid' })),
    ).toContain('Kỳ hiện tại chưa được thanh toán');
  });

  it('ignores other errors', () => {
    expect(paymentProblemOf(problem(404, 'not_found'))).toBeNull();
    expect(paymentProblemOf(new Error('x'))).toBeNull();
  });
});

describe('paymentsMessage', () => {
  it('says that only the owner sees payments for a 403', () => {
    expect(paymentsMessage(problem(403, 'forbidden', undefined, 'Không có quyền'))).toBe(
      'Chỉ Chủ sở hữu xem được thanh toán',
    );
  });

  it('falls back to the problem text', () => {
    expect(paymentsMessage(problem(500, 'internal', undefined, 'Máy chủ lỗi'))).toBe('Máy chủ lỗi');
  });
});

describe('planActionMessage', () => {
  it('words a refusal for the action refused, not for changing the plan or a trial', () => {
    const unpaid = problem(409, 'plan_change_unavailable', { reason: 'unpaid' });
    const stopped = problem(409, 'plan_change_unavailable', { reason: 'payment_required' });

    expect(planActionMessage(unpaid, 'cancel')).toBe(
      'Kỳ hiện tại chưa được thanh toán. Thanh toán kỳ này trước khi hủy gói.',
    );
    expect(planActionMessage(stopped, 'keep')).toBe('Gói đã dừng. Chọn gói mới để dùng tiếp.');
    expect(planActionMessage(unpaid, 'drop_schedule')).toContain('hóa đơn gia hạn đã tính');
    for (const action of ['cancel', 'keep', 'drop_schedule'] as const) {
      for (const error of [unpaid, stopped]) {
        expect(planActionMessage(error, action)).not.toMatch(/dùng thử|trước khi đổi gói/);
      }
    }
  });

  it('says other problems as any payment request does', () => {
    const busy = problem(409, 'payment_in_progress');
    expect(planActionMessage(busy, 'cancel')).toBe(paymentsMessage(busy));
  });
});
