'use client';

import { type BillingSummary, endpoints } from '@plp/contracts';
import { useToast } from '@plp/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { reportUnexpected } from '../shell/problem-message';
import { planActionMessage } from './payment-problem';
import { adoptSummary, billingQueryKeys } from './queries';
import { replacedInvoiceNote } from './renewal-presentation';

/**
 * "Hủy gói", "Giữ lại gói" and "Hủy thay đổi" of board 28 (ADR-035, T3). Each answers with the new
 * summary, which the sidebar, the banners and the plan card follow at once. A refusal reads the
 * summary again: the state may have moved (a payment came due) since the screen was drawn.
 */
export function usePlanLifecycle(workspaceId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  function refused(what: string, error: unknown) {
    reportUnexpected(what, error);
    void queryClient.invalidateQueries({ queryKey: billingQueryKeys.all(workspaceId) });
  }

  const cancel = useMutation({
    mutationFn: () => api(endpoints.cancelPlan, [workspaceId]),
    onSuccess: (summary: BillingSummary) => {
      const before = queryClient.getQueryData<BillingSummary>(
        billingQueryKeys.summary(workspaceId),
      );
      adoptSummary(queryClient, workspaceId, summary);
      toast({
        tone: 'neutral',
        title: 'Đã hủy gói',
        description: `Gói dừng vào ${formatDate(summary.cancelAt ?? summary.periodEnd)}. Bạn giữ lại gói được trước ngày đó.${replacedInvoiceNote(before ?? null, summary)}`,
      });
    },
    onError: (error) => {
      refused('Canceling the plan failed', error);
    },
  });

  const keep = useMutation({
    mutationFn: () => api(endpoints.keepPlan, [workspaceId]),
    onSuccess: (summary: BillingSummary) => {
      const before = queryClient.getQueryData<BillingSummary>(
        billingQueryKeys.summary(workspaceId),
      );
      adoptSummary(queryClient, workspaceId, summary);
      const note = replacedInvoiceNote(before ?? null, summary).trim();
      toast({
        tone: 'success',
        title: `Đã giữ lại Gói ${summary.plan.name}`,
        ...(note === '' ? {} : { description: note }),
      });
    },
    onError: (error) => {
      refused('Keeping the plan failed', error);
      toast({
        tone: 'danger',
        title: 'Chưa giữ lại được gói',
        description: planActionMessage(error, 'keep'),
      });
    },
  });

  const dropSchedule = useMutation({
    mutationFn: () => api(endpoints.cancelScheduledChange, [workspaceId]),
    onSuccess: (summary: BillingSummary) => {
      const before = queryClient.getQueryData<BillingSummary>(
        billingQueryKeys.summary(workspaceId),
      );
      adoptSummary(queryClient, workspaceId, summary);
      const note = replacedInvoiceNote(before ?? null, summary).trim();
      toast({
        tone: 'success',
        title: 'Đã hủy thay đổi đã lên lịch',
        ...(note === '' ? {} : { description: note }),
      });
    },
    onError: (error) => {
      refused('Dropping the scheduled change failed', error);
      toast({
        tone: 'danger',
        title: 'Chưa hủy được thay đổi',
        description: planActionMessage(error, 'drop_schedule'),
      });
    },
  });

  return { cancel, keep, dropSchedule };
}
