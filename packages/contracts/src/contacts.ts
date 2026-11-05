import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import { leadNameSchema, leadPhoneSchema } from './lead.js';
import {
  leadPageRefSchema,
  leadSearchSchema,
  leadSourceSchema,
  leadStatusSchema,
} from './lead-inbox.js';

/**
 * Customers of a site (board 22, ADR-033): one profile per person, gathered from the site's leads
 * by phone number, or added by hand. `leads.view` reads them, `leads.handle` changes them.
 */

export const CONTACT_PAGE_SIZE = 25;
/** Counts shown as numbers stop here ("9.999+"), so counting stays bounded. */
export const CONTACT_COUNT_CAP = 9999;
/** "Thao tác hàng loạt" acts on at most this many profiles at once. */
export const CONTACT_BULK_MAX = 50;
export const CONTACT_TAG_MAX = 30;
export const CONTACT_TAGS_MAX = 20;
/** Different tags a site may use. */
export const SITE_CONTACT_TAGS_MAX = 100;
/** Pairs of "Có thể trùng" read at once. */
export const MERGE_SUGGESTIONS_MAX = 50;

export const contactCountSchema = z.object({
  count: z.number().int().nonnegative().max(CONTACT_COUNT_CAP),
  /** More than `count` profiles match. */
  capped: z.boolean(),
});
export type ContactCount = z.infer<typeof contactCountSchema>;

/** Tất cả, Của tôi, Chưa giao, Có thể trùng. */
export const contactViews = ['all', 'mine', 'unassigned', 'duplicates'] as const;
export const contactViewSchema = z.enum(contactViews);
export type ContactView = z.infer<typeof contactViewSchema>;

export const contactViewLabels: Record<ContactView, string> = {
  all: 'Tất cả',
  mine: 'Của tôi',
  unassigned: 'Chưa giao',
  duplicates: 'Có thể trùng',
};

/** "Bạn có thông tin này từ đâu?": how a profile added by hand came to the team. */
export const manualContactChannels = ['phone_call', 'walk_in', 'message'] as const;
export const manualContactChannelSchema = z.enum(manualContactChannels);
export type ManualContactChannel = z.infer<typeof manualContactChannelSchema>;

export const manualContactChannelLabels: Record<ManualContactChannel, string> = {
  phone_call: 'Khách gọi điện tới phòng khám',
  walk_in: 'Khách đến trực tiếp',
  message: 'Khách nhắn Zalo / Facebook',
};

/** "Thêm tay · khách gọi điện" in the source column. */
export const manualContactChannelShortLabels: Record<ManualContactChannel, string> = {
  phone_call: 'khách gọi điện',
  walk_in: 'khách đến trực tiếp',
  message: 'khách nhắn tin',
};

export const contactTagSchema = z
  .string()
  .trim()
  .min(1, 'Nhập nhãn')
  .max(CONTACT_TAG_MAX, `Nhãn tối đa ${CONTACT_TAG_MAX} ký tự`);

/** A member a profile can be given to: they hold `leads.view` on the site. */
export const contactPersonSchema = z.object({ id: idSchema, name: z.string() });
export type ContactPerson = z.infer<typeof contactPersonSchema>;

/** Where the profile comes from: the last lead's page and source, or the channel it was added by. */
export const contactSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('lead'),
    page: leadPageRefSchema,
    source: leadSourceSchema.pick({ source: true, medium: true }),
  }),
  z.object({ kind: z.literal('manual'), channel: manualContactChannelSchema }),
]);
export type ContactSource = z.infer<typeof contactSourceSchema>;

export const contactListItemSchema = z.object({
  id: idSchema,
  name: z.string(),
  /** E.164; `formatLeadPhone` writes it for people. */
  phone: z.string().nullable(),
  email: z.string().nullable(),
  source: contactSourceSchema,
  leadCount: z.number().int().nonnegative(),
  owner: contactPersonSchema.nullable(),
  tags: z.array(z.string()),
  /** Part of an open "Có thể trùng" pair. */
  possibleDuplicate: z.boolean(),
  /** The "Cơ hội" column: the open opportunity moved last, else the latest closed one. */
  opportunity: z
    .object({ stage: leadStatusSchema, value: z.number().int().nonnegative().nullable() })
    .nullable(),
  lastActivityAt: isoDateTimeSchema,
});
export type ContactListItem = z.infer<typeof contactListItemSchema>;

const contactListShape = {
  view: contactViewSchema.exclude(['duplicates']).default('all'),
  ownerId: idSchema.optional(),
  tag: contactTagSchema.optional(),
  cursor: z.string().max(200).optional(),
};

/**
 * Query of `GET /sites/:siteId/contacts`: a view, the filters and the page. A search never goes in
 * the URL, so the schema refuses `q`; `contactSearchRequestSchema` carries it instead (rule 10).
 */
export const contactListQuerySchema = z.strictObject(contactListShape);
export type ContactListRequest = z.input<typeof contactListQuerySchema>;

/** Body of `POST /sites/:siteId/contacts/search`: the same list narrowed by a search. */
export const contactSearchRequestSchema = z.strictObject({
  ...contactListShape,
  q: leadSearchSchema.refine((value) => value !== '', 'Nhập từ khóa tìm kiếm'),
});
export type ContactSearchRequest = z.input<typeof contactSearchRequestSchema>;

/** A list request as the API reads it, with or without a search. */
export type ContactListQuery = z.output<typeof contactListQuerySchema> & { q?: string | undefined };

export const contactListResponseSchema = z.object({
  /** Most recent interaction first. */
  items: z.array(contactListItemSchema),
  nextCursor: z.string().nullable(),
  /** Profiles of each view under the same filters: "Tất cả · 312", "Có thể trùng · 4". */
  counts: z.record(contactViewSchema, contactCountSchema),
});
export type ContactListResponse = z.infer<typeof contactListResponseSchema>;

/** The choices of the filters and of "Giao cho…": the site's members and its tags. */
export const contactOptionsResponseSchema = z.object({
  assignees: z.array(contactPersonSchema),
  tags: z.array(z.string()),
});
export type ContactOptionsResponse = z.infer<typeof contactOptionsResponseSchema>;

/** "Thêm khách hàng": a name, a phone number and where the information came from. */
export const createContactRequestSchema = z.strictObject({
  name: leadNameSchema,
  phone: leadPhoneSchema,
  channel: manualContactChannelSchema,
  /** Ticked only when the person said so; stored with who recorded it and when. */
  marketing: z.boolean().default(false),
});
export type CreateContactRequest = z.input<typeof createContactRequestSchema>;
export type CreateContactValues = z.output<typeof createContactRequestSchema>;

export const createContactResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('created'), contact: contactListItemSchema }),
  /** The number already belongs to a profile: the dialog points to it instead of a duplicate. */
  z.object({ status: z.literal('exists'), contact: contactPersonSchema }),
]);
export type CreateContactResponse = z.infer<typeof createContactResponseSchema>;

const bulkIdsSchema = z
  .array(idSchema)
  .min(1, 'Chọn ít nhất một khách hàng')
  .max(CONTACT_BULK_MAX, `Chọn tối đa ${CONTACT_BULK_MAX} khách hàng`)
  .refine((ids) => new Set(ids).size === ids.length, 'Có khách hàng được chọn hai lần');

/** "Giao cho…" (null: "Bỏ giao") and "Gắn nhãn…" on the selected profiles. */
export const contactBulkRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('assign'),
    contactIds: bulkIdsSchema,
    ownerId: idSchema.nullable(),
  }),
  z.strictObject({ action: z.literal('tag'), contactIds: bulkIdsSchema, tag: contactTagSchema }),
]);
export type ContactBulkRequest = z.input<typeof contactBulkRequestSchema>;
export type ContactBulkValues = z.output<typeof contactBulkRequestSchema>;

export const contactBulkResponseSchema = z.object({
  /** Profiles changed; those deleted meanwhile are left out. */
  updated: z.number().int().nonnegative(),
});
export type ContactBulkResponse = z.infer<typeof contactBulkResponseSchema>;

/** Why two profiles may be one person (ADR-033). */
export const mergeReasonSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('email') }),
  z.object({
    kind: z.literal('name_page'),
    page: leadPageRefSchema,
    /** Days between their leads on that page, 0 to 7. */
    days: z.number().int().min(0).max(7),
  }),
]);
export type MergeReason = z.infer<typeof mergeReasonSchema>;

/** One side of the comparison table. */
export const mergeSideSchema = z.object({
  id: idSchema,
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  owner: contactPersonSchema.nullable(),
  /** When the person agreed to offers, null when they did not. */
  marketingAt: isoDateTimeSchema.nullable(),
  leadCount: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
});
export type MergeSide = z.infer<typeof mergeSideSchema>;

export const mergeSuggestionSchema = z.object({
  id: idSchema,
  reason: mergeReasonSchema,
  /** The older profile first: it is the one kept. */
  a: mergeSideSchema,
  b: mergeSideSchema,
});
export type MergeSuggestion = z.infer<typeof mergeSuggestionSchema>;

export const mergeSuggestionListResponseSchema = z.object({
  /** Oldest suggestion first, at most `MERGE_SUGGESTIONS_MAX`. */
  items: z.array(mergeSuggestionSchema),
  total: contactCountSchema,
});
export type MergeSuggestionListResponse = z.infer<typeof mergeSuggestionListResponseSchema>;

/** The fields of the comparison; each one is taken from the side picked. */
export const mergeFields = ['name', 'phone', 'email', 'owner', 'marketing'] as const;
export const mergeFieldSchema = z.enum(mergeFields);
export type MergeField = z.infer<typeof mergeFieldSchema>;

export const mergeFieldLabels: Record<MergeField, string> = {
  name: 'Họ và tên',
  phone: 'Số điện thoại',
  email: 'Email',
  owner: 'Người phụ trách',
  marketing: 'Nhận ưu đãi',
};

export const mergeSideChoiceSchema = z.enum(['a', 'b']);
export type MergeSideChoice = z.infer<typeof mergeSideChoiceSchema>;

/** "Gộp hai hồ sơ": the side each field is taken from; the profile kept is always `a`. */
export const mergeContactsRequestSchema = z.strictObject({
  picks: z.strictObject({
    name: mergeSideChoiceSchema,
    phone: mergeSideChoiceSchema,
    email: mergeSideChoiceSchema,
    owner: mergeSideChoiceSchema,
    marketing: mergeSideChoiceSchema,
  }),
});
export type MergeContactsRequest = z.infer<typeof mergeContactsRequestSchema>;

export const mergeContactsResponseSchema = z.object({ contact: contactListItemSchema });
export type MergeContactsResponse = z.infer<typeof mergeContactsResponseSchema>;
