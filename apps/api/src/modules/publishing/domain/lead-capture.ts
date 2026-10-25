import { type ChangeItem, fillControllerName } from '@plp/contracts';

/**
 * What a page with a form shows of its site's personal data settings (ADR-017): the consent
 * texts, the business that collects the data and the privacy policy. A release with a form
 * freezes it at publish time, so the form on a live page changes only when the page is published
 * again (rule 1), and a lead's release is the evidence of the text its sender agreed to (rule 10).
 */
export interface LeadCapture {
  consentVersionId: string;
  consentVersion: number;
  controllerName: string;
  policyUrl: string;
  /** The required consent text with the business name filled in. */
  requiredText: string;
  /** The optional marketing checkbox; null when the form has none. */
  marketingText: string | null;
}

/** The current settings a lead capture is built from. */
export interface LeadCaptureSettings {
  privacy: { controllerName: string; policyUrl: string } | null;
  consent: {
    id: string;
    version: number;
    requiredText: string;
    marketingText: string | null;
  } | null;
}

/** What a form still needs before it can be published (`consent_not_configured`). */
export type LeadCaptureGap = 'privacy' | 'consent';

export function leadCaptureGaps({ privacy, consent }: LeadCaptureSettings): LeadCaptureGap[] {
  return [
    ...(privacy === null ? ['privacy' as const] : []),
    ...(consent === null ? ['consent' as const] : []),
  ];
}

/** The lead capture the next publish would freeze; null while the settings are incomplete. */
export function currentLeadCapture({ privacy, consent }: LeadCaptureSettings): LeadCapture | null {
  if (privacy === null || consent === null) {
    return null;
  }
  return {
    consentVersionId: consent.id,
    consentVersion: consent.version,
    controllerName: privacy.controllerName,
    policyUrl: privacy.policyUrl,
    requiredText: fillControllerName(consent.requiredText, privacy.controllerName),
    marketingText: consent.marketingText,
  };
}

/**
 * Chip labels, in the order the publish dialog and the history list them. The consent text is
 * compared by version: renaming the business changes the filled-in text too, but only the name
 * chip should say so.
 */
const PRIVACY_LABELS: { field: keyof LeadCapture; label: string }[] = [
  { field: 'consentVersionId', label: 'Dữ liệu cá nhân: nội dung đồng ý' },
  { field: 'controllerName', label: 'Dữ liệu cá nhân: tên doanh nghiệp' },
  { field: 'policyUrl', label: 'Dữ liệu cá nhân: chính sách' },
];

/**
 * The settings that differ from `base` to `next`, as chips ("Dữ liệu cá nhân: chính sách"). Used
 * for a live page's reminders (live snapshot → current settings) and in a release's
 * `changeSummary` (previously live snapshot → the new release's snapshot). A side without a form
 * has nothing to compare: no chips.
 */
export function diffLeadCapture(base: LeadCapture | null, next: LeadCapture | null): ChangeItem[] {
  if (base === null || next === null) {
    return [];
  }
  return PRIVACY_LABELS.filter(({ field }) => base[field] !== next[field]).map(({ label }) => ({
    kind: 'privacy',
    label,
    sectionId: null,
  }));
}
