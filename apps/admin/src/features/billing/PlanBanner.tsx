'use client';

import { Callout } from '@plp/ui';
import Link from 'next/link';
import { useClientNow } from '../shell/use-now';
import { billingHref } from '../shell/navigation';
import { useWorkspacePlan } from './plan-context';
import { graceNotice, readOnlyReason } from './plan-presentation';
import { useGraceSummary } from './queries';
import styles from './PlanBanner.module.css';

export interface PlanBannerProps {
  /**
   * `card` heads a screen inside the shell; `strip` runs across a full-screen editor or flow
   * under its top bar, like the editor's draft notice.
   */
  variant?: 'card' | 'strip';
}

/**
 * On every workspace screen (the full-screen ones included), one banner at most, by what matters
 * most (ADR-035, T3):
 * - the plan has lapsed: the workspace may be read, live pages and lead forms keep working;
 * - an unpaid period is inside its grace: "Thanh toán lỗi — còn N ngày trước khi chỉ đọc";
 * - nothing otherwise.
 * Board 28 says what to do in both.
 */
export function PlanBanner({ variant = 'card' }: PlanBannerProps) {
  const frame = useWorkspacePlan();
  const state = frame?.plan.state;
  const inGrace =
    frame !== null &&
    frame.plan.access === 'full' &&
    (state === 'past_due' || state === 'pending_payment');
  const mayReadSummary = inGrace && frame.canViewBilling;
  // The grace's end is in the billing summary, which only `billing.view` reads; other roles get
  // the banner without the days.
  const summary = useGraceSummary(frame?.workspaceId ?? '', mayReadSummary);
  const now = useClientNow();
  if (frame === null) {
    return null;
  }
  const link = frame.canViewBilling ? (
    <Link href={billingHref(frame.workspaceId)} className={styles.link}>
      Xem gói & thanh toán
    </Link>
  ) : null;

  if (frame.plan.access === 'read_only') {
    const callout = (
      <Callout
        tone="danger"
        role="status"
        variant={variant === 'strip' ? 'banner' : 'panel'}
        title="Workspace đang ở chế độ chỉ đọc"
        action={link}
      >
        {readOnlyReason(frame.plan.state)} Trang live và form vẫn chạy.{' '}
        {variant === 'strip' ? 'Thay đổi ở đây chưa lưu được. ' : null}
        {frame.canViewBilling
          ? 'Chọn gói để sửa và xuất bản lại.'
          : 'Chủ sở hữu workspace cần chọn gói để mở lại việc chỉnh sửa.'}
      </Callout>
    );
    return variant === 'strip' ? callout : <div className={styles.banner}>{callout}</div>;
  }

  const notice = graceNotice(frame.plan.state, summary.data?.graceEndsAt ?? null, now);
  if (!inGrace || notice === null) {
    return null;
  }
  const callout = (
    <Callout
      tone={frame.plan.state === 'past_due' ? 'danger' : 'warning'}
      role="status"
      variant={variant === 'strip' ? 'banner' : 'panel'}
      title={notice.title}
      action={link}
    >
      {notice.detail} {frame.canViewBilling ? null : 'Chủ sở hữu workspace cần xử lý thanh toán.'}
    </Callout>
  );
  return variant === 'strip' ? callout : <div className={styles.banner}>{callout}</div>;
}
