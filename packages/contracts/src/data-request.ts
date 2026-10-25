import { z } from 'zod';
import { businessDeadline } from './calendar.js';
import { cursorQuerySchema, idSchema, isoDateTimeSchema, userRefSchema } from './common.js';
import { LEAD_PHONE_MESSAGE, leadEmailSchema, normalizeLeadPhone } from './lead.js';
import { cappedCountSchema, leadPageRefSchema } from './lead-inbox.js';

/**
 * Requests from people who sent a form (board 12, ADR-017): to see, correct or delete their data,
 * or to withdraw their marketing consent. The owner records each one by hand, as it arrived by
 * email or phone, and handles it before deadlines counted in working days.
 */
export const dataRequestTypes = ['access', 'rectify', 'delete', 'withdraw_marketing'] as const;
export const dataRequestTypeSchema = z.enum(dataRequestTypes);
export type DataRequestType = z.infer<typeof dataRequestTypeSchema>;

export const dataRequestTypeLabels: Record<DataRequestType, string> = {
  access: 'Xem dữ liệu đang lưu',
  rectify: 'Sửa thông tin',
  delete: 'Xóa toàn bộ dữ liệu',
  withdraw_marketing: 'Rút lại đồng ý nhận ưu đãi',
};

/**
 * - `open`: the person has had no answer yet ("Cần phản hồi").
 * - `responded`: the person was answered; the request is being handled.
 * - `completed`: handled. A completed deletion keeps only a masked contact.
 */
export const dataRequestStatuses = ['open', 'responded', 'completed'] as const;
export const dataRequestStatusSchema = z.enum(dataRequestStatuses);
export type DataRequestStatus = z.infer<typeof dataRequestStatusSchema>;

/**
 * Working days (Monday to Friday in Vietnam) to answer the person and to complete the request.
 * The numbers come from the mockup; the business's legal owner confirms them before launch.
 */
export const DATA_REQUEST_RESPOND_DAYS = 2;
export const DATA_REQUEST_COMPLETE_DAYS = 20;
/** A request is recorded at most this many days after it reached the business. */
export const DATA_REQUEST_RECEIVED_MAX_DAYS = 30;
/** Entries the log of a request keeps; the oldest drop off. */
export const DATA_REQUEST_LOG_MAX = 50;
/** The person's leads a request lists; `leads` counts them all. */
export const DATA_REQUEST_MATCHES_MAX = 20;

/** A browser clock a few minutes ahead of the server's is not "in the future". */
export const DATA_REQUEST_CLOCK_SKEW_MS = 5 * 60_000;
const DAY_MS = 86_400_000;

/** When the person must be answered and the request completed, in working days (ADR-017). */
export function dataRequestDeadlines(receivedAt: Date): { respondBy: Date; completeBy: Date } {
  return {
    respondBy: businessDeadline(receivedAt, DATA_REQUEST_RESPOND_DAYS),
    completeBy: businessDeadline(receivedAt, DATA_REQUEST_COMPLETE_DAYS),
  };
}

/**
 * Why a request received at `receivedAt` cannot be recorded at `now`, or null. The form of "Ghi
 * nhận yêu cầu" and the API check the same rule.
 */
export function receivedAtProblem(receivedAt: Date, now: Date): string | null {
  if (receivedAt.getTime() > now.getTime() + DATA_REQUEST_CLOCK_SKEW_MS) {
    return 'Thời điểm nhận yêu cầu không được ở tương lai';
  }
  if (receivedAt.getTime() < now.getTime() - DATA_REQUEST_RECEIVED_MAX_DAYS * DAY_MS) {
    return `Chỉ ghi nhận được yêu cầu nhận trong ${DATA_REQUEST_RECEIVED_MAX_DAYS} ngày qua`;
  }
  return null;
}

export const DATA_REQUEST_CONTACT_MESSAGE = 'Nhập số điện thoại hoặc email của người yêu cầu';

/** Empty, or a phone number stored as E.164 like a lead's (ADR-016). */
const optionalPhoneSchema = z
  .string()
  .trim()
  .max(24, LEAD_PHONE_MESSAGE)
  .transform((value, ctx) => {
    if (value === '') {
      return null;
    }
    const phone = normalizeLeadPhone(value);
    if (phone === null) {
      ctx.addIssue({ code: 'custom', message: LEAD_PHONE_MESSAGE });
      return z.NEVER;
    }
    return phone;
  });

const contactShape = {
  /** Optional: a person who wrote from an email address may not give a name. */
  name: z
    .string()
    .trim()
    .max(100, 'Họ và tên tối đa 100 ký tự')
    .transform((value) => (value === '' ? null : value)),
  phone: optionalPhoneSchema,
  email: leadEmailSchema,
};

/** The person's leads are found by phone number or email, so one of them is needed. */
function requireContact(
  value: { phone: string | null; email: string | null },
  ctx: z.RefinementCtx,
): void {
  if (value.phone === null && value.email === null) {
    ctx.addIssue({ code: 'custom', message: DATA_REQUEST_CONTACT_MESSAGE, path: ['phone'] });
  }
}

/** Who made the request, as the form of "Ghi nhận yêu cầu" checks it. */
export const dataRequestContactSchema = z.object(contactShape).superRefine(requireContact);

export const createDataRequestRequestSchema = z
  .object({
    ...contactShape,
    type: dataRequestTypeSchema,
    /**
     * When the request reached the business: the deadlines count from its day. At most
     * `DATA_REQUEST_RECEIVED_MAX_DAYS` ago, and not in the future.
     */
    receivedAt: isoDateTimeSchema,
  })
  .superRefine(requireContact);
export type CreateDataRequestRequest = z.input<typeof createDataRequestRequestSchema>;

export const dataRequestListQuerySchema = cursorQuerySchema;
export type DataRequestListQuery = z.input<typeof dataRequestListQuerySchema>;

export const dataRequestSchema = z.object({
  id: idSchema,
  /**
   * The person as recorded, `phone` as E.164. Once a deletion is completed each field holds a
   * masked form instead ("L. M. A.", "0987 *** 223", "th***@gmail.com") and `masked` is true.
   */
  contact: z.object({
    name: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
  }),
  masked: z.boolean(),
  type: dataRequestTypeSchema,
  status: dataRequestStatusSchema,
  receivedAt: isoDateTimeSchema,
  /** The last instant to answer the person, and to complete the request. */
  respondBy: isoDateTimeSchema,
  completeBy: isoDateTimeSchema,
  respondedAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  /** Leads of the site with the person's phone number or email now; null once deleted. */
  leads: cappedCountSchema.nullable(),
  /** How many leads the completion deleted, or withdrew the marketing consent of. */
  completedCount: z.number().int().nonnegative().nullable(),
  createdAt: isoDateTimeSchema,
});
export type DataRequest = z.infer<typeof dataRequestSchema>;

export const dataRequestListResponseSchema = z.object({
  /** Most recently recorded first. */
  items: z.array(dataRequestSchema),
  nextCursor: z.string().nullable(),
});
export type DataRequestListResponse = z.infer<typeof dataRequestListResponseSchema>;

export const dataRequestLogActions = ['created', 'responded', 'exported', 'completed'] as const;
export const dataRequestLogActionSchema = z.enum(dataRequestLogActions);
export type DataRequestLogAction = z.infer<typeof dataRequestLogActionSchema>;

/** One line of "Xem nhật ký". It never holds personal data, so it stays after a deletion. */
export const dataRequestLogEntrySchema = z.object({
  at: isoDateTimeSchema,
  actor: userRefSchema,
  action: dataRequestLogActionSchema,
  /** Leads the step covered: exported, deleted or withdrawn. */
  count: z.number().int().nonnegative().nullable(),
});
export type DataRequestLogEntry = z.infer<typeof dataRequestLogEntrySchema>;

/** One of the person's leads, so the owner sees what a request covers before handling it. */
export const dataRequestMatchSchema = z.object({
  id: idSchema,
  name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  page: leadPageRefSchema,
  createdAt: isoDateTimeSchema,
  marketing: z.boolean(),
  marketingWithdrawnAt: isoDateTimeSchema.nullable(),
});
export type DataRequestMatch = z.infer<typeof dataRequestMatchSchema>;

export const dataRequestDetailSchema = dataRequestSchema.extend({
  /** Oldest first, at most `DATA_REQUEST_LOG_MAX` entries. */
  log: z.array(dataRequestLogEntrySchema),
  /** The person's leads, newest first, at most `DATA_REQUEST_MATCHES_MAX`. */
  matches: z.array(dataRequestMatchSchema),
});
export type DataRequestDetail = z.infer<typeof dataRequestDetailSchema>;
