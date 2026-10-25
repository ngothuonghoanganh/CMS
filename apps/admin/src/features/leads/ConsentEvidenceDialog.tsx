'use client';

import type { LeadDetail } from '@plp/contracts';
import { Dialog } from '@plp/ui';
import { formatDateTime } from '../../lib/format';
import styles from './LeadInbox.module.css';

export interface ConsentEvidenceDialogProps {
  consent: LeadDetail['consent'];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Xem nội dung": the consent texts exactly as the visitor saw them, from the release of the page
 * they filled in (ADR-017), not the current settings.
 */
export function ConsentEvidenceDialog({ consent, open, onOpenChange }: ConsentEvidenceDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Nội dung đồng ý bản ${consent.version}`}
      description={`Khách đồng ý lúc ${formatDateTime(consent.at)}, trên trang họ đã gửi form.`}
    >
      <dl className={styles.evidence}>
        <dt>Đơn vị thu thập dữ liệu</dt>
        <dd>{consent.controllerName}</dd>
        <dt>Ô đồng ý bắt buộc</dt>
        <dd>{consent.requiredText}</dd>
        <dt>Ô nhận ưu đãi</dt>
        <dd>
          {consent.marketingText === null
            ? 'Form không có ô này'
            : `${consent.marketingText} — ${consent.marketing ? 'khách đã chọn' : 'khách không chọn'}`}
        </dd>
        <dt>Chính sách quyền riêng tư</dt>
        <dd>
          <a href={consent.policyUrl} target="_blank" rel="noopener noreferrer">
            {consent.policyUrl}
          </a>
        </dd>
      </dl>
    </Dialog>
  );
}
