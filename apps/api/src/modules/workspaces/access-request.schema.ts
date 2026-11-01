import { type AssignableRole, assignableRoleSchema } from '@plp/contracts';
import { Schema, type Types } from 'mongoose';

export const ACCESS_REQUEST_MODEL = 'AccessRequest';
export const ACCESS_REQUEST_PENDING_INDEX = 'access_requests_pending_unique';

export type AccessRequestStatus = 'pending' | 'accepted' | 'declined';

/** A member asking Chủ sở hữu for another role (ADR-021). */
export interface AccessRequestRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  userId: Types.ObjectId;
  role: AssignableRole;
  wholeWorkspace: boolean;
  note: string;
  status: AccessRequestStatus;
  createdAt: Date;
  decidedAt: Date | null;
  decidedBy: Types.ObjectId | null;
  /** MongoDB deletes a decided request 30 days later (TTL); a pending one stays. */
  purgeAt: Date | null;
}

export const accessRequestSchema = new Schema<AccessRequestRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    role: { type: String, enum: assignableRoleSchema.options, required: true },
    wholeWorkspace: { type: Boolean, required: true },
    note: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], required: true },
    createdAt: { type: Date, required: true },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: Schema.Types.ObjectId, default: null },
    purgeAt: { type: Date, default: null },
  },
  { collection: 'access_requests', versionKey: false },
);
// One pending request per member and workspace.
accessRequestSchema.index(
  { workspaceId: 1, userId: 1 },
  {
    unique: true,
    name: ACCESS_REQUEST_PENDING_INDEX,
    partialFilterExpression: { status: 'pending' },
  },
);
accessRequestSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });
accessRequestSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
