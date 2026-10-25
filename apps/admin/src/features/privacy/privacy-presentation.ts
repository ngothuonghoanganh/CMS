import {
  type ConsentVersion,
  fillControllerName,
  type PrivacySettings,
  type PublicLeadCapture,
  type RetentionMonths,
} from '@plp/contracts';
import { formatDate } from '../../lib/format';

/** Choices of "Tự động xóa lead và bằng chứng đồng ý sau", in the order of board 12. */
export const RETENTION_OPTIONS: readonly { value: RetentionMonths; label: string }[] = [
  { value: 12, label: '12 tháng' },
  { value: 24, label: '24 tháng' },
  { value: 6, label: '6 tháng' },
  { value: null, label: 'Không tự xóa' },
];

const NO_RETENTION = 'none';

/** The `<select>` value of a retention period. */
export function retentionValue(months: RetentionMonths): string {
  return months === null ? NO_RETENTION : String(months);
}

export function parseRetention(value: string): RetentionMonths {
  const option = RETENTION_OPTIONS.find((candidate) => retentionValue(candidate.value) === value);
  if (option === undefined) {
    throw new Error(`Unknown retention option "${value}"`);
  }
  return option.value;
}

/** Badge of the consent card: "Bản 2 · đang dùng từ 01/10/2026". */
export function consentBadgeText(current: ConsentVersion | null): string {
  return current === null
    ? 'Chưa có nội dung đồng ý'
    : `Bản ${current.version} · đang dùng từ ${formatDate(current.createdAt)}`;
}

/**
 * Shown after saving: a live page with a form keeps what its release snapshotted until it is
 * published again (ADR-017), like the site look (ADR-015).
 */
export const LIVE_FORMS_KEEP_CONSENT =
  'Trang có form đang live giữ nội dung đồng ý, tên doanh nghiệp và link chính sách cũ cho tới khi bạn xuất bản lại trang đó.';

/** ADR-017: deleting a lead here cannot reach copies already sent out. */
export const RETENTION_NOTE = 'Lead được xóa ở đây không tự xóa khỏi email thông báo đã gửi đi.';

/**
 * The consent texts a form shows with the current settings, as the canvas draws them; null until
 * both the settings and a consent version exist. A live page shows its release's snapshot instead.
 */
export function leadCaptureViewOf(settings: PrivacySettings): PublicLeadCapture | null {
  const { privacy, currentConsent } = settings;
  if (privacy === null || currentConsent === null) {
    return null;
  }
  return {
    requiredText: fillControllerName(currentConsent.requiredText, privacy.controllerName),
    marketingText: currentConsent.marketingText,
    policyUrl: privacy.policyUrl,
  };
}
