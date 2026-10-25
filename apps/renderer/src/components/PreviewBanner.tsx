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

/**
 * What the previewed content is to visitors. A release preview may show the live version itself,
 * and the token does not say which version is live now, so it never claims either way.
 */
function note(preview: PreviewInfo): string {
  if (preview.kind === 'draft') {
    return 'Bản nháp này chưa được xuất bản và không hiển thị với khách truy cập.';
  }
  const version = preview.version === null ? 'một phiên bản' : `phiên bản v${preview.version}`;
  return `Đây là ${version} đã xuất bản; trang live có thể khác.`;
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
        <p className={styles.note}>{note(preview)}</p>
      </div>
    </div>
  );
}
