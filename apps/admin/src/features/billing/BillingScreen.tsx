'use client';

import {
  type BillingSummary,
  type MethodSetupResult,
  type PlanCatalogResponse,
} from '@plp/contracts';
import { Badge, Button, ButtonLink, Callout, useToast } from '@plp/ui';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatDate, formatVnd } from '../../lib/format';
import { cx } from '../shell/cx';
import { billingHref, paymentsHref } from '../shell/navigation';
import { PageContainer, PageHeader } from '../shell/PageHeader';
import { ScrollRegion } from '../shell/ScrollRegion';
import { BillingTabs } from './BillingTabs';
import { CancelPlanDialog } from './CancelPlanDialog';
import { ChangePlanDialog } from './ChangePlanDialog';
import { MethodSetupNotice } from './MethodSetupNotice';
import {
  BANNER_ACTION_LABELS,
  canCancelPlan,
  canDropSchedule,
  comparisonRows,
  dueWaiting,
  periodLine,
  type PlanBannerAction,
  planBanner,
  priceLabel,
  scheduledChangeLine,
  shownState,
  stateChip,
  usageMeters,
} from './plan-presentation';
import { adoptSummary, billingQueryKeys, useBillingSummary, usePaymentMethod } from './queries';
import { usePlanLifecycle } from './use-plan-lifecycle';
import styles from './Billing.module.css';

export interface BillingScreenProps {
  workspaceId: string;
  workspaceName: string;
  /** Holds `billing.manage`: only Chủ sở hữu changes the plan (ADR-035). */
  canManage: boolean;
  initial: BillingSummary;
  catalog: PlanCatalogResponse;
  loadedAt: number;
  /** `?paymentMethod=` of the address the gateway led back to from the plan dialog. */
  returned?: MethodSetupResult | null;
}

/**
 * Screen 28 "Gói dịch vụ" (ADR-035, T1 to T3): the plan, its state with the banner and the button
 * that state leads to, what the workspace uses of each limit and how the plans compare, "Đổi gói"
 * with its payment or its schedule, and "Hủy gói" / "Giữ lại gói". Cards and invoices are board
 * 29, one tab over.
 */
export function BillingScreen({
  workspaceId,
  workspaceName,
  canManage,
  initial,
  catalog,
  loadedAt,
  returned = null,
}: BillingScreenProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [changing, setChanging] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const lifecycle = usePlanLifecycle(workspaceId);
  // Only Chủ sở hữu adds a card. Kept in state: the address loses its parameter below.
  const [notice, setNotice] = useState(canManage ? returned : null);
  const summary = useBillingSummary(workspaceId, initial, loadedAt);
  // "Đã lưu thẻ" once the card is there, not because the address says so.
  const savedCard = usePaymentMethod(workspaceId, notice === 'saved');

  const chip = stateChip(
    shownState(summary.state, dueWaiting(summary.dueInvoice)),
    summary.trialDaysLeft,
  );
  const banner = planBanner(summary);
  const nextPlan =
    summary.scheduledChange === null
      ? undefined
      : catalog.plans.find((plan) => plan.id === summary.scheduledChange?.planId);
  const scheduledLine = nextPlan === undefined ? null : scheduledChangeLine(summary, nextPlan.name);
  const meters = usageMeters(summary.plan, summary.usage, summary.usageResetsOn);
  const rows = comparisonRows(catalog.plans);

  // The address the gateway led back to is not kept: a reload says nothing of the card twice.
  useEffect(() => {
    if (returned !== null) {
      window.history.replaceState(window.history.state, '', billingHref(workspaceId));
    }
  }, [returned, workspaceId]);

  function openDialog() {
    setNotice(null);
    setChanging(true);
  }

  // Board 28's banner CTAs lead to the payments screen (a card, an invoice) or open a dialog here.
  // Only Chủ sở hữu takes them; the others read the same banner.
  function bannerButton(action: PlanBannerAction) {
    const label = BANNER_ACTION_LABELS[action];
    switch (action) {
      case 'add_method':
      case 'update_card':
      case 'pay_invoice':
      case 'view_invoice':
        return (
          <ButtonLink
            as={Link}
            href={paymentsHref(workspaceId)}
            variant={action === 'pay_invoice' ? 'primary' : 'secondary'}
            size="sm"
          >
            {label}
          </ButtonLink>
        );
      case 'keep':
        return (
          <Button
            variant="secondary"
            size="sm"
            loading={lifecycle.keep.isPending}
            onClick={() => {
              lifecycle.keep.mutate();
            }}
          >
            {label}
          </Button>
        );
      case 'choose_plan':
      case 'pay_now':
        return (
          <Button variant="secondary" size="sm" onClick={openDialog}>
            {label}
          </Button>
        );
    }
  }
  const bannerAction = !canManage || banner?.action == null ? null : bannerButton(banner.action);

  function changed(next: BillingSummary, charged: number | null, scheduled: boolean) {
    adoptSummary(queryClient, workspaceId, next);
    setChanging(false);
    toast(
      scheduled
        ? {
            tone: 'success',
            title: 'Đã lên lịch đổi gói',
            description: `Gói ${summary.plan.name} giữ nguyên tới ${formatDate(next.periodEnd)}.`,
          }
        : {
            tone: 'success',
            title: `Đã đổi sang Gói ${next.plan.name}`,
            ...(charged === null ? {} : { description: `Đã thanh toán ${formatVnd(charged)}.` }),
          },
    );
  }

  function pending() {
    // The plan follows the gateway's answer: read it again when it may have come.
    void queryClient.invalidateQueries({ queryKey: billingQueryKeys.all(workspaceId) });
  }

  return (
    <PageContainer>
      <PageHeader
        title="Gói dịch vụ"
        description={`Gói và mức sử dụng của workspace ${workspaceName}.`}
      />
      <BillingTabs workspaceId={workspaceId} current="plan" />
      <MethodSetupNotice
        notice={notice}
        method={savedCard.data?.paymentMethod}
        error={savedCard.error}
        reloading={savedCard.isFetching}
        onReload={() => {
          void savedCard.refetch();
        }}
        next="Chọn gói rồi thanh toán bằng thẻ này."
      />
      {banner === null ? null : (
        <Callout tone={banner.tone} role={banner.role} title={banner.title} action={bannerAction}>
          {banner.body}
        </Callout>
      )}

      <section aria-labelledby="current-plan-title" className={styles.card}>
        <div className={styles.current}>
          <div className={styles.currentText}>
            <span className={styles.planName}>
              <h2 id="current-plan-title" className={styles.planTitle}>
                Gói {summary.plan.name}
              </h2>
              <Badge tone={chip.tone} dot>
                {chip.label}
              </Badge>
            </span>
            <span className={styles.price}>
              {priceLabel(summary.plan, summary.cycle)} · tính cho cả workspace {workspaceName}
            </span>
            <span className={styles.period}>{periodLine(summary)}</span>
          </div>
          {canManage ? (
            <div className={styles.currentActions}>
              <Button variant="secondary" onClick={openDialog}>
                Đổi gói
              </Button>
              {canCancelPlan(summary) ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    lifecycle.cancel.reset();
                    setCanceling(true);
                  }}
                >
                  Hủy gói
                </Button>
              ) : null}
            </div>
          ) : (
            <p className={styles.ownerNote}>Chủ sở hữu workspace đổi được gói.</p>
          )}
        </div>
        {scheduledLine === null ? null : (
          <div className={styles.scheduled}>
            <span className={styles.scheduledText}>{scheduledLine}</span>
            {canManage && canDropSchedule(summary) ? (
              <Button
                variant="ghost"
                size="sm"
                loading={lifecycle.dropSchedule.isPending}
                onClick={() => {
                  lifecycle.dropSchedule.mutate();
                }}
              >
                Hủy thay đổi
              </Button>
            ) : null}
          </div>
        )}
        <ul className={styles.meters} aria-label="Mức sử dụng">
          {meters.map((meter) => (
            <li key={meter.key} className={styles.meter}>
              <span className={styles.meterHead}>
                <span className={styles.meterName}>{meter.name}</span>
                <span className={styles.meterValue}>{meter.text}</span>
              </span>
              <span role="img" aria-label={meter.label} className={styles.track}>
                <span
                  className={cx(
                    styles.fill,
                    meter.tone === 'near' && styles.fillNear,
                    (meter.tone === 'full' || meter.tone === 'over') && styles.fillFull,
                  )}
                  style={{ width: `${meter.percent}%` }}
                />
              </span>
              <span
                className={cx(styles.meterNote, meter.tone !== 'normal' && styles.meterNoteWarn)}
              >
                {meter.note}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="compare-title" className={styles.compare}>
        <h2 id="compare-title" className={styles.sectionTitle}>
          So sánh gói
        </h2>
        <ScrollRegion label="So sánh các gói">
          <table className={styles.table}>
            <caption className={styles.srOnly}>So sánh các gói</caption>
            <thead>
              <tr>
                <td className={styles.corner} />
                {catalog.plans.map((plan) => (
                  <th
                    key={plan.id}
                    scope="col"
                    className={cx(
                      styles.planHead,
                      plan.id === summary.plan.id && styles.currentColumn,
                    )}
                  >
                    <span className={styles.planHeadName}>
                      {plan.name}
                      {plan.id === summary.plan.id ? (
                        <Badge tone="primary" size="sm">
                          HIỆN TẠI
                        </Badge>
                      ) : null}
                    </span>
                    <span className={styles.planHeadPrice}>{priceLabel(plan, summary.cycle)}</span>
                    <span className={styles.planHeadFit}>{plan.fit}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <th scope="row" className={styles.rowHead}>
                    {row.name}
                  </th>
                  {row.cells.map((cell, index) => {
                    const plan = catalog.plans[index];
                    return (
                      <td
                        key={plan?.id ?? index}
                        className={cx(
                          styles.cell,
                          plan?.id === summary.plan.id && styles.currentColumn,
                          cell === '—' && styles.cellNo,
                        )}
                      >
                        {cell}
                        {cell === '—' ? <span className={styles.srOnly}> (không có)</span> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
        <p className={styles.fine}>Giá đã gồm VAT.</p>
      </section>

      {canManage && canceling ? (
        <CancelPlanDialog
          summary={summary}
          open
          onOpenChange={setCanceling}
          pending={lifecycle.cancel.isPending}
          error={lifecycle.cancel.error}
          onConfirm={() => {
            lifecycle.cancel.mutate(undefined, {
              onSuccess: () => {
                setCanceling(false);
              },
            });
          }}
        />
      ) : null}
      {canManage && changing ? (
        // Mounted only while open, so each opening starts from the plan in force.
        <ChangePlanDialog
          workspaceId={workspaceId}
          summary={summary}
          plans={catalog.plans}
          open
          onOpenChange={setChanging}
          onChanged={changed}
          onPending={pending}
        />
      ) : null}
    </PageContainer>
  );
}
