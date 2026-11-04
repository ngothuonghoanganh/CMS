import { type ManualContactChannel, manualContactChannels } from '@plp/contracts';
import { Schema, type Types } from 'mongoose';
import { workspaceCollection } from '../../shared/persistence/workspace-databases.js';

export const CONTACT_MODEL = 'Contact';
export const CONTACTS_PHONE_INDEX = 'contacts_site_phone_unique';

/** Normalized keys a search and the duplicate checks match on, as for leads (ADR-018). */
export interface ContactSearchKeys {
  /** Digits of the E.164 number without "+"; null without a phone number. */
  phone: string | null;
  email: string | null;
  /** Lower case, accents removed. */
  name: string;
}

/** Where a profile comes from (ADR-033): a lead, or a member who added it by hand. */
export type ContactOrigin =
  | { kind: 'lead' }
  | { kind: 'manual'; channel: ManualContactChannel; addedBy: Types.ObjectId; at: Date };

/**
 * Whether the person agreed to offers: from their leads, or as a member recorded it on a profile
 * added by hand ("chỉ tick khi khách nói rõ").
 */
export interface ContactMarketing {
  consented: boolean;
  at: Date | null;
  /** The member who recorded it; null when it comes from a lead. */
  recordedBy: Types.ObjectId | null;
}

/** The last lead of the profile: the source column of board 22. */
export interface ContactLastLead {
  pageId: Types.ObjectId;
  source: string;
  medium: string;
  at: Date;
}

/**
 * A person of one site (ADR-033): the leads with their phone number, or a profile added by hand.
 * Personal data: never logged (rule 10). Removed by the TTL index at `expiresAt` (ADR-017).
 */
export interface ContactRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  siteId: Types.ObjectId;
  name: string;
  /** E.164; unique within the site. */
  phone: string | null;
  email: string | null;
  search: ContactSearchKeys;
  ownerId: Types.ObjectId | null;
  tags: string[];
  origin: ContactOrigin;
  marketing: ContactMarketing;
  leadCount: number;
  lastLead: ContactLastLead | null;
  lastActivityAt: Date;
  createdAt: Date;
  /** Null when the site keeps leads until they are deleted by hand. */
  expiresAt: Date | null;
}

const contactSchema = new Schema<ContactRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    siteId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    phone: { type: String, default: null },
    email: { type: String, default: null },
    search: {
      phone: { type: String, default: null },
      email: { type: String, default: null },
      name: { type: String, required: true },
    },
    ownerId: { type: Schema.Types.ObjectId, default: null },
    tags: { type: [String], default: [] },
    origin: {
      kind: { type: String, enum: ['lead', 'manual'], required: true },
      channel: { type: String, enum: manualContactChannels },
      addedBy: { type: Schema.Types.ObjectId },
      at: { type: Date },
    },
    marketing: {
      consented: { type: Boolean, required: true },
      at: { type: Date, default: null },
      recordedBy: { type: Schema.Types.ObjectId, default: null },
    },
    leadCount: { type: Number, required: true, min: 0 },
    lastLead: {
      type: new Schema(
        {
          pageId: { type: Schema.Types.ObjectId, required: true },
          source: { type: String, required: true },
          medium: { type: String, required: true },
          at: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    lastActivityAt: { type: Date, required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, default: null },
  },
  { collection: 'contacts', versionKey: false },
);
// A lead joins the profile with its phone number, in the transaction that stores it (ADR-033).
contactSchema.index(
  { siteId: 1, phone: 1 },
  {
    unique: true,
    name: CONTACTS_PHONE_INDEX,
    partialFilterExpression: { phone: { $type: 'string' } },
  },
);
// The views of board 22, most recent interaction first; every query starts inside one site.
contactSchema.index({ siteId: 1, lastActivityAt: -1, _id: -1 }, { name: 'contacts_recent' });
contactSchema.index(
  { siteId: 1, ownerId: 1, lastActivityAt: -1, _id: -1 },
  { name: 'contacts_owner' },
);
contactSchema.index({ siteId: 1, tags: 1, lastActivityAt: -1, _id: -1 }, { name: 'contacts_tag' });
// Search by the start of a phone number or an email, and the duplicate check by email.
contactSchema.index({ siteId: 1, 'search.phone': 1 }, { name: 'contacts_search_phone' });
contactSchema.index({ siteId: 1, 'search.email': 1 }, { name: 'contacts_search_email' });
contactSchema.index({ siteId: 1, 'search.name': 1 }, { name: 'contacts_search_name' });
contactSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const MERGE_SUGGESTION_MODEL = 'MergeSuggestion';
export const MERGE_SUGGESTIONS_PAIR_INDEX = 'merge_suggestions_pair_unique';

export type StoredMergeReason =
  { kind: 'email' } | { kind: 'name_page'; pageId: Types.ObjectId; days: number };

/**
 * Two profiles of a site that may be one person ("Có thể trùng", ADR-033). A dismissed pair is
 * kept, so it is not suggested again. It expires with the first of its profiles, and goes with
 * either of them when it is merged or deleted.
 */
export interface MergeSuggestionRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  siteId: Types.ObjectId;
  /** The two profile ids in ascending order. */
  contactIds: [Types.ObjectId, Types.ObjectId];
  /** `contactIds` joined: one suggestion per pair. */
  pairKey: string;
  reason: StoredMergeReason;
  dismissedAt: Date | null;
  createdAt: Date;
  expiresAt: Date | null;
}

const mergeSuggestionSchema = new Schema<MergeSuggestionRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    siteId: { type: Schema.Types.ObjectId, required: true },
    contactIds: { type: [Schema.Types.ObjectId], required: true },
    pairKey: { type: String, required: true },
    reason: {
      kind: { type: String, enum: ['email', 'name_page'], required: true },
      pageId: { type: Schema.Types.ObjectId },
      days: { type: Number, min: 0, max: 7 },
    },
    dismissedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, default: null },
  },
  { collection: 'merge_suggestions', versionKey: false },
);
mergeSuggestionSchema.index(
  { siteId: 1, pairKey: 1 },
  { unique: true, name: MERGE_SUGGESTIONS_PAIR_INDEX },
);
// The open pairs of a site, oldest first; and the pairs of a profile.
mergeSuggestionSchema.index(
  { siteId: 1, dismissedAt: 1, createdAt: 1, _id: 1 },
  { name: 'merge_suggestions_open' },
);
mergeSuggestionSchema.index({ siteId: 1, contactIds: 1 }, { name: 'merge_suggestions_contact' });
mergeSuggestionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** In the workspace's own database (ADR-025). */
export const CONTACT_COLLECTION = workspaceCollection(CONTACT_MODEL, contactSchema);
export const MERGE_SUGGESTION_COLLECTION = workspaceCollection(
  MERGE_SUGGESTION_MODEL,
  mergeSuggestionSchema,
);
