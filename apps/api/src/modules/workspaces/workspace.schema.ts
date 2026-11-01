import { type Role, roleSchema } from '@plp/contracts';
import { Schema, type Types } from 'mongoose';

export const WORKSPACE_MODEL = 'Workspace';
export const MEMBERSHIP_MODEL = 'Membership';

export interface WorkspaceRecord {
  _id: Types.ObjectId;
  name: string;
  /**
   * Sites created in the workspace so far. Every site creation increments it in its transaction,
   * so two concurrent creations write the same document and MongoDB retries the later one, which
   * then counts the other's site against the limit (ADR-014).
   */
  siteSeq: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

export const workspaceSchema = new Schema<WorkspaceRecord>(
  {
    name: { type: String, required: true },
    siteSeq: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'workspaces', versionKey: false },
);

export interface MembershipRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  userId: Types.ObjectId;
  role: Role;
  /**
   * Sites the member may open; null (or absent, before ADR-020) is the whole workspace. Always
   * null for Chủ sở hữu and Quản trị.
   */
  siteIds?: Types.ObjectId[] | null;
  createdAt: Date;
}

export const membershipSchema = new Schema<MembershipRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    role: { type: String, enum: roleSchema.options, required: true },
    siteIds: { type: [Schema.Types.ObjectId], default: null },
    createdAt: { type: Date, required: true },
  },
  { collection: 'memberships', versionKey: false },
);
membershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ userId: 1, createdAt: 1 });
