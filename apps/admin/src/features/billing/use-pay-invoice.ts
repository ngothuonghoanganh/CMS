'use client';

import { endpoints, type Invoice } from '@plp/contracts';
import { useToast } from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatVnd } from '../../lib/format';
import { reportUnexpected } from '../shell/problem-message';
import { paymentsMessage } from './payment-problem';
import { billingQueryKeys } from './queries';

export interface PayResult {
  invoice: Invoice;
  /** 202: the gateway is still deciding; the plan follows its answer. */
  pending: boolean;
}

/**
 * "Thanh toán lại" (board 29): charges the saved card for an unpaid invoice. Every click carries
 * its own `Idempotency-Key`, so a double click or a retried request charges once (ADR-035).
 */
export function usePayInvoice(workspaceId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  function refresh() {
    // A charge, whatever its answer, moves the invoice, the card's state and the plan.
    void queryClient.invalidateQueries({ queryKey: billingQueryKeys.all(workspaceId) });
  }

  return useMutation({
    mutationFn: async (invoiceId: string): Promise<PayResult> => {
      let status = 200;
      const { invoice } = await api(endpoints.payInvoice, [workspaceId, invoiceId], {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        onStatus: (value) => {
          status = value;
        },
      });
      return { invoice, pending: status === 202 };
    },
    onSuccess: ({ invoice, pending }) => {
      refresh();
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
      toast({
        tone: 'danger',
        title: 'Thanh toán không thành công',
        description: paymentsMessage(error),
      });
    },
  });
}
