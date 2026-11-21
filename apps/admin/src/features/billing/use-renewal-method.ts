'use client';

import { type BillingSummary, endpoints, type RenewalMethod } from '@plp/contracts';
import { useToast } from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { reportUnexpected } from '../shell/problem-message';
import { paymentProblemOf, paymentsMessage } from './payment-problem';
import { adoptSummary, billingQueryKeys } from './queries';

/** What the toast says after the method changed: when the next invoice or charge comes. */
function changedDescription(summary: BillingSummary): string {
  const renewal = summary.renewal;
  if (summary.renewalMethod === 'card') {
    return renewal?.invoice != null && renewal.invoice.status === 'pending'
      ? `Hóa đơn ${renewal.invoice.number} vẫn chuyển khoản được trước ${formatDate(renewal.at)}; sau đó hệ thống trừ thẻ đã lưu.`
      : 'Hệ thống tự trừ thẻ đã lưu khi hết kỳ.';
  }
  if (renewal?.invoice != null && renewal.invoice.status === 'pending') {
    return `Hóa đơn ${renewal.invoice.number} đã gửi, chuyển khoản trước ${formatDate(renewal.at)}.`;
  }
  if (renewal?.invoiceAt != null) {
    return `Hóa đơn kỳ sau được gửi ${formatDate(renewal.invoiceAt)}.`;
  }
  return 'Hóa đơn kỳ sau được gửi trước ngày hết kỳ.';
}

/**
 * "Gia hạn bằng" (board 29, ADR-035 T4): sets how the next period is paid. The API answers with the
 * new summary, which the screens follow at once; with `transfer` near the period's end it has made
 * the invoice already. A refusal reads the summary again (the plan may have moved). "Cần thêm thẻ"
 * (422) is left to the caller to show with "Thêm thẻ"; any other refusal toasts.
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
        description: changedDescription(summary),
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
