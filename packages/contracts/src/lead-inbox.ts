import { z } from 'zod';
import { type VnDay, vnDaySchema, vnDaySpan } from './calendar.js';
import { idSchema, isoDateTimeSchema } from './common.js';

/**
 * The lead inbox (board 10, ADR-018). Owners and editors read leads and change their status, note
 * and spam flag; only the owner exports leads or deletes a person's data (ADR-017).
 */

/** One list of statuses for the filter, the badge, the detail and the CSV. */
export const leadStatuses = ['new', 'contacted', 'scheduled', 'unreachable', 'won'] as const;
export const leadStatusSchema = z.enum(leadStatuses);
export type LeadStatus = z.infer<typeof leadStatusSchema>;

export const leadStatusLabels: Record<LeadStatus, string> = {
  new: 'Mới',
  contacted: 'Đã liên hệ',
  scheduled: 'Hẹn lịch',
  unreachable: 'Chưa liên lạc được',
  won: 'Đã chốt',
};

export const leadDevices = ['mobile', 'desktop'] as const;
export const leadDeviceSchema = z.enum(leadDevices);
export type LeadDevice = z.infer<typeof leadDeviceSchema>;

/** Tablets count as "Điện thoại", like on the analytics board. */
export const leadDeviceLabels: Record<LeadDevice, string> = {
  mobile: 'Điện thoại',
  desktop: 'Máy tính',
};

/** Why intake flagged a lead as spam (ADR-016). */
export const spamReasons = ['honeypot', 'too_fast'] as const;
export const spamReasonSchema = z.enum(spamReasons);
export type SpamReason = z.infer<typeof spamReasonSchema>;

/** No campaign tags and no outside referrer (ADR-016); shown as "trực tiếp". */
export const DIRECT_LEAD_SOURCE = { source: '(direct)', medium: '(none)' } as const;

export const leadSourceSchema = z.object({
  source: z.string(),
  medium: z.string(),
  campaign: z.string().nullable(),
});
export type LeadSource = z.infer<typeof leadSourceSchema>;

/** "facebook / cpc", or "trực tiếp". */
export function leadSourceLabel(source: Pick<LeadSource, 'source' | 'medium'>): string {
  return source.source === DIRECT_LEAD_SOURCE.source && source.medium === DIRECT_LEAD_SOURCE.medium
    ? 'trực tiếp'
    : `${source.source} / ${source.medium}`;
}

/** Counts shown as numbers stop here ("999+", ADR-018), so counting stays bounded. */
export const LEAD_COUNT_CAP = 999;

export const cappedCountSchema = z.object({
  count: z.number().int().nonnegative().max(LEAD_COUNT_CAP),
  /** More than `count` leads match. */
  capped: z.boolean(),
});
export type CappedCount = z.infer<typeof cappedCountSchema>;

/** "Hộp thư" holds the leads not suspected of spam; "Nghi ngờ spam" the others. */
export const leadFolders = ['inbox', 'spam'] as const;
export const leadFolderSchema = z.enum(leadFolders);
export type LeadFolder = z.infer<typeof leadFolderSchema>;

/** "7 ngày qua" (the default), "30 ngày qua", "Toàn bộ thời gian" or chosen days (ADR-018). */
export const leadRanges = ['7d', '30d', 'all', 'custom'] as const;
export const leadRangeSchema = z.enum(leadRanges);
export type LeadRange = z.infer<typeof leadRangeSchema>;
export const DEFAULT_LEAD_RANGE: LeadRange = '7d';
export const LEAD_CUSTOM_RANGE_MAX_DAYS = 365;

export const LEAD_SEARCH_MAX = 80;

const leadFilterShape = {
  folder: leadFolderSchema.default('inbox'),
  pageId: idSchema.optional(),
  status: leadStatusSchema.optional(),
  range: leadRangeSchema.default(DEFAULT_LEAD_RANGE),
  /** First and last day of a `custom` range in Vietnam, both included; ignored otherwise. */
  from: vnDaySchema.optional(),
  to: vnDaySchema.optional(),
  /** The start of a phone number or an email, or part of a name (accents ignored). */
  q: z.string().trim().max(LEAD_SEARCH_MAX).optional(),
};

function checkCustomRange(
  value: { range: LeadRange; from?: VnDay | undefined; to?: VnDay | undefined },
  ctx: z.RefinementCtx,
): void {
  if (value.range !== 'custom') {
    return;
  }
  if (value.from === undefined || value.to === undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'Chọn ngày bắt đầu và ngày kết thúc',
      path: [value.from === undefined ? 'from' : 'to'],
    });
    return;
  }
  const span = vnDaySpan(value.from, value.to);
  if (span < 1) {
    ctx.addIssue({
      code: 'custom',
      message: 'Ngày kết thúc phải từ ngày bắt đầu trở đi',
      path: ['to'],
    });
  } else if (span > LEAD_CUSTOM_RANGE_MAX_DAYS) {
    ctx.addIssue({
      code: 'custom',
      message: `Chọn tối đa ${LEAD_CUSTOM_RANGE_MAX_DAYS} ngày`,
      path: ['to'],
    });
  }
}

/** The inbox filters; the CSV export takes the same ones. */
export const leadFiltersSchema = z.object(leadFilterShape).superRefine(checkCustomRange);
export type LeadFilters = z.output<typeof leadFiltersSchema>;

export const leadListQuerySchema = z
  .object({
    ...leadFilterShape,
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(50),
  })
  .superRefine(checkCustomRange);
export type LeadListQuery = z.input<typeof leadListQuerySchema>;

export const leadPageRefSchema = z.object({ id: idSchema, title: z.string() });
export type LeadPageRef = z.infer<typeof leadPageRefSchema>;

export const leadListItemSchema = z.object({
  id: idSchema,
  name: z.string(),
  /** E.164; `formatLeadPhone` writes it for people. */
  phone: z.string(),
  page: leadPageRefSchema,
  source: leadSourceSchema,
  status: leadStatusSchema,
  createdAt: isoDateTimeSchema,
});
export type LeadListItem = z.infer<typeof leadListItemSchema>;

export const leadListResponseSchema = z.object({
  /** Newest first. */
  items: z.array(leadListItemSchema),
  nextCursor: z.string().nullable(),
  /** Leads of each folder matching the other filters: "Hộp thư · 48", "Nghi ngờ spam · 3". */
  counts: z.object({ inbox: cappedCountSchema, spam: cappedCountSchema }),
});
export type LeadListResponse = z.infer<typeof leadListResponseSchema>;

export const leadDetailSchema = z.object({
  id: idSchema,
  name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  message: z.string().nullable(),
  page: leadPageRefSchema,
  /** The release the visitor saw ("· v12"). */
  releaseVersion: z.number().int().positive(),
  source: leadSourceSchema,
  device: leadDeviceSchema,
  status: leadStatusSchema,
  note: z.string(),
  spam: z.object({ suspected: z.boolean(), reasons: z.array(spamReasonSchema) }),
  /**
   * Consent evidence (ADR-017): when the visitor agreed, and the texts of the release they saw,
   * with the business name filled in.
   */
  consent: z.object({
    at: isoDateTimeSchema,
    version: z.number().int().positive(),
    controllerName: z.string(),
    policyUrl: z.string(),
    requiredText: z.string(),
    marketingText: z.string().nullable(),
    /** Ticked the separate, optional marketing checkbox. */
    marketing: z.boolean(),
    marketingWithdrawnAt: isoDateTimeSchema.nullable(),
  }),
  createdAt: isoDateTimeSchema,
  /** When the retention period deletes the lead; null when it is kept until deleted by hand. */
  expiresAt: isoDateTimeSchema.nullable(),
  /** Leads of the site with the same phone number or email, this one included. */
  personLeads: cappedCountSchema,
});
export type LeadDetail = z.infer<typeof leadDetailSchema>;

export const LEAD_NOTE_MAX = 1000;

export const updateLeadRequestSchema = z
  .object({
    status: leadStatusSchema,
    note: z.string().trim().max(LEAD_NOTE_MAX, `Ghi chú tối đa ${LEAD_NOTE_MAX} ký tự`),
    /** Moves the lead to "Nghi ngờ spam" (true) or back to the inbox (false). */
    spam: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Không có thay đổi nào để lưu');
export type UpdateLeadRequest = z.input<typeof updateLeadRequestSchema>;

export const leadCountsSchema = z.object({
  /** Status "Mới", spam excluded, all time: the sidebar badge and "chưa xử lý" (ADR-018). */
  new: cappedCountSchema,
  /** Leads of the last 7 days in Vietnam, spam excluded: "Lead 7 ngày qua". */
  last7Days: cappedCountSchema,
});
export type LeadCounts = z.infer<typeof leadCountsSchema>;

/** One CSV export holds at most this many leads, newest first (ADR-018). */
export const LEAD_EXPORT_MAX_ROWS = 10_000;
/** Response header of a lead export: "true" when more leads matched than the file holds. */
export const EXPORT_TRUNCATED_HEADER = 'X-Export-Truncated';

/** The leads of one person a file export holds at most; deleting removes them all. */
export const LEAD_PERSON_EXPORT_MAX = 1000;

export const personExportRequestSchema = z.object({ format: z.enum(['json', 'csv']) });
export type PersonExportRequest = z.infer<typeof personExportRequestSchema>;

export const personDeleteResponseSchema = z.object({
  deletedCount: z.number().int().nonnegative(),
});
export type PersonDeleteResponse = z.infer<typeof personDeleteResponseSchema>;

export const pageRefListResponseSchema = z.object({ items: z.array(leadPageRefSchema) });
export type PageRefListResponse = z.infer<typeof pageRefListResponseSchema>;

/**
 * The JSON file of "Xuất dữ liệu người này" (ADR-017): every lead of the person in the site, with
 * the consent text each one agreed to.
 */
export const personExportFileSchema = z.object({
  exportedAt: isoDateTimeSchema,
  site: z.string(),
  leads: z.array(
    z.object({
      createdAt: isoDateTimeSchema,
      name: z.string(),
      phone: z.string(),
      email: z.string().nullable(),
      message: z.string().nullable(),
      page: z.string(),
      pageVersion: z.number().int().positive(),
      source: z.string(),
      campaign: z.string().nullable(),
      device: z.string(),
      status: z.string(),
      note: z.string(),
      consent: z.object({
        at: isoDateTimeSchema,
        version: z.number().int().positive(),
        controllerName: z.string(),
        policyUrl: z.string(),
        requiredText: z.string(),
        marketingText: z.string().nullable(),
        marketing: z.boolean(),
        marketingWithdrawnAt: isoDateTimeSchema.nullable(),
      }),
    }),
  ),
});
export type PersonExportFile = z.infer<typeof personExportFileSchema>;
