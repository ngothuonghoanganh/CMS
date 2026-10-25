import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';

/**
 * Where a site's leads go (ADR-018): up to five email addresses. Each one confirms through a link
 * before it receives anything, so a form can never mail someone who did not agree to it.
 */
export const LEAD_RECIPIENTS_MAX = 5;

/** A confirmation link works this many days after it was sent. */
export const RECIPIENT_CONFIRMATION_DAYS = 7;

/** The admin page a confirmation link opens; the secret travels in the URL fragment. */
export const RECIPIENT_CONFIRM_PATH = '/lead-recipients/confirm';

/**
 * - `confirmed`: receives every new lead.
 * - `pending`: the confirmation email was sent and its link still works.
 * - `expired`: the link is older than `RECIPIENT_CONFIRMATION_DAYS`; send a new one.
 * - `unsent`: the confirmation email could not be sent; send it again.
 */
export const leadRecipientStatuses = ['confirmed', 'pending', 'expired', 'unsent'] as const;
export const leadRecipientStatusSchema = z.enum(leadRecipientStatuses);
export type LeadRecipientStatus = z.infer<typeof leadRecipientStatusSchema>;

export const leadRecipientSchema = z.object({
  id: idSchema,
  email: z.string(),
  status: leadRecipientStatusSchema,
  /** When the last confirmation email went out; null when it could not be sent. */
  invitedAt: isoDateTimeSchema.nullable(),
  confirmedAt: isoDateTimeSchema.nullable(),
});
export type LeadRecipient = z.infer<typeof leadRecipientSchema>;

export const leadRecipientListResponseSchema = z.object({ items: z.array(leadRecipientSchema) });
export type LeadRecipientListResponse = z.infer<typeof leadRecipientListResponseSchema>;

export const addLeadRecipientRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, 'Email quá dài')
    .pipe(z.email('Email chưa đúng định dạng')),
});
export type AddLeadRecipientRequest = z.input<typeof addLeadRecipientRequestSchema>;

/** The secret of a confirmation link: 32 random bytes in base64url. */
export const recipientTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, 'Liên kết xác nhận không hợp lệ');

export const confirmLeadRecipientRequestSchema = z.object({ token: recipientTokenSchema });
export type ConfirmLeadRecipientRequest = z.infer<typeof confirmLeadRecipientRequestSchema>;

export const confirmLeadRecipientResponseSchema = z.object({
  siteName: z.string(),
  email: z.string(),
});
export type ConfirmLeadRecipientResponse = z.infer<typeof confirmLeadRecipientResponseSchema>;

/** Sending a lead's email notification (ADR-018). */
export const LEAD_NOTIFICATION_MAX_ATTEMPTS = 3;

/**
 * - `pending`: waiting for its next attempt.
 * - `sending`: an instance of the API is sending it.
 * - `sent`: delivered to the SMTP server for every confirmed address.
 * - `failed`: every attempt failed, or no address was confirmed; "Gửi lại" starts again.
 * - `skipped`: a lead suspected of spam is never emailed.
 */
export const leadNotificationStatuses = [
  'pending',
  'sending',
  'sent',
  'failed',
  'skipped',
] as const;
export const leadNotificationStatusSchema = z.enum(leadNotificationStatuses);
export type LeadNotificationStatus = z.infer<typeof leadNotificationStatusSchema>;

/** Why sending failed; logs and the inbox show the code, never the email itself. */
export const leadNotificationErrorCodes = [
  'no_recipients',
  'smtp_unavailable',
  'smtp_rejected',
  'timeout',
  'unknown',
] as const;
export const leadNotificationErrorCodeSchema = z.enum(leadNotificationErrorCodes);
export type LeadNotificationErrorCode = z.infer<typeof leadNotificationErrorCodeSchema>;

export const leadNotificationSchema = z.object({
  status: leadNotificationStatusSchema,
  attempts: z.number().int().nonnegative(),
  lastErrorCode: leadNotificationErrorCodeSchema.nullable(),
  sentAt: isoDateTimeSchema.nullable(),
  /** How many confirmed addresses the SMTP server accepted the email for. */
  recipients: z.number().int().nonnegative().nullable(),
  /** Addresses the SMTP server refused (e.g. a deleted mailbox) while it accepted the others. */
  rejectedRecipients: z.number().int().nonnegative().nullable(),
});
export type LeadNotification = z.infer<typeof leadNotificationSchema>;
