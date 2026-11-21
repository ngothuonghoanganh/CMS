'use client';

import type { BillingSummary } from '@plp/contracts';
import { ConfirmDialog } from '@plp/ui';
import { formatDate } from '../../lib/format';
import { planActionMessage } from './payment-problem';
import styles from './Billing.module.css';

export interface CancelPlanDialogProps {
  summary: Pick<BillingSummary, 'plan' | 'periodEnd' | 'state' | 'trialEndsAt'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
}

/**
 * "Hủy gói" (board 28, T3): says what happens at the end of the period, which is the only change:
 * live pages and forms keep running, the admin turns read-only, no data is deleted, and nothing is
 * refunded (§6). The plan can still be kept until then.
 */
export function CancelPlanDialog({
  summary,
  open,
  onOpenChange,
  pending,
  error,
  onConfirm,
}: CancelPlanDialogProps) {
  const trial = summary.state === 'trialing';
  const end = formatDate(summary.periodEnd);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="danger"
      title={`Hủy Gói ${summary.plan.name}?`}
      description={
        trial
          ? `Bạn dùng thử bình thường tới ${end}. Sau đó gói dừng và không bị tính phí.`
          : `Gói ${summary.plan.name} giữ nguyên tới hết kỳ này (${end}), rồi dừng và không gia hạn.`
      }
      confirmLabel="Hủy gói"
      cancelLabel={`Giữ Gói ${summary.plan.name}`}
      pending={pending}
      error={error === null ? undefined : planActionMessage(error, 'cancel')}
      onConfirm={onConfirm}
    >
      <ul className={styles.cancelList} aria-label="Điều gì xảy ra khi hết kỳ">
        <li>Trang live và form vẫn chạy.</li>
        <li>Workspace chuyển sang chế độ chỉ đọc: bạn xem được, không sửa và xuất bản được.</li>
        <li>Không dữ liệu nào bị xóa.</li>
        <li>{trial ? 'Không tính phí.' : 'Phần còn lại của kỳ này không được hoàn tiền.'}</li>
        <li>Bạn giữ lại gói được trước {end}, và chọn gói mới được sau đó.</li>
      </ul>
    </ConfirmDialog>
  );
}
