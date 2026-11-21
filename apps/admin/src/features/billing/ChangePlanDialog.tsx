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
import { voidedInvoiceNotice } from './renewal-presentation';
import { useMethodSetup } from './use-method-setup';
import {
  type PlanImpact,
  planImpacts,
  priceLabel,
  quoteImpacts,
  scheduledChangeLine,
} from './plan-presentation';
import styles from './Billing.module.css';

export interface ChangePlanDialogProps {
  workspaceId: string;
  summary: BillingSummary;
  plans: readonly Plan[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The plan changed; `charged` is what the card paid (null for a free change). `scheduled`: the
   * change waits for the end of the period, the plan in force is still the old one.
   */
  onChanged: (summary: BillingSummary, charged: number | null, scheduled: boolean) => void;
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

/** Which button made the offer: the loading spinner sits on that one. */
function ScheduledSummary({
  quote,
  current,
  target,
}: {
  quote: PlanChangeQuote;
  current: BillingSummary;
  target: Plan;
}) {
  const from = quote.effectiveAt === null ? '' : ` từ ${formatDate(quote.effectiveAt)}`;
  const samePlan = quote.planId === current.plan.id;
  return (
    <>
      <p className={styles.dialogHeading}>
        {samePlan
          ? `Đổi sang thanh toán theo ${billingCycleLabels[quote.cycle]}${from}?`
          : `Chuyển xuống Gói ${target.name}${from}?`}
      </p>
      <p className={styles.quoteLine}>
        Gói {current.plan.name} giữ nguyên tới hết kỳ này. Không dữ liệu nào bị xóa; những gì vượt
        hạn mức chỉ bị chặn tạo mới. Hôm nay không tính phí.
      </p>
      <p className={styles.quoteLine}>
        {quote.nextAmount === null
          ? null
          : `Phí kỳ sau: ${formatVnd(quote.nextAmount)} / ${billingCycleLabels[quote.cycle]}. `}
        Phần còn lại của kỳ này không được hoàn tiền.
      </p>
    </>
  );
}

interface Offer {
  payNow: boolean;
  quote: PlanChangeQuote;
  as: 'free' | 'main' | 'transfer';
}

/** `restart`: a canceled plan paid for again, which has no trial to end (T3). */
function ChargeSummary({ quote, restart }: { quote: PlanChangeQuote; restart: boolean }) {
  const period =
    quote.periodStart === null || quote.periodEnd === null
      ? null
      : `${formatDate(quote.periodStart)} – ${formatDate(quote.periodEnd)}`;
  return (
    <p className={styles.quoteLine}>
      {quote.mode === 'upgrade'
        ? `Nâng cấp có hiệu lực ngay. Phần chênh lệch giá tính cho ${String(quote.remainingDays)}/${String(quote.periodDays)} ngày còn lại của kỳ, làm tròn lên 1.000 ₫.`
        : restart
          ? 'Thanh toán ngay mở lại gói, với một kỳ mới tính từ hôm nay.'
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
  const [pending, setPending] = useState<'charge' | 'transfer' | null>(null);
  const target = plans.find((plan) => plan.id === planId) ?? summary.plan;
  const setup = useMethodSetup(workspaceId, 'plan');
  // The trial offers a free change and paying now; after it only paying, as the API decides from
  // `trialEndsAt`, whatever the state says (past due with a card on file, or read-only after it);
  // a paid period one change.
  const unpaidTrial = summary.trialEndsAt !== null;
  const inTrial = unpaidTrial && summary.state === 'trialing';
  // A trial that ended, or a plan that was canceled: only paying now chooses a plan.
  const trialOver = (unpaidTrial && !inTrial) || summary.state === 'canceled';

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
      ? { payNow: false, quote: freeQuote, as: 'free' }
      : null;
  // A lower price or another cycle in a paid period: nothing is charged, it applies at the period's
  // end (the quote says when).
  const scheduledQuote = freeQuote !== null && freeQuote.mode === 'scheduled' ? freeQuote : null;
  const scheduledOffer: Offer | null =
    scheduledQuote === null ? null : { payNow: false, quote: scheduledQuote, as: 'main' };
  const chargeOffer: Offer | null =
    chargeQuote === null
      ? null
      : { payNow: chargeQuote === paidQuote, quote: chargeQuote, as: 'main' };
  const mainOffer = chargeOffer ?? scheduledOffer;
  // A plan paid now can be paid by bank transfer too, with no card on file.
  const transferOffer: Offer | null =
    chargeOffer !== null && chargeOffer.payNow ? { ...chargeOffer, as: 'transfer' } : null;
  const impacts: PlanImpact[] =
    (freeQuote?.mode === 'scheduled' || freeQuote?.mode === 'trial_change') &&
    freeQuote.impacts !== null
      ? quoteImpacts(freeQuote.impacts, summary.plan, target)
      : planImpacts(summary.plan, target, summary.usage);
  const waiting = (!trialOver && free.isPending) || ((inTrial || trialOver) && paid.isPending);
  const unavailable =
    freeQuote?.mode === 'unavailable' && freeQuote.unavailableReason !== 'payment_required'
      ? freeQuote
      : null;
  const needsCard = chargeQuote?.paymentMethodRequired === true;
  // A change already scheduled for the period's end: choosing again replaces it.
  const scheduled = summary.scheduledChange;
  const scheduledPlan =
    scheduled === null ? undefined : plans.find((plan) => plan.id === scheduled.planId);
  const scheduledLine =
    scheduledPlan === undefined ? null : scheduledChangeLine(summary, scheduledPlan.name);

  // The early renewal invoice of a bank transfer that this choice voids (T4): what the owner sees
  // before confirming, so no one transfers to details that no longer work. A replacement follows
  // while the plan renews by transfer; an upgrade voids it only once paid.
  const voidedNotices: string[] = [];
  if (freeQuote?.renewalInvoiceVoided != null && freeQuote.mode !== 'start_paid') {
    voidedNotices.push(
      `${inTrial ? 'Nếu đổi miễn phí: ' : ''}${voidedInvoiceNotice(
        freeQuote.renewalInvoiceVoided,
        summary.renewalMethod === 'transfer',
        freeQuote.mode === 'upgrade',
      )}`,
    );
  }
  if (paidQuote?.renewalInvoiceVoided != null && paidQuote.mode === 'start_paid') {
    voidedNotices.push(
      `${inTrial ? 'Nếu thanh toán ngay: ' : ''}${voidedInvoiceNotice(paidQuote.renewalInvoiceVoided, false)}`,
    );
  }

  const change = useMutation({
    mutationFn: async ({ payNow, quote, as }: Offer) => {
      let status = 200;
      const next = await api(endpoints.changePlan, [workspaceId], {
        body: {
          planId,
          cycle,
          ...(payNow ? { payNow } : {}),
          ...(quote.amount > 0 ? { expectedAmount: quote.amount } : {}),
          ...(as === 'transfer' ? { payWith: 'transfer' as const } : {}),
        },
        onStatus: (value) => {
          status = value;
        },
      });
      return {
        summary: next,
        pending: status === 202,
        charged: quote.amount,
        scheduled: quote.mode === 'scheduled',
        transfer: as === 'transfer',
      };
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: billingQueryKeys.invoices(workspaceId) });
      if (result.pending) {
        setPending(result.transfer ? 'transfer' : 'charge');
        onPending();
        return;
      }
      onChanged(result.summary, result.charged > 0 ? result.charged : null, result.scheduled);
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
  const mainLabel =
    mainOffer === null
      ? null
      : mainOffer.quote.mode === 'scheduled'
        ? mainOffer.quote.planId === summary.plan.id
          ? 'Lên lịch đổi chu kỳ'
          : 'Lên lịch hạ gói'
        : mainOffer.quote.mode === 'upgrade'
          ? `Nâng cấp và thanh toán ${formatVnd(mainOffer.quote.amount)}`
          : `Thanh toán ngay ${formatVnd(mainOffer.quote.amount)}`;
  const problem = change.isError ? paymentProblemOf(change.error) : null;
  // A problem that points to an invoice in the history.
  const aboutInvoice =
    problem?.kind === 'declined' ||
    problem?.kind === 'unknown_outcome' ||
    (problem?.kind === 'in_progress' && problem.invoiceNumber !== null);

  // Another choice is another question: the answer to the last one no longer applies.
  function choosePlan(next: string) {
    change.reset();
    setPlanId(next);
  }

  function chooseCycle(next: BillingCycle) {
    change.reset();
    setCycle(next);
  }

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
            ? `${summary.state === 'canceled' ? 'Gói đã hủy.' : 'Thời gian dùng thử đã hết.'} Chọn gói và thanh toán ${summary.access === 'read_only' ? 'để mở lại việc chỉnh sửa' : 'để dùng tiếp không gián đoạn'}.`
            : 'Chọn gói và chu kỳ thanh toán.'
      }
      footer={
        pending !== null ? (
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
                loading={busy && change.variables.as === 'free'}
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
            {transferOffer === null ? null : (
              <Button
                variant="secondary"
                loading={busy && change.variables.as === 'transfer'}
                disabled={busy}
                onClick={() => {
                  change.mutate(transferOffer);
                }}
              >
                Chuyển khoản
              </Button>
            )}
            <Button
              loading={busy && change.variables.as === 'main'}
              disabled={busy || mainOffer === null || needsCard}
              onClick={() => {
                if (mainOffer !== null) {
                  change.mutate(mainOffer);
                }
              }}
            >
              {mainLabel ?? (inTrial || trialOver ? 'Thanh toán ngay' : 'Đổi gói')}
            </Button>
          </>
        )
      }
    >
      {pending === 'transfer' ? (
        <Callout tone="info" role="status" title="Đang chờ chuyển khoản">
          Hóa đơn đã được tạo. Chuyển khoản theo hướng dẫn ở{' '}
          <Link href={paymentsHref(workspaceId)}>Thanh toán & hóa đơn</Link>; gói đổi khi nhận được
          tiền.
        </Callout>
      ) : pending === 'charge' ? (
        <Callout tone="info" role="status" title="Đang xử lý thanh toán">
          Gói sẽ đổi khi cổng thanh toán xác nhận. Bạn xem kết quả ở{' '}
          <Link href={paymentsHref(workspaceId)}>Thanh toán & hóa đơn</Link>.
        </Callout>
      ) : (
        <div className={styles.dialogBody}>
          {scheduledLine === null ? null : (
            <Callout tone="info" title="Đã lên lịch đổi gói">
              {scheduledLine}. Chọn gói hay chu kỳ khác sẽ thay lịch này. Muốn giữ Gói{' '}
              {summary.plan.name} như hiện tại, đóng hộp thoại và bấm &quot;Hủy thay đổi&quot;.
            </Callout>
          )}
          <SegmentedControl<BillingCycle>
            aria-label="Chu kỳ thanh toán"
            options={billingCycles.map((value) => ({
              value,
              label: value === 'monthly' ? 'Theo tháng' : 'Theo năm',
            }))}
            value={cycle}
            onChange={chooseCycle}
          />
          <RadioCardGroup<string>
            legend="Gói dịch vụ"
            options={plans.map((plan) => ({
              value: plan.id,
              label: `Gói ${plan.name}${
                plan.id === summary.plan.id
                  ? ' (hiện tại)'
                  : plan.id === scheduledPlan?.id
                    ? ' (đã lên lịch)'
                    : ''
              }`,
              description: `${priceLabel(plan, cycle)} · ${plan.fit}`,
            }))}
            value={planId}
            onChange={choosePlan}
            minColumnWidth={200}
            fillRow
          />
          {impacts.length === 0 ? null : <ImpactList impacts={impacts} />}
          {/* Said with the quote it comes with: what the owner must know before confirming. */}
          <div className={styles.quote} aria-live="polite" aria-busy={waiting}>
            {voidedNotices.length === 0 || waiting ? null : (
              <Callout
                tone="warning"
                title="Hóa đơn chuyển khoản đang chờ sẽ bị thay"
                className={styles.voidedNotice}
              >
                {voidedNotices.map((text) => (
                  <span key={text} className={styles.voidedLine}>
                    {text}
                  </span>
                ))}
              </Callout>
            )}
            {waiting ? (
              <p className={styles.quoteLine}>Đang tính số tiền…</p>
            ) : chargeQuote !== null ? (
              <>
                <p className={styles.quoteAmount}>
                  Số tiền thanh toán ngay: <strong>{formatVnd(chargeQuote.amount)}</strong>
                </p>
                <ChargeSummary quote={chargeQuote} restart={summary.state === 'canceled'} />
                {chargeQuote.paymentMethod === null ? (
                  <p className={styles.quoteLine}>
                    Chưa có thẻ dùng được.{' '}
                    <Button variant="ghost" size="sm" loading={setup.busy} onClick={setup.start}>
                      Thêm thẻ
                    </Button>
                  </p>
                ) : (
                  <p className={styles.quoteLine}>
                    Trừ vào {cardLabel(chargeQuote.paymentMethod)}.
                  </p>
                )}
              </>
            ) : scheduledQuote !== null ? (
              <ScheduledSummary quote={scheduledQuote} current={summary} target={target} />
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
            {setup.error === null ? null : (
              <Callout tone="danger" role="alert" title="Chưa mở được trang của cổng thanh toán">
                {paymentsMessage(setup.error)}
              </Callout>
            )}
          </div>
          <p className={styles.fine}>
            Giá đã gồm VAT, tính cho cả workspace theo {billingCycleLabels[cycle]}.
          </p>
          {change.isError ? (
            <Callout tone="danger" role="alert">
              {paymentsMessage(change.error)}
              {aboutInvoice ? (
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
