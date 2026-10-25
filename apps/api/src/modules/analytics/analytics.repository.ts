import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  addVnDays,
  ANALYTICS_RETENTION_DAYS,
  type LeadDevice,
  type VnDay,
  vnDayStart,
} from '@plp/contracts';
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import {
  ANALYTICS_DAILY_MODEL,
  ANALYTICS_SALT_DAY_INDEX,
  ANALYTICS_SALT_MODEL,
  ANALYTICS_SEEN_MODEL,
  type AnalyticsDailyRecord,
  type AnalyticsSaltRecord,
  type AnalyticsSeenRecord,
} from './analytics.schema.js';
import type { ViewRows } from './domain/report.js';
import type { SourcePair } from './domain/source-cap.js';

/** One counted view: where it was, on which day, from which pair and device. */
export interface CountedView extends SourcePair {
  workspaceId: ObjectId;
  siteId: ObjectId;
  pageId: ObjectId;
  day: VnDay;
  device: LeadDevice;
}

/** Whether the visitor was seen for the first time today, on the site and on the page. */
export interface FirstSightings {
  site: boolean;
  page: boolean;
}

/** "Seen today" outlives its day by one more, so a view just after midnight finds it. */
const SEEN_KEPT_DAYS = 2;

/**
 * Page view totals (ADR-019). Writes come from the renderer's signed views and have no member
 * scope: the workspace comes from the site record the subdomain resolved to, as for leads.
 */
@Injectable()
export class AnalyticsRepository {
  constructor(
    @InjectModel(ANALYTICS_SALT_MODEL) private readonly salts: Model<AnalyticsSaltRecord>,
    @InjectModel(ANALYTICS_SEEN_MODEL) private readonly seen: Model<AnalyticsSeenRecord>,
    @InjectModel(ANALYTICS_DAILY_MODEL) private readonly daily: Model<AnalyticsDailyRecord>,
  ) {}

  /** The salt of a Vietnamese day; the first view of the day creates it. */
  async saltOf(day: VnDay): Promise<string> {
    const update = {
      $setOnInsert: {
        salt: randomBytes(32).toString('base64url'),
        expiresAt: vnDayStart(addVnDays(day, SEEN_KEPT_DAYS)),
      },
    };
    try {
      const record = await this.salts
        .findOneAndUpdate({ day }, update, { upsert: true, returnDocument: 'after' })
        .lean<AnalyticsSaltRecord>()
        .exec();
      return record.salt;
    } catch (error) {
      // Two first views of the day raced to create it: the stored one is the day's salt.
      if (!isDuplicateKeyError(error, ANALYTICS_SALT_DAY_INDEX)) {
        throw error;
      }
    }
    const stored = await this.salts.findOne({ day }).lean<AnalyticsSaltRecord>().exec();
    if (!stored) {
      throw new Error(`The salt of ${day} could not be created`);
    }
    return stored.salt;
  }

  /** Marks the visitor as seen today on the site and on the page. */
  async markSeen(
    siteId: ObjectId,
    pageId: ObjectId,
    day: VnDay,
    hash: string,
  ): Promise<FirstSightings> {
    const expiresAt = vnDayStart(addVnDays(day, SEEN_KEPT_DAYS));
    const sight = async (at: ObjectId | null) => {
      const result = await this.seen
        .updateOne(
          { siteId, pageId: at, day, hash },
          { $setOnInsert: { expiresAt } },
          { upsert: true },
        )
        .exec();
      return result.upsertedCount === 1;
    };
    const [site, page] = await Promise.all([sight(null), sight(pageId)]);
    return { site, page };
  }

  /** Counts one view on the site's row and the page's row of its day, pair and device. */
  async addView(view: CountedView, firstSightings: FirstSightings): Promise<void> {
    const expiresAt = vnDayStart(addVnDays(view.day, ANALYTICS_RETENTION_DAYS));
    const row = (pageId: ObjectId | null, newVisitor: boolean) => ({
      updateOne: {
        filter: {
          siteId: view.siteId,
          pageId,
          day: view.day,
          source: view.source,
          medium: view.medium,
          device: view.device,
        },
        update: {
          $inc: { views: 1, visitors: newVisitor ? 1 : 0 },
          $setOnInsert: { workspaceId: view.workspaceId, expiresAt },
        },
        upsert: true,
      },
    });
    await this.daily.bulkWrite(
      [row(null, firstSightings.site), row(view.pageId, firstSightings.page)],
      { ordered: false },
    );
  }

  /** The source/medium pairs the site counted on a day. */
  async pairsOf(siteId: ObjectId, day: VnDay): Promise<SourcePair[]> {
    const rows = await this.daily
      .aggregate<{ _id: SourcePair }>([
        { $match: { siteId, pageId: null, day } },
        { $group: { _id: { source: '$source', medium: '$medium' } } },
      ])
      .exec();
    return rows.map((row) => row._id);
  }

  /**
   * Views of the site (`pageId` null) or of one page from `from` to `to`, per day; the source pairs
   * and devices from `currentFrom` on. One aggregation over the rows' index.
   */
  async viewRows(
    scope: WorkspaceScope,
    siteId: ObjectId,
    pageId: ObjectId | null,
    days: { from: VnDay; to: VnDay; currentFrom: VnDay },
  ): Promise<ViewRows> {
    const [result] = await this.daily
      .aggregate<{
        daily: Array<{ _id: VnDay; views: number; visitors: number }>;
        sources: Array<{ _id: SourcePair; visitors: number }>;
        devices: Array<{ _id: LeadDevice; visitors: number }>;
      }>([
        {
          $match: {
            workspaceId: scope.workspaceId,
            siteId,
            pageId,
            day: { $gte: days.from, $lte: days.to },
          },
        },
        {
          $facet: {
            daily: [
              {
                $group: {
                  _id: '$day',
                  views: { $sum: '$views' },
                  visitors: { $sum: '$visitors' },
                },
              },
            ],
            sources: [
              { $match: { day: { $gte: days.currentFrom } } },
              {
                $group: {
                  _id: { source: '$source', medium: '$medium' },
                  visitors: { $sum: '$visitors' },
                },
              },
            ],
            devices: [
              { $match: { day: { $gte: days.currentFrom } } },
              { $group: { _id: '$device', visitors: { $sum: '$visitors' } } },
            ],
          },
        },
      ])
      .exec();
    return {
      daily: (result?.daily ?? []).map((row) => ({
        day: row._id,
        views: row.views,
        visitors: row.visitors,
      })),
      sources: (result?.sources ?? []).map((row) => ({ ...row._id, visitors: row.visitors })),
      devices: (result?.devices ?? []).map((row) => ({ device: row._id, visitors: row.visitors })),
    };
  }

  /** Visitors of each page of the site from `from` to `to`, by page id hex. */
  async pageVisitors(
    scope: WorkspaceScope,
    siteId: ObjectId,
    from: VnDay,
    to: VnDay,
  ): Promise<Array<{ pageId: string; visitors: number }>> {
    const rows = await this.daily
      .aggregate<{ _id: ObjectId; visitors: number }>([
        {
          $match: {
            workspaceId: scope.workspaceId,
            siteId,
            day: { $gte: from, $lte: to },
            pageId: { $ne: null },
          },
        },
        { $group: { _id: '$pageId', visitors: { $sum: '$visitors' } } },
      ])
      .exec();
    return rows.map((row) => ({ pageId: row._id.toHexString(), visitors: row.visitors }));
  }
}
