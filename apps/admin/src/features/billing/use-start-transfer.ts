'use client';

import { endpoints } from '@plp/contracts';
import { useToast } from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { reportUnexpected } from '../shell/problem-message';
import { paymentsMessage } from './payment-problem';
import { billingQueryKeys } from './queries';

/**
 * "Chuyển khoản" (board 29, T3): asks the API for the bank details of an unpaid invoice. The invoice
 * then waits for the gateway to receive the money (`pending`); asking again answers the same
 * details. The mutation stays busy until the summary and the history have read it again, so the
 * instructions are there when the button stops spinning.
 */
export function useStartTransfer(workspaceId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (invoiceId: string) =>
      api(endpoints.startInvoiceTransfer, [workspaceId, invoiceId]),
    onSuccess: async ({ invoice }) => {
      queryClient.setQueryData(billingQueryKeys.invoice(workspaceId, invoice.id), invoice);
      await queryClient.invalidateQueries({ queryKey: billingQueryKeys.all(workspaceId) });
      toast({
        tone: 'neutral',
        title: 'Đang chờ chuyển khoản',
        description: `Chuyển khoản theo hướng dẫn cho hóa đơn ${invoice.number}.`,
      });
    },
    onError: async (error) => {
      reportUnexpected('Starting the transfer failed', error);
      await queryClient.invalidateQueries({ queryKey: billingQueryKeys.all(workspaceId) });
      toast({
        tone: 'danger',
        title: 'Chưa tạo được hướng dẫn chuyển khoản',
        description: paymentsMessage(error),
      });
    },
  });
}
