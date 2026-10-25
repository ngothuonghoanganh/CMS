import { z } from 'zod';
import { cursorQuerySchema, idSchema, isoDateTimeSchema, userRefSchema } from './common.js';
import { httpUrlSchema } from './content.js';

/**
 * Personal data and consent settings of a site (ADR-017). The owner edits them on "Dữ liệu &
 * đồng ý"; a release that has a form snapshots them, so live pages change only on publish.
 */

/** How long leads and their consent evidence are kept; null keeps them until deleted by hand. */
export const retentionMonthOptions = [12, 24, 6] as const;
export const retentionMonthsSchema = z
  .union([z.literal(6), z.literal(12), z.literal(24)])
  .nullable();
export type RetentionMonths = z.infer<typeof retentionMonthsSchema>;
export const DEFAULT_RETENTION_MONTHS = 12;

/** Written in a consent text where the business name goes; filled in when the text is shown. */
export const CONTROLLER_NAME_PLACEHOLDER = '{Tên doanh nghiệp}';

export function fillControllerName(text: string, controllerName: string): string {
  return text.replaceAll(CONTROLLER_NAME_PLACEHOLDER, controllerName);
}

/** Starting points from the design (board 12); not legal advice. */
export const SUGGESTED_REQUIRED_CONSENT_TEXT = `Tôi đồng ý để ${CONTROLLER_NAME_PLACEHOLDER} xử lý họ tên và số điện thoại của tôi nhằm liên hệ tư vấn dịch vụ.`;
export const SUGGESTED_MARKETING_CONSENT_TEXT =
  'Nhận thông tin ưu đãi qua Zalo hoặc SMS (không bắt buộc)';

export const controllerNameSchema = z
  .string()
  .trim()
  .min(1, 'Nhập tên doanh nghiệp')
  .max(120, 'Tên doanh nghiệp tối đa 120 ký tự');

/** Optional: an empty value clears it. */
const requestEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email quá dài')
  .transform((value) => (value === '' ? null : value))
  .pipe(z.email('Email không hợp lệ').nullable());

export const updatePrivacyRequestSchema = z.object({
  controllerName: controllerNameSchema,
  requestEmail: requestEmailSchema,
  policyUrl: httpUrlSchema,
  retentionMonths: retentionMonthsSchema,
});
export type UpdatePrivacyRequest = z.input<typeof updatePrivacyRequestSchema>;

export const sitePrivacySchema = z.object({
  controllerName: z.string(),
  requestEmail: z.string().nullable(),
  policyUrl: z.string(),
  retentionMonths: retentionMonthsSchema,
  updatedAt: isoDateTimeSchema,
});
export type SitePrivacy = z.infer<typeof sitePrivacySchema>;

export const REQUIRED_CONSENT_MAX = 600;
export const MARKETING_CONSENT_MAX = 200;

export const createConsentVersionRequestSchema = z.object({
  /**
   * The version the owner was editing, 0 when there was none. Saving over a version someone else
   * created in the meantime answers 409 instead of silently replacing it.
   */
  baseVersion: z.number().int().nonnegative(),
  requiredText: z
    .string()
    .trim()
    .min(1, 'Nhập nội dung đồng ý')
    .max(REQUIRED_CONSENT_MAX, `Tối đa ${REQUIRED_CONSENT_MAX} ký tự`),
  /** Text of the separate, optional marketing checkbox; null when the form has none. */
  marketingText: z
    .string()
    .trim()
    .min(1, 'Nhập nội dung ô nhận ưu đãi')
    .max(MARKETING_CONSENT_MAX, `Tối đa ${MARKETING_CONSENT_MAX} ký tự`)
    .nullable(),
});
export type CreateConsentVersionRequest = z.input<typeof createConsentVersionRequestSchema>;

/** Immutable: saving a new text creates the next version (rule 10). */
export const consentVersionSchema = z.object({
  id: idSchema,
  version: z.number().int().positive(),
  requiredText: z.string(),
  marketingText: z.string().nullable(),
  createdBy: userRefSchema,
  createdAt: isoDateTimeSchema,
});
export type ConsentVersion = z.infer<typeof consentVersionSchema>;

export const privacySettingsSchema = z.object({
  /** Null until the owner saves the settings once. */
  privacy: sitePrivacySchema.nullable(),
  /** The latest consent version; null until the owner saves one. */
  currentConsent: consentVersionSchema.nullable(),
});
export type PrivacySettings = z.infer<typeof privacySettingsSchema>;

export const consentVersionListQuerySchema = cursorQuerySchema;

export const consentVersionListResponseSchema = z.object({
  items: z.array(consentVersionSchema),
  nextCursor: z.string().nullable(),
});
export type ConsentVersionListResponse = z.infer<typeof consentVersionListResponseSchema>;
