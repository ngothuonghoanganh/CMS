import {
  type DataRequestLogAction,
  dataRequestLogActions,
  type DataRequestStatus,
  dataRequestStatuses,
  type DataRequestType,
  dataRequestTypes,
} from '@plp/contracts';
import { Schema, type Types } from 'mongoose';
import type { LeadSearchKeys } from '../leads/domain/lead-search.js';

export const DATA_REQUEST_MODEL = 'DataRequest';

/** Who made the request: the phone number as E.164, or every field masked once deleted. */
export interface DataRequestContact {
  name: string | null;
  phone: string | null;
  email: string | null;
}

/** One step of a request (`created`, `responded`…): who, when, how many leads. No personal data. */
export interface DataRequestLogRecord {
  at: Date;
  actorId: Types.ObjectId;
  action: DataRequestLogAction;
  count: number | null;
}

/**
 * A request from a person who sent a form (ADR-017), recorded by the owner. Personal data until a
 * completed deletion masks the contact and drops the search keys: never logged, never copied into
 * activity (rule 10).
 */
export interface DataRequestRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  siteId: Types.ObjectId;
  contact: DataRequestContact;
  /** The contact holds masked values ("0987 *** 223") after a completed deletion. */
  masked: boolean;
  /** Keys that find the person's leads (`LeadSearchKeys` form); null once their data is deleted. */
  search: { phone: LeadSearchKeys['phone'] | null; email: string | null } | null;
  type: DataRequestType;
  status: DataRequestStatus;
  receivedAt: Date;
  respondBy: Date;
  completeBy: Date;
  respondedAt: Date | null;
  completedAt: Date | null;
  /** Leads the completion deleted, or withdrew the marketing consent of. */
  completedCount: number | null;
  /** Oldest first, at most `DATA_REQUEST_LOG_MAX` entries. */
  log: DataRequestLogRecord[];
  createdBy: Types.ObjectId;
  createdAt: Date;
}

const logEntrySchema = new Schema<DataRequestLogRecord>(
  {
    at: { type: Date, required: true },
    actorId: { type: Schema.Types.ObjectId, required: true },
    action: { type: String, enum: dataRequestLogActions, required: true },
    count: { type: Number, default: null },
  },
  { _id: false },
);

export const dataRequestSchema = new Schema<DataRequestRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    siteId: { type: Schema.Types.ObjectId, required: true },
    contact: {
      name: { type: String, default: null },
      phone: { type: String, default: null },
      email: { type: String, default: null },
    },
    masked: { type: Boolean, required: true },
    search: {
      type: new Schema(
        { phone: { type: String, default: null }, email: { type: String, default: null } },
        { _id: false },
      ),
      default: null,
    },
    type: { type: String, enum: dataRequestTypes, required: true },
    status: { type: String, enum: dataRequestStatuses, required: true },
    receivedAt: { type: Date, required: true },
    respondBy: { type: Date, required: true },
    completeBy: { type: Date, required: true },
    respondedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    completedCount: { type: Number, default: null },
    log: { type: [logEntrySchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'data_requests', versionKey: false },
);
// The requests of a site, most recently recorded first.
dataRequestSchema.index({ siteId: 1, createdAt: -1, _id: -1 }, { name: 'data_requests_site' });
