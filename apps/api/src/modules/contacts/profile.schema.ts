import { Schema, type Types } from 'mongoose';
import { workspaceCollection } from '../../shared/persistence/workspace-databases.js';

/*
 * What a profile records beside its leads (board 23, ADR-033). Each document carries its
 * profile's `expiresAt`, moved with it (`ContactRecordsRepository.alignExpiry`), so the TTL
 * removes them with the profile. Personal data: never logged (rule 10).
 */

export const CONTACT_EVENT_MODEL = 'ContactEvent';
export const TASK_MODEL = 'Task';
export const MEETING_MODEL = 'Meeting';

/** The meeting as it was booked, so the timeline still reads it after the booking changed. */
export interface MeetingSnapshot {
  at: Date;
  place: string;
  with: string;
  note: string;
}

export const contactEventKinds = ['note', 'meeting'] as const;
export type ContactEventKind = (typeof contactEventKinds)[number];

/**
 * An entry of "Dòng thời gian". Append only; leads are read from the leads themselves. A note has
 * `text`; a meeting has `meetingId` and `meeting`.
 */
export interface ContactEventRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  siteId: Types.ObjectId;
  contactId: Types.ObjectId;
  kind: ContactEventKind;
  at: Date;
  actorId: Types.ObjectId | null;
  text: string | null;
  meetingId: Types.ObjectId | null;
  meeting: MeetingSnapshot | null;
  expiresAt: Date | null;
}

const meetingSnapshotSchema = new Schema<MeetingSnapshot>(
  {
    at: { type: Date, required: true },
    place: { type: String, required: true },
    with: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { _id: false },
);

const contactEventSchema = new Schema<ContactEventRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    siteId: { type: Schema.Types.ObjectId, required: true },
    contactId: { type: Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: contactEventKinds, required: true },
    at: { type: Date, required: true },
    actorId: { type: Schema.Types.ObjectId, default: null },
    text: { type: String, default: null },
    meetingId: { type: Schema.Types.ObjectId, default: null },
    meeting: { type: meetingSnapshotSchema, default: null },
    expiresAt: { type: Date, default: null },
  },
  { collection: 'contact_events', versionKey: false },
);
// The timeline, newest first. Moving the expiry reads a profile's records through the same
// `contactId` prefix: a profile holds few of them.
contactEventSchema.index({ contactId: 1, at: -1, _id: -1 }, { name: 'contact_events_timeline' });
contactEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** "Quá hạn" is derived: `dueAt` passed and not done; never stored. */
export interface TaskRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  siteId: Types.ObjectId;
  contactId: Types.ObjectId;
  /** Set by the pipeline (K3); null until then. */
  opportunityId: Types.ObjectId | null;
  title: string;
  dueAt: Date;
  assigneeId: Types.ObjectId;
  doneAt: Date | null;
  createdBy: Types.ObjectId;
  source: 'user' | 'automation';
  createdAt: Date;
  expiresAt: Date | null;
}

const taskSchema = new Schema<TaskRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    siteId: { type: Schema.Types.ObjectId, required: true },
    contactId: { type: Schema.Types.ObjectId, required: true },
    opportunityId: { type: Schema.Types.ObjectId, default: null },
    title: { type: String, required: true },
    dueAt: { type: Date, required: true },
    assigneeId: { type: Schema.Types.ObjectId, required: true },
    doneAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    source: { type: String, enum: ['user', 'automation'], required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, default: null },
  },
  { collection: 'tasks', versionKey: false },
);
// The profile's open tasks by due time, and its done ones latest first.
taskSchema.index({ contactId: 1, doneAt: 1, dueAt: 1, _id: 1 }, { name: 'tasks_contact' });
taskSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export interface MeetingRecord extends MeetingSnapshot {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  siteId: Types.ObjectId;
  contactId: Types.ObjectId;
  opportunityId: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  expiresAt: Date | null;
}

const meetingSchema = new Schema<MeetingRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    siteId: { type: Schema.Types.ObjectId, required: true },
    contactId: { type: Schema.Types.ObjectId, required: true },
    opportunityId: { type: Schema.Types.ObjectId, default: null },
    at: { type: Date, required: true },
    place: { type: String, required: true },
    with: { type: String, default: '' },
    note: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, default: null },
  },
  { collection: 'meetings', versionKey: false },
);
// "Lịch hẹn sắp tới", soonest first.
meetingSchema.index({ contactId: 1, at: 1, _id: 1 }, { name: 'meetings_contact' });
meetingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** In the workspace's own database (ADR-025). */
export const CONTACT_EVENT_COLLECTION = workspaceCollection(
  CONTACT_EVENT_MODEL,
  contactEventSchema,
);
export const TASK_COLLECTION = workspaceCollection(TASK_MODEL, taskSchema);
export const MEETING_COLLECTION = workspaceCollection(MEETING_MODEL, meetingSchema);
