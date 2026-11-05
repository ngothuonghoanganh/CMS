import {
  type LostReason,
  lostReasons,
  type OpportunityStage,
  opportunityStages,
} from '@plp/contracts';
import { Schema, type Types } from 'mongoose';
import { workspaceCollection } from '../../shared/persistence/workspace-databases.js';

export const OPPORTUNITY_MODEL = 'Opportunity';

/** "Đánh dấu thắng": the actual value and the closing day; null value for a lead won before K3. */
export interface OpportunityWon {
  value: number | null;
  /** A Vietnamese calendar day, "2026-11-01". */
  on: string;
}

/**
 * A need of one customer going through the fixed pipeline (board 24, ADR-033). Its leads' status
 * is its stage. It expires with its profile (`ContactRecordsRepository.alignExpiry`).
 */
export interface OpportunityRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  siteId: Types.ObjectId;
  contactId: Types.ObjectId;
  title: string;
  stage: OpportunityStage;
  /** Expected value in whole đồng. */
  value: number | null;
  valueBy: Types.ObjectId | null;
  won: OpportunityWon | null;
  lost: { reason: LostReason; note: string } | null;
  ownerId: Types.ObjectId | null;
  /** The page of the lead that opened it; null when a member created it. */
  sourcePageId: Types.ObjectId | null;
  stageChangedAt: Date;
  createdAt: Date;
  expiresAt: Date | null;
}

const opportunitySchema = new Schema<OpportunityRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    siteId: { type: Schema.Types.ObjectId, required: true },
    contactId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
    stage: { type: String, enum: opportunityStages, required: true },
    value: { type: Number, default: null },
    valueBy: { type: Schema.Types.ObjectId, default: null },
    won: {
      type: new Schema<OpportunityWon>(
        { value: { type: Number, default: null }, on: { type: String, required: true } },
        { _id: false },
      ),
      default: null,
    },
    lost: {
      type: new Schema(
        {
          reason: { type: String, enum: lostReasons, required: true },
          note: { type: String, default: '' },
        },
        { _id: false },
      ),
      default: null,
    },
    ownerId: { type: Schema.Types.ObjectId, default: null },
    sourcePageId: { type: Schema.Types.ObjectId, default: null },
    stageChangedAt: { type: Date, required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, default: null },
  },
  { collection: 'opportunities', versionKey: false },
);
// A column of the board, most recently moved first; "Thắng" and "Thua" of the month by the same
// key. The owner filter narrows a site's few hundred open cards.
opportunitySchema.index(
  { siteId: 1, stage: 1, stageChangedAt: -1, _id: -1 },
  { name: 'opportunities_board' },
);
// A profile's opportunities, its open one first found by stage.
opportunitySchema.index({ contactId: 1, stage: 1 }, { name: 'opportunities_contact' });
opportunitySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** In the workspace's own database (ADR-025). */
export const OPPORTUNITY_COLLECTION = workspaceCollection(OPPORTUNITY_MODEL, opportunitySchema);
