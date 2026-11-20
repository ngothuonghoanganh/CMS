'use client';

import {
  type BillingCycle,
  type BillingSummary,
  billingCycleLabels,
  billingCycles,
  endpoints,
  type Plan,
} from '@plp/contracts';
import {
  Button,
  Callout,
  Dialog,
  RadioCardGroup,
  SegmentedControl,
  WarningTriangleIcon,
} from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { type PlanImpact, planImpacts, priceLabel } from './plan-presentation';
import styles from './Billing.module.css';

export interface ChangePlanDialogProps {
  workspaceId: string;
  summary: BillingSummary;
  plans: readonly Plan[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: (summary: BillingSummary) => void;
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

/**
 * "Đổi gói" (board 28). During the trial the plan changes at once, at no charge; outside it the
 * API answers why it cannot yet, and that message is shown as it is (ADR-035, T1).
 */
export function ChangePlanDialog({
  workspaceId,
  summary,
  plans,
  open,
  onOpenChange,
  onChanged,
}: ChangePlanDialogProps) {
  const [planId, setPlanId] = useState(summary.plan.id);
  const [cycle, setCycle] = useState<BillingCycle>(summary.cycle);
  const target = plans.find((plan) => plan.id === planId) ?? summary.plan;
  const unchanged = target.id === summary.plan.id && cycle === summary.cycle;
  const impacts = planImpacts(summary.plan, target, summary.usage);

  const change = useMutation({
    mutationFn: () => api(endpoints.changePlan, [workspaceId], { body: { planId, cycle } }),
    onSuccess: onChanged,
    onError: (error) => {
      reportUnexpected('Changing the plan failed', error);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A running change cannot be dismissed half-way: its answer shows here.
        if (!next && change.isPending) {
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
        summary.state === 'trialing'
          ? 'Trong thời gian dùng thử, gói mới có hiệu lực ngay và không tính phí.'
          : 'Chọn gói và chu kỳ thanh toán.'
      }
      footer={
        <>
          <Button
            variant="secondary"
            disabled={change.isPending}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Giữ Gói {summary.plan.name}
          </Button>
          <Button
            loading={change.isPending}
            disabled={unchanged}
            onClick={() => {
              change.mutate();
            }}
          >
            Đổi sang Gói {target.name}
          </Button>
        </>
      }
    >
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
        <p className={styles.fine}>
          Giá đã gồm VAT, tính cho cả workspace theo {billingCycleLabels[cycle]}.
        </p>
        {change.isError ? (
          <Callout tone="danger" role="alert">
            {problemMessage(change.error)}
          </Callout>
        ) : null}
      </div>
    </Dialog>
  );
}
