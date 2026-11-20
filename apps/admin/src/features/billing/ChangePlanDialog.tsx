'use client';

import {
  type BillingCycle,
  type BillingSummary,
  billingCycleLabels,
  billingCycles,
  endpoints,
  type Plan,
  type PlanChangeQuote,
} from '@plp/contracts';
import {
  Button,
  Callout,
  Dialog,
  RadioCardGroup,
  SegmentedControl,
  WarningTriangleIcon,
} from '@plp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '../../lib/api';
import { formatDate, formatVnd } from '../../lib/format';
import { paymentsHref } from '../shell/navigation';
import { reportUnexpected } from '../shell/problem-message';
import { cardLabel } from './payment-presentation';
import { paymentProblemOf, paymentProblemText, paymentsMessage } from './payment-problem';
import { billingQueryKeys } from './queries';
import { useMethodSetup } from './use-method-setup';
import { type PlanImpact, planImpacts, priceLabel } from './plan-presentation';
import styles from './Billing.module.css';

export interface ChangePlanDialogProps {
  workspaceId: string;
  summary: BillingSummary;
  plans: readonly Plan[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The plan changed; `charged` is what the card paid (null for a free change). */
  onChanged: (summary: BillingSummary, charged: number | null) => void;
  /** A charge is still being decided: the plan changes when the gateway confirms. */
  onPending: () => void;
}

function ImpactList({ impacts }: { impacts: readonly PlanImpact[] }) {
  return (
    <ul className={styles.impacts} aria-label="Điều gì thay đổi">
      {impacts.map((impact) => (
        <li
          key={impact.title}
          className={impact.kind === 'warn' ? styles.impactWarn : styles.impact}
        >
          <WarningTriangleIcon size={16} strokeWidth={2} />
          <span>
            <strong>{impact.title}</strong> {impact.body}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface Offer {
  payNow: boolean;
  quote: PlanChangeQuote;
}

function ChargeSummary({ quote }: { quote: PlanChangeQuote }) {
  const period =
    quote.periodStart === null || quote.periodEnd === null
      ? null
      : `${formatDate(quote.periodStart)} – ${formatDate(quote.periodEnd)}`;
  return (
    <p className={styles.quoteLine}>
      {quote.mode === 'upgrade'
        ? `Nâng cấp có hiệu lực ngay. Phần chênh lệch giá tính cho ${String(quote.remainingDays)}/${String(quote.periodDays)} ngày còn lại của kỳ, làm tròn lên 1.000 ₫.`
        : 'Thanh toán ngay kết thúc dùng thử và bắt đầu kỳ đầu tiên của gói này.'}
      {period === null ? null : ` Kỳ ${period}.`}
    </p>
  );
}

/**
 * "Đổi gói" (board 28). The API's quote says what the choice does now: during the trial a free
 * change, or "Thanh toán ngay" that ends the trial and charges the first period; in a paid period
 * an upgrade charged for the days left. The amount shown is the amount confirmed: the API
 * refuses a charge that differs from the quote (ADR-035, T2).
 */
export function ChangePlanDialog({
  workspaceId,
  summary,
  plans,
  open,
  onOpenChange,
  onChanged,
  onPending,
}: ChangePlanDialogProps) {
  const queryClient = useQueryClient();
  const [planId, setPlanId] = useState(summary.plan.id);
  const [cycle, setCycle] = useState<BillingCycle>(summary.cycle);
  const [pending, setPending] = useState(false);
  const target = plans.find((plan) => plan.id === planId) ?? summary.plan;
  const impacts = planImpacts(summary.plan, target, summary.usage);
  const setup = useMethodSetup(workspaceId, 'plan');
  // The trial offers a free change and paying now; after it only paying; a paid period one change.
  const inTrial = summary.state === 'trialing';
  const trialOver = summary.state === 'trial_expired';

  function quoteQuery(payNow: boolean, enabled: boolean) {
    return {
      queryKey: billingQueryKeys.quote(workspaceId, planId, cycle, payNow),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api(endpoints.getPlanChangeQuote, [workspaceId], {
          query: { planId, cycle, payNow: payNow ? ('true' as const) : ('false' as const) },
          signal,
        }),
      enabled,
      // Prices and days move: every opening and every choice asks again.
      staleTime: 0,
      gcTime: 0,
    };
  }
  const free = useQuery(quoteQuery(false, !trialOver));
  const paid = useQuery(quoteQuery(true, inTrial || trialOver));
  const freeQuote = free.data ?? null;
  const paidQuote = paid.data ?? null;
  // The quote that charges: paying now in a trial, or the upgrade of a paid period.
  const chargeQuote =
    paidQuote !== null && paidQuote.mode === 'start_paid'
      ? paidQuote
      : freeQuote !== null && freeQuote.mode === 'upgrade'
        ? freeQuote
        : null;
  const freeOffer: Offer | null =
    freeQuote !== null && freeQuote.mode === 'trial_change'
      ? { payNow: false, quote: freeQuote }
      : null;
  const chargeOffer: Offer | null =
    chargeQuote === null ? null : { payNow: chargeQuote === paidQuote, quote: chargeQuote };
  const waiting = (!trialOver && free.isPending) || ((inTrial || trialOver) && paid.isPending);
  const unavailable =
    freeQuote?.mode === 'unavailable' && freeQuote.unavailableReason !== 'payment_required'
      ? freeQuote
      : null;
  const needsCard = chargeQuote?.paymentMethodRequired === true;

  const change = useMutation({
    mutationFn: async ({ payNow, quote }: Offer) => {
      let status = 200;
      const next = await api(endpoints.changePlan, [workspaceId], {
        body: {
          planId,
          cycle,
          ...(payNow ? { payNow } : {}),
          ...(quote.amount > 0 ? { expectedAmount: quote.amount } : {}),
        },
        onStatus: (value) => {
          status = value;
        },
      });
      return { summary: next, pending: status === 202, charged: quote.amount };
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: billingQueryKeys.invoices(workspaceId) });
      if (result.pending) {
        setPending(true);
        onPending();
        return;
      }
      onChanged(result.summary, result.charged > 0 ? result.charged : null);
    },
    onError: (error, offer) => {
      reportUnexpected('Changing the plan failed', error);
      const problem = paymentProblemOf(error);
      if (problem?.kind === 'quote_changed' && problem.quote !== null) {
        // The new amount replaces the old one; the owner confirms again (nothing was charged).
        queryClient.setQueryData(
          billingQueryKeys.quote(workspaceId, planId, cycle, offer.payNow),
          problem.quote,
        );
      }
      if (problem?.kind === 'declined' || problem?.kind === 'unknown_outcome') {
        // The attempt is on the invoice now.
        void queryClient.invalidateQueries({ queryKey: billingQueryKeys.invoices(workspaceId) });
      }
      if (problem?.kind === 'card_required') {
        void queryClient.invalidateQueries({
          queryKey: ['workspaces', workspaceId, 'billing', 'quote'],
        });
      }
    },
  });

  const busy = change.isPending;
  const chargeLabel =
    chargeOffer === null
      ? null
      : chargeOffer.quote.mode === 'upgrade'
        ? `Nâng cấp và thanh toán ${formatVnd(chargeOffer.quote.amount)}`
        : `Thanh toán ngay ${formatVnd(chargeOffer.quote.amount)}`;
  const problem = change.isError ? paymentProblemOf(change.error) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A running change cannot be dismissed half-way: its answer shows here.
        if (!next && busy) {
          return;
        }
        if (!next) {
          change.reset();
        }
        onOpenChange(next);
      }}
      size="lg"
      title="Đổi gói"
      description={
        inTrial
          ? 'Trong thời gian dùng thử, bạn đổi gói miễn phí, hoặc thanh toán ngay để dùng tiếp không gián đoạn.'
          : trialOver
            ? 'Thời gian dùng thử đã hết. Chọn gói và thanh toán để mở lại việc chỉnh sửa.'
            : 'Chọn gói và chu kỳ thanh toán.'
      }
      footer={
        pending ? (
          <Button
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Đóng
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Giữ Gói {summary.plan.name}
            </Button>
            {inTrial ? (
              <Button
                variant="secondary"
                loading={busy && !change.variables.payNow}
                disabled={busy || freeOffer === null}
                onClick={() => {
                  if (freeOffer !== null) {
                    change.mutate(freeOffer);
                  }
                }}
              >
                Đổi miễn phí
              </Button>
            ) : null}
            <Button
              loading={busy && (inTrial || trialOver ? change.variables.payNow : true)}
              disabled={busy || chargeOffer === null || needsCard}
              onClick={() => {
                if (chargeOffer !== null) {
                  change.mutate(chargeOffer);
                }
              }}
            >
              {chargeLabel ?? (inTrial || trialOver ? 'Thanh toán ngay' : 'Đổi gói')}
            </Button>
          </>
        )
      }
    >
      {pending ? (
        <Callout tone="info" role="status" title="Đang xử lý thanh toán">
          Gói sẽ đổi khi cổng thanh toán xác nhận. Bạn xem kết quả ở{' '}
          <Link href={paymentsHref(workspaceId)}>Thanh toán & hóa đơn</Link>.
        </Callout>
      ) : (
        <div className={styles.dialogBody}>
          <SegmentedControl<BillingCycle>
            aria-label="Chu kỳ thanh toán"
            options={billingCycles.map((value) => ({
              value,
              label: value === 'monthly' ? 'Theo tháng' : 'Theo năm',
            }))}
            value={cycle}
            onChange={setCycle}
          />
          <RadioCardGroup<string>
            legend="Gói dịch vụ"
            options={plans.map((plan) => ({
              value: plan.id,
              label: `Gói ${plan.name}${plan.id === summary.plan.id ? ' (hiện tại)' : ''}`,
              description: `${priceLabel(plan, cycle)} · ${plan.fit}`,
            }))}
            value={planId}
            onChange={setPlanId}
            minColumnWidth={200}
          />
          {impacts.length === 0 ? null : <ImpactList impacts={impacts} />}
          <div className={styles.quote} aria-live="polite" aria-busy={waiting}>
            {waiting ? (
              <p className={styles.quoteLine}>Đang tính số tiền…</p>
            ) : chargeQuote !== null ? (
              <>
                <p className={styles.quoteAmount}>
                  Số tiền thanh toán ngay: <strong>{formatVnd(chargeQuote.amount)}</strong>
                </p>
                <ChargeSummary quote={chargeQuote} />
                {chargeQuote.paymentMethod === null ? (
                  <p className={styles.quoteLine}>
                    Chưa có thẻ dùng được.{' '}
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={setup.isPending}
                      onClick={() => {
                        setup.mutate();
                      }}
                    >
                      Thêm thẻ
                    </Button>
                  </p>
                ) : (
                  <p className={styles.quoteLine}>
                    Trừ vào {cardLabel(chargeQuote.paymentMethod)}.
                  </p>
                )}
              </>
            ) : unavailable?.unavailableReason ? (
              <p className={styles.quoteLine}>
                {paymentProblemText({ kind: 'unavailable', reason: unavailable.unavailableReason })}
              </p>
            ) : null}
            {free.isError || paid.isError ? (
              <Callout tone="danger" role="alert">
                {paymentsMessage(free.error ?? paid.error)}
              </Callout>
            ) : null}
          </div>
          <p className={styles.fine}>
            Giá đã gồm VAT, tính cho cả workspace theo {billingCycleLabels[cycle]}.
          </p>
          {change.isError ? (
            <Callout tone="danger" role="alert">
              {paymentsMessage(change.error)}
              {problem?.kind === 'declined' || problem?.kind === 'unknown_outcome' ? (
                <>
                  {' '}
                  <Link href={paymentsHref(workspaceId)}>Xem lịch sử giao dịch</Link>
                </>
              ) : null}
            </Callout>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
