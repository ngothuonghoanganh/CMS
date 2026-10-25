import { type LeadDevice, leadDevices, type VnDay } from '@plp/contracts';
import { Schema, type Types } from 'mongoose';

export const ANALYTICS_SALT_MODEL = 'AnalyticsSalt';
export const ANALYTICS_SEEN_MODEL = 'AnalyticsSeen';
export const ANALYTICS_DAILY_MODEL = 'AnalyticsDaily';
export const ANALYTICS_SALT_DAY_INDEX = 'analytics_salts_day_unique';
export const ANALYTICS_SEEN_INDEX = 'analytics_seen_unique';

/**
 * The random salt of one Vietnamese day (ADR-019). Visitor hashes of that day use it; once it
 * expires, nothing can link a hash to an address and a browser any more.
 */
export interface AnalyticsSaltRecord {
  _id: Types.ObjectId;
  day: VnDay;
  salt: string;
  expiresAt: Date;
}

export const analyticsSaltSchema = new Schema<AnalyticsSaltRecord>(
  {
    day: { type: String, required: true },
    salt: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'analytics_salts', versionKey: false },
);
analyticsSaltSchema.index({ day: 1 }, { unique: true, name: ANALYTICS_SALT_DAY_INDEX });
analyticsSaltSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * "Seen today" (ADR-019): one visitor hash at the site level (`pageId` null) and per page. The
 * first view of the day inserts it and counts a visitor. Removed two days later.
 */
export interface AnalyticsSeenRecord {
  _id: Types.ObjectId;
  siteId: Types.ObjectId;
  pageId: Types.ObjectId | null;
  day: VnDay;
  hash: string;
  expiresAt: Date;
}

export const analyticsSeenSchema = new Schema<AnalyticsSeenRecord>(
  {
    siteId: { type: Schema.Types.ObjectId, required: true },
    pageId: { type: Schema.Types.ObjectId, default: null },
    day: { type: String, required: true },
    hash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'analytics_seen', versionKey: false },
);
analyticsSeenSchema.index(
  { siteId: 1, pageId: 1, day: 1, hash: 1 },
  { unique: true, name: ANALYTICS_SEEN_INDEX },
);
analyticsSeenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Daily totals of a site (`pageId` null) or one page, per source/medium pair and device. Views
 * and visitors are incremented; raw events are never stored (ADR-019).
 */
export interface AnalyticsDailyRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  siteId: Types.ObjectId;
  pageId: Types.ObjectId | null;
  day: VnDay;
  source: string;
  medium: string;
  device: LeadDevice;
  views: number;
  visitors: number;
  expiresAt: Date;
}

export const analyticsDailySchema = new Schema<AnalyticsDailyRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    siteId: { type: Schema.Types.ObjectId, required: true },
    pageId: { type: Schema.Types.ObjectId, default: null },
    day: { type: String, required: true },
    source: { type: String, required: true },
    medium: { type: String, required: true },
    device: { type: String, enum: leadDevices, required: true },
    views: { type: Number, required: true },
    visitors: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'analytics_daily', versionKey: false },
);
// One row per site or page, day, pair and device; the site and page reports read its prefix.
analyticsDailySchema.index(
  { siteId: 1, pageId: 1, day: 1, source: 1, medium: 1, device: 1 },
  { unique: true, name: 'analytics_daily_unique' },
);
// "Theo trang": the page rows of a site over a period.
analyticsDailySchema.index({ siteId: 1, day: 1 }, { name: 'analytics_daily_site_day' });
analyticsDailySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
