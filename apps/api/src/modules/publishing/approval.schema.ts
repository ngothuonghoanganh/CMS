import { Schema, type Types } from 'mongoose';
import { workspaceCollection } from '../../shared/persistence/workspace-databases.js';

const APPROVAL_MODEL = 'PublishApproval';
export const APPROVAL_PENDING_INDEX = 'publish_approvals_pending_unique';

export type ApprovalStatus = 'pending' | 'published' | 'rejected' | 'withdrawn';

/** A request to publish a page, from a role that cannot publish (ADR-023). */
export interface ApprovalRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  siteId: Types.ObjectId;
  pageId: Types.ObjectId;
  requestedBy: Types.ObjectId;
  /** The draft revision it was last sent for. */
  revision: number;
  note: string;
  status: ApprovalStatus;
  createdAt: Date;
  /** When it was last sent: "Gửi lại yêu cầu" moves it. */
  sentAt: Date;
  decidedAt: Date | null;
  decidedBy: Types.ObjectId | null;
  /** Why it was refused. */
  reason: string | null;
  /**
   * The page's release count when it was refused: any later publish raises it, and that publish
   * answers the refusal (a later draft has a revision at least as high). Absent on refusals stored
   * before it existed, which then show until the next request.
   */
  releaseSeq?: number | null;
  /** The release that published it. */
  releaseId: Types.ObjectId | null;
  /** MongoDB deletes a closed request 30 days later (TTL); a pending one stays. */
  purgeAt: Date | null;
}

const approvalSchema = new Schema<ApprovalRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    siteId: { type: Schema.Types.ObjectId, required: true },
    pageId: { type: Schema.Types.ObjectId, required: true },
    requestedBy: { type: Schema.Types.ObjectId, required: true },
    revision: { type: Number, required: true, min: 0 },
    note: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'published', 'rejected', 'withdrawn'],
      required: true,
    },
    createdAt: { type: Date, required: true },
    sentAt: { type: Date, required: true },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: Schema.Types.ObjectId, default: null },
    reason: { type: String, default: null },
    releaseSeq: { type: Number, default: null },
    releaseId: { type: Schema.Types.ObjectId, default: null },
    purgeAt: { type: Date, default: null },
  },
  { collection: 'publish_approvals', versionKey: false },
);
// One pending request per page.
approvalSchema.index(
  { pageId: 1 },
  { unique: true, name: APPROVAL_PENDING_INDEX, partialFilterExpression: { status: 'pending' } },
);
// The latest request of each page, for the page summaries.
approvalSchema.index({ pageId: 1, createdAt: -1 });
approvalSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

/** In the workspace's own database (ADR-025). */
export const APPROVAL_COLLECTION = workspaceCollection(APPROVAL_MODEL, approvalSchema);
