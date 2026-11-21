'use client';

import { endpoints, type RenewalMethod } from '@plp/contracts';
import { useToast } from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { reportUnexpected } from '../shell/problem-message';
import { paymentProblemOf, paymentsMessage } from './payment-problem';
import { adoptSummary, billingQueryKeys } from './queries';

/**
 * "Gia hạn bằng" (board 29, ADR-035 T4): sets how the next period is paid. The API answers with the
 * new summary, which the screens follow at once; with `transfer` near the period's end it has made
 * the invoice already. The toast only confirms the choice: when the invoice or the charge comes is
 * the status line under the choice, said once. A refusal reads the summary again (the plan may
 * have moved). "Cần thêm thẻ" (422) is left to the caller to show with "Thêm thẻ"; any other
 * refusal toasts.
 */
export function useRenewalMethod(workspaceId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (method: RenewalMethod) =>
      api(endpoints.setRenewalMethod, [workspaceId], { body: { method } }),
    onSuccess: (summary) => {
      adoptSummary(queryClient, workspaceId, summary);
      toast({
        tone: 'success',
        title:
          summary.renewalMethod === 'card'
            ? 'Gia hạn bằng thẻ thanh toán tự động'
            : 'Gia hạn bằng chuyển khoản ngân hàng',
      });
    },
    onError: (error) => {
      reportUnexpected('Changing the renewal method failed', error);
      void queryClient.invalidateQueries({ queryKey: billingQueryKeys.all(workspaceId) });
      if (paymentProblemOf(error)?.kind !== 'card_required') {
        toast({
          tone: 'danger',
          title: 'Chưa đổi được phương thức gia hạn',
          description: paymentsMessage(error),
        });
      }
    },
  });
}
