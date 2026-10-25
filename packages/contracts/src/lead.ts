import { z } from 'zod';
import { idSchema } from './common.js';

/**
 * What a visitor sends with the lead form (ADR-016). The renderer validates with these schemas
 * before relaying, and the API validates again against the form of the release the visitor saw,
 * so both answer with the same Vietnamese messages.
 */

/** The renderer route the lead form posts to; the API never sees visitors directly. */
export const LEAD_ROUTE = '/_lead';

/** Names of the form controls, shared by the form markup and the renderer's `/_lead` route. */
export const leadFormFieldNames = {
  releaseId: 'releaseId',
  name: 'name',
  phone: 'phone',
  email: 'email',
  message: 'message',
  consent: 'consent',
  marketing: 'marketing',
  /** The honeypot: hidden from people, filled by bots. */
  honeypot: 'website',
} as const;

export const LEAD_PHONE_MESSAGE =
  'Số điện thoại chưa đúng. Nhập số bắt đầu bằng 0 (ví dụ 0901 234 567) hoặc số có mã quốc gia (ví dụ +84 901 234 567).';

/**
 * A phone number as E.164 ("+84901234567"), or null when it is not one. A number written without
 * a country code is Vietnamese: 0 then 9 digits (mobile) or 10 digits (landline, "028 3822 1234").
 * One with a code may be from any
 * country; +84 (or 84) must then be followed by the 9 or 10 digits of a Vietnamese number. Spaces,
 * dots, dashes and brackets are allowed while typing; "00" may stand for "+".
 */
export function normalizeLeadPhone(value: string): string | null {
  const compact = value.replace(/[\s.()-]/g, '').replace(/^00/, '+');
  if (/^0\d{9,10}$/.test(compact)) {
    return `+84${compact.slice(1)}`;
  }
  const vietnamese = /^\+?84(\d*)$/.exec(compact);
  if (vietnamese) {
    // "+84 0901 234 567": the 0 of the national form is often kept after the country code.
    const national = (vietnamese[1] ?? '').replace(/^0(?=\d{9,10}$)/, '');
    return /^\d{9,10}$/.test(national) ? `+84${national}` : null;
  }
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}

/** A lead's phone number, stored as E.164 with Vietnam (+84) as the default country (ADR-016). */
export const leadPhoneSchema = z
  .string()
  .trim()
  .min(1, 'Nhập số điện thoại')
  .max(24, LEAD_PHONE_MESSAGE)
  .transform(normalizeLeadPhone)
  .pipe(z.string({ error: LEAD_PHONE_MESSAGE }));

export const leadNameSchema = z
  .string()
  .trim()
  .min(1, 'Nhập họ và tên')
  .max(100, 'Họ và tên tối đa 100 ký tự');

/** Optional: empty when the visitor leaves it blank or the form has no email field. */
export const leadEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email quá dài')
  .transform((value) => (value === '' ? null : value))
  .pipe(z.email('Email chưa đúng định dạng').nullable());

export const LEAD_MESSAGE_MAX = 1000;

export const leadMessageSchema = z
  .string()
  .trim()
  .max(LEAD_MESSAGE_MAX, `Lời nhắn tối đa ${LEAD_MESSAGE_MAX} ký tự`)
  .transform((value) => (value === '' ? null : value));

export const CONSENT_REQUIRED_MESSAGE = 'Bạn cần đồng ý để gửi đăng ký';

/** A form filled in faster than this is likely a bot (ADR-016); the lead is kept as spam. */
export const LEAD_SPAM_MIN_FILL_MS = 3000;

/** Generated once per form by the page script; a retry with the same id is not a new lead. */
export const submissionIdSchema = z.string().regex(/^[A-Za-z0-9-]{16,64}$/);

const sourceValueSchema = z.string().max(2000).nullable();

export const publicLeadRequestSchema = z.object({
  /** The release the visitor saw: its form and consent text apply (ADR-016). */
  releaseId: idSchema,
  submissionId: submissionIdSchema.nullable(),
  name: leadNameSchema,
  phone: leadPhoneSchema,
  email: leadEmailSchema,
  message: leadMessageSchema,
  /** The required consent; the checkbox is never ticked in advance (rule 10). */
  consent: z.literal(true, { error: CONSENT_REQUIRED_MESSAGE }),
  /** The separate, optional marketing checkbox. */
  marketing: z.boolean(),
  /** A field people never see; bots fill it. */
  honeypot: z.string().max(500),
  /** Time from showing the form to sending it, set by the page script; null without script. */
  elapsedMs: z.number().int().nonnegative().max(86_400_000).nullable(),
  source: z.object({
    utmSource: sourceValueSchema,
    utmMedium: sourceValueSchema,
    utmCampaign: sourceValueSchema,
    referrer: sourceValueSchema,
  }),
});
export type PublicLeadRequest = z.input<typeof publicLeadRequestSchema>;
export type PublicLeadValues = z.output<typeof publicLeadRequestSchema>;

/** Same answer for every accepted lead, spam or not, so bots learn nothing. */
export const publicLeadResponseSchema = z.object({ status: z.literal('received') });
export type PublicLeadResponse = z.infer<typeof publicLeadResponseSchema>;
