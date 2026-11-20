'use client';

import {
  type BillingSummary,
  type MethodSetupResult,
  type PlanCatalogResponse,
  type WorkspacePlan,
} from '@plp/contracts';
import { Badge, Button, ButtonLink, Callout, useToast } from '@plp/ui';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatVnd } from '../../lib/format';
import { cx } from '../shell/cx';
import { billingHref, paymentsHref } from '../shell/navigation';
import { PageContainer, PageHeader } from '../shell/PageHeader';
import { ScrollRegion } from '../shell/ScrollRegion';
import { BillingTabs } from './BillingTabs';
import { ChangePlanDialog } from './ChangePlanDialog';
import {
  comparisonRows,
  periodLine,
  planBanner,
  priceLabel,
  stateChip,
  usageMeters,
} from './plan-presentation';
import { billingQueryKeys, useBillingSummary } from './queries';
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

/** What the member-level plan keeps of a summary. */
function workspacePlanOf(summary: BillingSummary): WorkspacePlan {
  const { id, name, limits, features } = summary.plan;
  return {
    plan: { id, name, limits, features },
    state: summary.state,
    access: summary.access,
    trialDaysLeft: summary.trialDaysLeft,
  };
}

/**
 * Screen 28 "Gói dịch vụ" (ADR-035, T1, T2): the plan, its state, what the workspace uses of each
 * limit and how the plans compare, and "Đổi gói" with its payment. Cards and invoices are board
 * 29, one tab over; the subscription's lifecycle (cancel, renewal) comes later.
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
  const [notice] = useState(returned);
  const summary = useBillingSummary(workspaceId, initial, loadedAt);

  const chip = stateChip(summary.state, summary.trialDaysLeft);
  const banner = planBanner(summary);
  const meters = usageMeters(summary.plan, summary.usage, summary.usageResetsOn);
  const rows = comparisonRows(catalog.plans);

  // The address the gateway led back to is not kept: a reload says nothing of the card twice.
  useEffect(() => {
    if (returned !== null) {
      window.history.replaceState(window.history.state, '', billingHref(workspaceId));
    }
  }, [returned, workspaceId]);

  // Board 28's banner CTAs: the trial leads to the card, an ended trial to choosing a plan.
  const bannerAction = !canManage ? null : summary.state === 'trialing' ? (
    <ButtonLink as={Link} href={paymentsHref(workspaceId)} variant="secondary" size="sm">
      Thêm phương thức thanh toán
    </ButtonLink>
  ) : summary.state === 'trial_expired' ? (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        setChanging(true);
      }}
    >
      Chọn gói và thanh toán
    </Button>
  ) : null;

  function changed(next: BillingSummary, charged: number | null) {
    queryClient.setQueryData(billingQueryKeys.summary(workspaceId), next);
    // The sidebar, the banner and the "Nâng cấp" chips follow at once.
    queryClient.setQueryData(billingQueryKeys.plan(workspaceId), workspacePlanOf(next));
    // Automations and custom roles depend on the plan; their screens read again.
    void queryClient.invalidateQueries({ queryKey: ['sites'] });
    // A charge made an invoice, and a card in use shows on board 29.
    void queryClient.invalidateQueries({ queryKey: billingQueryKeys.invoices(workspaceId) });
    setChanging(false);
    toast({
      tone: 'success',
      title: `Đã đổi sang Gói ${next.plan.name}`,
      ...(charged === null ? {} : { description: `Đã thanh toán ${formatVnd(charged)}.` }),
    });
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
      {notice === 'saved' ? (
        <Callout tone="success" role="status" title="Đã lưu thẻ">
          Chọn gói rồi thanh toán bằng thẻ vừa lưu.
        </Callout>
      ) : null}
      {notice === 'canceled' ? (
        <Callout tone="info" role="status" title="Chưa thêm thẻ">
          Bạn đã rời trang của cổng thanh toán, nên thẻ chưa được lưu.
        </Callout>
      ) : null}
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
              <Button
                variant="secondary"
                onClick={() => {
                  setChanging(true);
                }}
              >
                Đổi gói
              </Button>
            </div>
          ) : (
            <p className={styles.ownerNote}>Chủ sở hữu workspace đổi được gói.</p>
          )}
        </div>
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
