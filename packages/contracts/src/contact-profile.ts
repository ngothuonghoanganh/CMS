import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import { contactPersonSchema, contactTagSchema, manualContactChannelSchema } from './contacts.js';
import { leadEmailSchema, leadNameSchema, leadPhoneSchema } from './lead.js';
import { leadPageRefSchema, personExportFileSchema } from './lead-inbox.js';

/**
 * A customer's profile (board 23, ADR-033): notes, tasks and meetings, the timeline, and the
 * person's data. `leads.view` reads it, `leads.handle` writes to it; exporting needs
 * `leads.export` and editing or deleting the person's data `personalData.manage`.
 */

export const CONTACT_NOTE_MAX = 2000;
export const TASK_TITLE_MAX = 120;
export const MEETING_PLACE_MAX = 120;
export const MEETING_WITH_MAX = 80;
export const MEETING_NOTE_MAX = 500;
/** Timeline entries per page, newest first. */
export const TIMELINE_PAGE_SIZE = 20;
/** Open tasks a profile may hold, so the column stays one bounded read. */
export const CONTACT_OPEN_TASKS_MAX = 50;
/** Done tasks shown under the open ones, latest first. */
export const CONTACT_DONE_TASKS_SHOWN = 3;
/** Meetings ahead a profile may hold. */
export const CONTACT_UPCOMING_MEETINGS_MAX = 20;

/** The agreement to process the data, from the latest lead: the evidence lives on that lead. */
export const profileProcessingConsentSchema = z.object({
  leadId: idSchema,
  at: isoDateTimeSchema,
  /** The consent text's version; null when the page's release kept none. */
  version: z.number().int().positive().nullable(),
  page: leadPageRefSchema,
  pageVersion: z.number().int().positive(),
});
export type ProfileProcessingConsent = z.infer<typeof profileProcessingConsentSchema>;

export const contactProfileSchema = z.object({
  id: idSchema,
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  owner: contactPersonSchema.nullable(),
  tags: z.array(z.string()),
  origin: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('lead') }),
    z.object({
      kind: z.literal('manual'),
      channel: manualContactChannelSchema,
      addedBy: contactPersonSchema.nullable(),
      at: isoDateTimeSchema,
    }),
  ]),
  consent: z.object({
    /** Null for a profile added by hand whose person never sent a form. */
    processing: profileProcessingConsentSchema.nullable(),
    marketing: z.object({ consented: z.boolean(), at: isoDateTimeSchema.nullable() }),
  }),
  leadCount: z.number().int().nonnegative(),
  /** What the member may do here; the menu says why an action is missing (board 23). */
  can: z.object({ handle: z.boolean(), export: z.boolean(), manage: z.boolean() }),
});
export type ContactProfile = z.infer<typeof contactProfileSchema>;

export const contactTaskSchema = z.object({
  id: idSchema,
  title: z.string(),
  dueAt: isoDateTimeSchema,
  assignee: contactPersonSchema.nullable(),
  doneAt: isoDateTimeSchema.nullable(),
});
export type ContactTask = z.infer<typeof contactTaskSchema>;

export const contactMeetingSchema = z.object({
  id: idSchema,
  at: isoDateTimeSchema,
  place: z.string(),
  with: z.string(),
  note: z.string(),
});
export type ContactMeeting = z.infer<typeof contactMeetingSchema>;

export const contactProfileResponseSchema = z.object({
  contact: contactProfileSchema,
  /** Open tasks by due time, then the latest done ones. */
  tasks: z.array(contactTaskSchema),
  /** Meetings from now on, soonest first. */
  meetings: z.array(contactMeetingSchema),
});
export type ContactProfileResponse = z.infer<typeof contactProfileResponseSchema>;

/** One entry of "Dòng thời gian". A lead is read from the lead itself, which stays the evidence. */
export const timelineEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('lead'),
    id: idSchema,
    at: isoDateTimeSchema,
    page: leadPageRefSchema,
    message: z.string().nullable(),
    source: z.string(),
    medium: z.string(),
    campaign: z.string().nullable(),
    consentVersion: z.number().int().positive().nullable(),
    /** Joined an existing profile by its phone number ("tự gom vào hồ sơ"). */
    joined: z.boolean(),
  }),
  z.object({
    kind: z.literal('note'),
    id: idSchema,
    at: isoDateTimeSchema,
    actor: contactPersonSchema.nullable(),
    text: z.string(),
  }),
  z.object({
    kind: z.literal('meeting'),
    id: idSchema,
    at: isoDateTimeSchema,
    actor: contactPersonSchema.nullable(),
    meeting: contactMeetingSchema.omit({ id: true }),
  }),
]);
export type TimelineEntry = z.infer<typeof timelineEntrySchema>;

export const timelineQuerySchema = z.strictObject({
  cursor: z.string().min(1).max(200).optional(),
});
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;

export const timelineResponseSchema = z.object({
  items: z.array(timelineEntrySchema),
  nextCursor: z.string().nullable(),
});
export type TimelineResponse = z.infer<typeof timelineResponseSchema>;

export const createNoteRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Nhập ghi chú')
    .max(CONTACT_NOTE_MAX, `Ghi chú tối đa ${CONTACT_NOTE_MAX} ký tự`),
});
export type CreateNoteRequest = z.input<typeof createNoteRequestSchema>;

export const createTaskRequestSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Nhập việc cần làm')
    .max(TASK_TITLE_MAX, `Việc cần làm tối đa ${TASK_TITLE_MAX} ký tự`),
  dueAt: isoDateTimeSchema,
  assigneeId: idSchema,
});
export type CreateTaskRequest = z.input<typeof createTaskRequestSchema>;

export const updateTaskRequestSchema = z.strictObject({ done: z.boolean() });
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>;

export const createMeetingRequestSchema = z.object({
  at: isoDateTimeSchema,
  place: z
    .string()
    .trim()
    .min(1, 'Nhập nơi hẹn')
    .max(MEETING_PLACE_MAX, `Nơi hẹn tối đa ${MEETING_PLACE_MAX} ký tự`),
  with: z.string().trim().max(MEETING_WITH_MAX, `Người gặp tối đa ${MEETING_WITH_MAX} ký tự`),
  note: z.string().trim().max(MEETING_NOTE_MAX, `Nội dung tối đa ${MEETING_NOTE_MAX} ký tự`),
});
export type CreateMeetingRequest = z.input<typeof createMeetingRequestSchema>;

/** The "Thông tin" card: the owner, and one tag added or taken off. */
export const updateContactRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('assign'), ownerId: idSchema.nullable() }),
  z.strictObject({ action: z.literal('add_tag'), tag: contactTagSchema }),
  z.strictObject({ action: z.literal('remove_tag'), tag: contactTagSchema }),
]);
export type UpdateContactRequest = z.input<typeof updateContactRequestSchema>;

/**
 * "Sửa thông tin" (ADR-017): the profile's name, phone number and email, by the rules of the
 * form. The leads keep what the person sent, as evidence.
 */
export const updateContactDetailsRequestSchema = z.object({
  name: leadNameSchema,
  phone: leadPhoneSchema,
  email: leadEmailSchema,
});
export type UpdateContactDetailsRequest = z.input<typeof updateContactDetailsRequestSchema>;
/** As the API receives it: the phone number in E.164, an empty email as null. */
export type UpdateContactDetailsValues = z.output<typeof updateContactDetailsRequestSchema>;

/** A request to delete data that the deletion may complete ("Gắn với yêu cầu dữ liệu"). */
export const deletionRequestOptionSchema = z.object({
  id: idSchema,
  receivedAt: isoDateTimeSchema,
  completeBy: isoDateTimeSchema,
});
export type DeletionRequestOption = z.infer<typeof deletionRequestOptionSchema>;

/** What "Xóa dữ liệu của người này" removes, counted when the dialog opens. */
export const contactDeletionPreviewSchema = z.object({
  leads: z.number().int().nonnegative(),
  notes: z.number().int().nonnegative(),
  tasks: z.number().int().nonnegative(),
  meetings: z.number().int().nonnegative(),
  /** Open requests to delete this person's data, oldest deadline first. */
  requests: z.array(deletionRequestOptionSchema),
});
export type ContactDeletionPreview = z.infer<typeof contactDeletionPreviewSchema>;

export const deleteContactPersonRequestSchema = z.strictObject({ requestId: idSchema.nullable() });
export type DeleteContactPersonRequest = z.infer<typeof deleteContactPersonRequestSchema>;

export const deleteContactPersonResponseSchema = z.object({
  deletedLeads: z.number().int().nonnegative(),
});
export type DeleteContactPersonResponse = z.infer<typeof deleteContactPersonResponseSchema>;

/**
 * "Xuất dữ liệu của người này": the person's leads with their consent evidence, as from the inbox
 * (ADR-017), and the profile with everything recorded about them (ADR-033).
 */
export const contactExportFileSchema = personExportFileSchema.extend({
  contact: z.object({
    name: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    createdAt: isoDateTimeSchema,
    source: z.string(),
    marketing: z.object({ consented: z.boolean(), at: isoDateTimeSchema.nullable() }),
    tags: z.array(z.string()),
  }),
  notes: z.array(z.object({ at: isoDateTimeSchema, text: z.string() })),
  tasks: z.array(
    z.object({ title: z.string(), dueAt: isoDateTimeSchema, doneAt: isoDateTimeSchema.nullable() }),
  ),
  meetings: z.array(
    z.object({ at: isoDateTimeSchema, place: z.string(), with: z.string(), note: z.string() }),
  ),
});
export type ContactExportFile = z.infer<typeof contactExportFileSchema>;
