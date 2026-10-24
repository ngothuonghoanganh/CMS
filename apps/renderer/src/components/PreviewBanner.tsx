import type { PublicPreviewResponse } from '@plp/contracts';
import { formatDateTime } from '../lib/date-format';
import styles from './PreviewBanner.module.css';

type PreviewInfo = PublicPreviewResponse['preview'];

function versionLabel(preview: PreviewInfo): string {
  if (preview.kind === 'draft') {
    return 'Bản nháp';
  }
  return preview.version === null ? 'Phiên bản đã xuất bản' : `Phiên bản v${preview.version}`;
}

/** Sits on top of every preview so nobody mistakes it for the live page (ADR-010). */
export function PreviewBanner({ preview }: { preview: PreviewInfo }) {
  return (
    <div role="status" className={styles.banner}>
      <div className={styles.inner}>
        <p className={styles.heading}>
          <strong className={styles.title}>Bản xem trước</strong>
          <span className={styles.version}>{versionLabel(preview)}</span>
          <span className={styles.expiry}>
            Hết hạn <time dateTime={preview.expiresAt}>{formatDateTime(preview.expiresAt)}</time>
          </span>
        </p>
        <p className={styles.note}>
          Trang này chưa được xuất bản và không hiển thị với khách truy cập.
        </p>
      </div>
    </div>
  );
}
