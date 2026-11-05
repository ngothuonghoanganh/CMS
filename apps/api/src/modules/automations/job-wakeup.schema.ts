import { Schema, type Types } from 'mongoose';

export const JOB_WAKEUP_MODEL = 'JobWakeup';
export const JOB_WAKEUPS_WORKSPACE_INDEX = 'job_wakeups_workspace_unique';

/** "Nothing due": a workspace whose queue is empty keeps its document with this time. */
export const NOTHING_DUE = new Date('9999-12-31T00:00:00.000Z');

/**
 * When the queue of a workspace has work next (ADR-034), in the master: routing data, never the
 * customers' data. Every instance sets one timer to the earliest, and a change stream on this
 * collection wakes it when another instance adds earlier work. `seq` counts the changes, so an
 * instance that finished a workspace only clears the time it saw.
 */
export interface JobWakeupRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  dueAt: Date;
  seq: number;
}

export const jobWakeupSchema = new Schema<JobWakeupRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    dueAt: { type: Date, required: true },
    seq: { type: Number, required: true, min: 0 },
  },
  { collection: 'job_wakeups', versionKey: false },
);
jobWakeupSchema.index({ workspaceId: 1 }, { unique: true, name: JOB_WAKEUPS_WORKSPACE_INDEX });
jobWakeupSchema.index({ dueAt: 1 }, { name: 'job_wakeups_due' });
