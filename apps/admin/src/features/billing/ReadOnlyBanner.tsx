'use client';

import { Callout } from '@plp/ui';
import Link from 'next/link';
import { billingHref } from '../shell/navigation';
import { useWorkspacePlan } from './plan-context';
import { readOnlyReason } from './plan-presentation';
import styles from './ReadOnlyBanner.module.css';

export interface ReadOnlyBannerProps {
  /**
   * `card` heads a screen inside the shell; `strip` runs across a full-screen editor or flow
   * under its top bar, like the editor's draft notice.
   */
  variant?: 'card' | 'strip';
}

/**
 * On every workspace screen while the plan has lapsed (ADR-035), the full-screen ones included:
 * the workspace may be read, live pages and lead forms keep working, and board 28 says what to
 * do. Nothing otherwise.
 */
export function ReadOnlyBanner({ variant = 'card' }: ReadOnlyBannerProps) {
  const frame = useWorkspacePlan();
  if (frame === null || frame.plan.access !== 'read_only') {
    return null;
  }
  const callout = (
    <Callout
      tone="danger"
      role="status"
      variant={variant === 'strip' ? 'banner' : 'panel'}
      title="Workspace đang ở chế độ chỉ đọc"
      action={
        frame.canViewBilling ? (
          <Link href={billingHref(frame.workspaceId)} className={styles.link}>
            Xem gói & thanh toán
          </Link>
        ) : null
      }
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
