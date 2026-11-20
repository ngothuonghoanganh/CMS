import type { ErrorCode } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/api-core';
import { planProblemOf } from './plan-problem';
import { paymentProblemOf, paymentsMessage } from './payment-problem';

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
