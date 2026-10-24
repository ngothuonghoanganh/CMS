import type { Role } from '@plp/contracts';
import { Schema, type Types } from 'mongoose';

export const WORKSPACE_MODEL = 'Workspace';
export const MEMBERSHIP_MODEL = 'Membership';

export interface WorkspaceRecord {
  _id: Types.ObjectId;
  name: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

export const workspaceSchema = new Schema<WorkspaceRecord>(
  {
    name: { type: String, required: true },
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
  createdAt: Date;
}

export const membershipSchema = new Schema<MembershipRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    role: { type: String, enum: ['owner', 'editor'], required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'memberships', versionKey: false },
);
membershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ userId: 1, createdAt: 1 });
