'use client';

import type { ConsentSnapshot } from '@plp/contracts';
import { Dialog } from '@plp/ui';
import { formatDateTime } from '../../lib/format';
import styles from './LeadInbox.module.css';

export interface ConsentEvidenceDialogProps {
  snapshot: ConsentSnapshot;
  /** When the visitor agreed. */
  at: string;
  /** They ticked the marketing checkbox. */
  marketing: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Xem nội dung": the consent texts exactly as the visitor saw them, from the release of the page
 * they filled in (ADR-017), not the current settings.
 */
export function ConsentEvidenceDialog({
  snapshot,
  at,
  marketing,
  open,
  onOpenChange,
}: ConsentEvidenceDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Nội dung đồng ý bản ${snapshot.version}`}
      description={`Khách đồng ý lúc ${formatDateTime(at)}, trên trang họ đã gửi form.`}
    >
      <dl className={styles.evidence}>
        <dt>Đơn vị thu thập dữ liệu</dt>
        <dd>{snapshot.controllerName}</dd>
        <dt>Ô đồng ý bắt buộc</dt>
        <dd>{snapshot.requiredText}</dd>
        <dt>Ô nhận ưu đãi</dt>
        <dd>
          {snapshot.marketingText === null
            ? 'Form không có ô này'
            : `${snapshot.marketingText} — ${marketing ? 'khách đã chọn' : 'khách không chọn'}`}
        </dd>
        <dt>Chính sách quyền riêng tư</dt>
        <dd>
          <a href={snapshot.policyUrl} target="_blank" rel="noopener noreferrer">
            {snapshot.policyUrl}
          </a>
        </dd>
      </dl>
    </Dialog>
  );
}
