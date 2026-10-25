import { type ActivityType, activityTypes } from '@plp/contracts';
import { Schema, type Types } from 'mongoose';

export const ACTIVITY_MODEL = 'Activity';

/** Versions and releases an event involves; unused fields stay null (or false). */
export interface ActivityData {
  /** Release version for `page.published` and `page.draft_restored`. */
  version: number | null;
  /** Pointer moves: the live version before and after. */
  fromVersion: number | null;
  toVersion: number | null;
  /** Pointer moves: the live release before and after; undo moves back to `fromReleaseId`. */
  fromReleaseId: Types.ObjectId | null;
  toReleaseId: Types.ObjectId | null;
  /** How many leads an export or a deletion covered; never what they contained (rule 10). */
  count: number | null;
  /** Set after the commit when the renderer could not be revalidated (ADR-009). */
  revalidationFailed: boolean;
}

export const EMPTY_ACTIVITY_DATA: ActivityData = {
  version: null,
  fromVersion: null,
  toVersion: null,
  fromReleaseId: null,
  toReleaseId: null,
  count: null,
  revalidationFailed: false,
};

/**
 * One entry of the historical log. Immutable: inserted and read, never edited, except for the
 * `data.revalidationFailed` flag set right after a pointer move.
 */
export interface ActivityRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  siteId: Types.ObjectId;
  pageId: Types.ObjectId | null;
  /** Title of the page when the event happened; set exactly when `pageId` is set. */
  pageTitle: string | null;
  actorId: Types.ObjectId;
  type: ActivityType;
  data: ActivityData;
  reason: string | null;
  createdAt: Date;
}

export const activitySchema = new Schema<ActivityRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    siteId: { type: Schema.Types.ObjectId, required: true },
    pageId: { type: Schema.Types.ObjectId, default: null },
    pageTitle: { type: String, default: null },
    actorId: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, enum: activityTypes, required: true },
    data: {
      version: { type: Number, default: null },
      fromVersion: { type: Number, default: null },
      toVersion: { type: Number, default: null },
      fromReleaseId: { type: Schema.Types.ObjectId, default: null },
      toReleaseId: { type: Schema.Types.ObjectId, default: null },
      count: { type: Number, default: null },
      revalidationFailed: { type: Boolean, default: false },
    },
    reason: { type: String, default: null },
    createdAt: { type: Date, required: true },
  },
  { collection: 'activity', versionKey: false },
);
activitySchema.index({ siteId: 1, createdAt: -1, _id: -1 });
activitySchema.index({ pageId: 1, createdAt: -1, _id: -1 });

activitySchema.pre('validate', function () {
  if ((this.pageId === null) !== (this.pageTitle === null)) {
    this.invalidate('pageTitle', 'An activity about a page needs the page title snapshot');
  }
});
