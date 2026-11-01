import { type AssignableRole, assignableRoleSchema } from '@plp/contracts';
import { Schema, type Types } from 'mongoose';

export const INVITATION_MODEL = 'Invitation';
export const INVITATION_TOKEN_INDEX = 'invitations_token_unique';
export const INVITATION_PENDING_EMAIL_INDEX = 'invitations_pending_email_unique';

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'declined';

/** An invitation to a workspace (ADR-021). Only the sha256 of its link's token is stored. */
export interface InvitationRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  email: string;
  role: AssignableRole;
  siteIds: Types.ObjectId[] | null;
  tokenHash: string;
  /** The link stops working at this time; "Gửi lại" moves it. */
  expiresAt: Date;
  invitedBy: Types.ObjectId;
  createdAt: Date;
  /** When the email last went out; null when it failed. */
  sentAt: Date | null;
  status: InvitationStatus;
  closedAt: Date | null;
  /** MongoDB deletes the invitation then (TTL): 30 days after it closed or expired. */
  purgeAt: Date;
}

export const invitationSchema = new Schema<InvitationRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    email: { type: String, required: true },
    role: { type: String, enum: assignableRoleSchema.options, required: true },
    siteIds: { type: [Schema.Types.ObjectId], default: null },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    invitedBy: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
    sentAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'revoked', 'declined'],
      required: true,
    },
    closedAt: { type: Date, default: null },
    purgeAt: { type: Date, required: true },
  },
  { collection: 'invitations', versionKey: false },
);
invitationSchema.index({ tokenHash: 1 }, { unique: true, name: INVITATION_TOKEN_INDEX });
// One pending invitation per email and workspace.
invitationSchema.index(
  { workspaceId: 1, email: 1 },
  {
    unique: true,
    name: INVITATION_PENDING_EMAIL_INDEX,
    partialFilterExpression: { status: 'pending' },
  },
);
invitationSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });
invitationSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
