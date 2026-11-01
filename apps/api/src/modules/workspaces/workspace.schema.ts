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
  /**
   * Batches of invitations created so far. Each batch increments it in its transaction, so two at
   * once write the same document and the later one counts the other's invitations against the
   * member limit (ADR-021). Absent on workspaces that never invited anyone.
   */
  inviteSeq?: number;
  /**
   * Custom roles created so far; each creation increments it in its transaction, so two at once
   * count each other against the limit (ADR-024).
   */
  customRoleSeq?: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

export const workspaceSchema = new Schema<WorkspaceRecord>(
  {
    name: { type: String, required: true },
    siteSeq: { type: Number, default: 0 },
    inviteSeq: { type: Number, default: 0 },
    customRoleSeq: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'workspaces', versionKey: false },
);

/** A role as stored: a system role, or `custom` with `customRoleId` (ADR-024). */
export type StoredRole = Role | 'custom';

export interface MembershipRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  userId: Types.ObjectId;
  role: StoredRole;
  /** The custom role when `role` is `custom`; absent before ADR-024. */
  customRoleId?: Types.ObjectId | null;
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
    role: { type: String, enum: [...roleSchema.options, 'custom'], required: true },
    customRoleId: { type: Schema.Types.ObjectId, default: null },
    siteIds: { type: [Schema.Types.ObjectId], default: null },
    createdAt: { type: Date, required: true },
  },
  { collection: 'memberships', versionKey: false },
);
membershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ userId: 1, createdAt: 1 });
// Holders of a custom role, counted on board 16 and before a role is deleted (ADR-024).
membershipSchema.index({ workspaceId: 1, customRoleId: 1 });
