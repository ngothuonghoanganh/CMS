import { Schema, type Types } from 'mongoose';
import { workspaceCollection } from '../../shared/persistence/workspace-databases.js';

const AI_USAGE_MODEL = 'AiUsage';
export const AI_USAGE_MONTH_INDEX = 'ai_usage_month_unique';

/**
 * The AI uses of a workspace in one calendar month in Vietnam (ADR-031), "2026-11". A use is
 * reserved with a conditional `$inc` before any AI request and given back when nothing is written.
 */
export interface AiUsageRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  month: string;
  used: number;
  createdAt: Date;
  updatedAt: Date;
}

const aiUsageSchema = new Schema<AiUsageRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    month: { type: String, required: true },
    used: { type: Number, required: true, min: 0 },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'ai_usage', versionKey: false },
);
aiUsageSchema.index({ workspaceId: 1, month: 1 }, { unique: true, name: AI_USAGE_MONTH_INDEX });

/** In the workspace's own database (ADR-025). */
export const AI_USAGE_COLLECTION = workspaceCollection(AI_USAGE_MODEL, aiUsageSchema);
