import {
  type AiBrief,
  type AiFailure,
  aiFailureCodes,
  type AiJobStatus,
  aiJobStatusIds,
  type AiSectionStatus,
  aiSectionStatusIds,
  type SectionType,
} from '@plp/contracts';
import { Schema, type Types } from 'mongoose';
import { workspaceCollection } from '../../shared/persistence/workspace-databases.js';

const AI_JOB_MODEL = 'AiJob';
export const AI_JOBS_RUNNING_INDEX = 'ai_jobs_running';

export interface AiJobSectionRecord {
  /** The id the section gets in the draft. */
  id: string;
  type: SectionType;
  variant: string;
  status: AiSectionStatus;
  failure: AiFailure | null;
}

/** The run in progress: a random id each of its writes names, and when a reader may end it. */
export interface AiJobRunRecord {
  id: string;
  deadline: Date;
}

/**
 * "Viết nội dung" of board 20 (ADR-031): what the user asked for, how far the sections got and
 * the use it reserved. A run and every way it ends (written, nothing written, cancelled, past its
 * deadline) are conditional updates on `run.id` while `status` is `running`, so exactly one of them
 * ends a run, and the use is given back once.
 */
export interface AiJobRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  siteId: Types.ObjectId;
  createdBy: Types.ObjectId;
  /** The page's title and slug, as the user gave them. */
  title: string;
  slug: string;
  brief: AiBrief;
  sections: AiJobSectionRecord[];
  status: AiJobStatus;
  run: AiJobRunRecord | null;
  /** The month the use was reserved in, and whether it was given back. */
  quota: { month: string; refunded: boolean };
  /** The draft the job created, and the revision it last wrote ("Thử lại" writes on top of it). */
  pageId: Types.ObjectId | null;
  pageRevision: number | null;
  /** "Thử lại" runs so far, at most `AI_RETRIES_PER_JOB`. */
  retries: number;
  failure: AiFailure | null;
  createdAt: Date;
  updatedAt: Date;
  /** Deleted then (TTL): a job is a work record, the brief need not stay. */
  expiresAt: Date;
}

const sectionSchema = new Schema<AiJobSectionRecord>(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    variant: { type: String, required: true },
    status: { type: String, enum: aiSectionStatusIds, required: true },
    failure: { type: String, enum: [...aiFailureCodes, null], default: null },
  },
  { _id: false },
);

const aiJobSchema = new Schema<AiJobRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    siteId: { type: Schema.Types.ObjectId, required: true },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
    slug: { type: String, default: '' },
    brief: { type: Schema.Types.Mixed, required: true },
    sections: { type: [sectionSchema], required: true },
    status: { type: String, enum: aiJobStatusIds, required: true },
    run: {
      type: new Schema<AiJobRunRecord>(
        { id: { type: String, required: true }, deadline: { type: Date, required: true } },
        { _id: false },
      ),
      default: null,
    },
    quota: {
      month: { type: String, required: true },
      refunded: { type: Boolean, required: true },
    },
    pageId: { type: Schema.Types.ObjectId, default: null },
    pageRevision: { type: Number, default: null },
    retries: { type: Number, required: true, min: 0 },
    failure: { type: String, enum: [...aiFailureCodes, null], default: null },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'ai_jobs', versionKey: false, minimize: false },
);
// Runs past their deadline: a reader of the workspace's usage or of a job, and startup, end them.
aiJobSchema.index(
  { workspaceId: 1, status: 1, 'run.deadline': 1 },
  { name: AI_JOBS_RUNNING_INDEX },
);
aiJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** In the workspace's own database (ADR-025). */
export const AI_JOB_COLLECTION = workspaceCollection(AI_JOB_MODEL, aiJobSchema);
