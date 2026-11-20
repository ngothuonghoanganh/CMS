'use client';

import { endpoints, type Invoice } from '@plp/contracts';
import { useToast } from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { api, ApiError } from '../../lib/api';
import { formatVnd } from '../../lib/format';
import { reportUnexpected } from '../shell/problem-message';
import { paymentProblemOf, paymentsMessage } from './payment-problem';
import { billingQueryKeys, invalidateAfterPlanChange } from './queries';

export interface PayResult {
  invoice: Invoice;
  /** 202: the gateway is still deciding; the plan follows its answer. */
  pending: boolean;
}

/**
 * Whether the API may have handled the request without its answer reaching the admin: the
 * connection failed, or the server or the proxy before it broke down. The same request is then
 * sent again with the same key, which the API answers as the first time if it got there.
 */
function answerLost(error: unknown): boolean {
  return !(error instanceof ApiError) || (error.status >= 500 && error.code === 'internal');
}

/**
 * "Thanh toán lại" (board 29): charges the saved card for an unpaid invoice. A click carries an
 * `Idempotency-Key` of its own, so a double click charges once (ADR-035), except after an answer
 * that was lost: the next click is the same request again, with the same key, so it learns what
 * the first one did rather than counting as a new attempt.
 */
export function usePayInvoice(workspaceId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // The key of a request whose answer was lost, by invoice.
  const unanswered = useRef(new Map<string, string>());

  function refresh() {
    // A charge, whatever its answer, moves the invoice, the card's state and the plan.
    void queryClient.invalidateQueries({ queryKey: billingQueryKeys.all(workspaceId) });
  }

  return useMutation({
    mutationFn: async (invoiceId: string): Promise<PayResult> => {
      const key = unanswered.current.get(invoiceId) ?? crypto.randomUUID();
      unanswered.current.set(invoiceId, key);
      let status = 200;
      try {
        const { invoice } = await api(endpoints.payInvoice, [workspaceId, invoiceId], {
          headers: { 'Idempotency-Key': key },
          onStatus: (value) => {
            status = value;
          },
        });
        unanswered.current.delete(invoiceId);
        return { invoice, pending: status === 202 };
      } catch (error) {
        if (!answerLost(error)) {
          unanswered.current.delete(invoiceId);
        }
        throw error;
      }
    },
    onSuccess: ({ invoice, pending }) => {
      refresh();
      if (!pending) {
        invalidateAfterPlanChange(queryClient, workspaceId);
      }
      toast(
        pending
          ? {
              tone: 'neutral',
              title: 'Đang xử lý thanh toán',
              description: `Hóa đơn ${invoice.number} sẽ cập nhật khi cổng thanh toán xác nhận.`,
            }
          : {
              tone: 'success',
              title: `Đã thanh toán ${formatVnd(invoice.amount)}`,
              description: `Hóa đơn ${invoice.number}.`,
            },
      );
    },
    onError: (error) => {
      reportUnexpected('Paying the invoice failed', error);
      refresh();
      const lost = answerLost(error);
      toast(
        lost || paymentProblemOf(error)?.kind === 'unknown_outcome'
          ? {
              tone: 'warning',
              title: 'Chưa biết kết quả thanh toán',
              description: lost
                ? `${paymentsMessage(error)} Kiểm tra lịch sử giao dịch, hoặc bấm "Thanh toán lại": tiền không bị trừ hai lần.`
                : paymentsMessage(error),
            }
          : {
              tone: 'danger',
              title: 'Thanh toán không thành công',
              description: paymentsMessage(error),
            },
      );
    },
  });
}
