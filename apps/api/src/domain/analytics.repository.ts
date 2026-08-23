import { InjectModel } from '@nestjs/mongoose';
import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import { AnalyticsStoredEventV1Schema } from '@payload/contracts';

import { AnalyticsEventRecord } from '../persistence/schemas/analytics-event.schema';
import { FormSubmissionRecord } from '../persistence/schemas/form-submission.schema';

export type AnalyticsFilter = {
  workspaceId: string;
  landingPageId?: string;
  from: Date;
  to: Date;
};

export type AnalyticsEventMetrics = {
  pageViews: number;
  sessions: number;
  ctaClicks: number;
};

export type AnalyticsPageEventMetrics = AnalyticsEventMetrics & {
  landingPageId: string;
  submissions: number;
};

export type AnalyticsTimelineAggregate = {
  date: string;
  eventType?: string;
  count: number;
};

export type AnalyticsSessionTimelineAggregate = {
  date: string;
  count: number;
};

export type AnalyticsBreakdownAggregate = {
  name: string;
  pageViews: number;
  sessions: number;
  submissions: number;
};

export type AnalyticsStoredEventInput = {
  _id: string;
  workspaceId: string;
  siteId: string;
  landingPageId: string;
  pageVersionId: string;
  eventVersion: 1;
  eventType: 'page.viewed' | 'form.submitted' | 'element.clicked';
  publishedVersionNumber: number;
  nodeId?: string;
  elementType?: string;
  formSubmissionId?: string;
  sessionId?: string;
  occurredAt: Date;
  receivedAt: Date;
  referrerHost?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet' | 'unknown';
};

export type AnalyticsAttribution = {
  referrerHost?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
};

@Injectable()
export class AnalyticsRepository {
  constructor(
    @InjectModel(AnalyticsEventRecord.name)
    private readonly eventModel: Model<AnalyticsEventRecord>,
    @InjectModel(FormSubmissionRecord.name)
    private readonly submissionModel: Model<FormSubmissionRecord>,
  ) {}

  async insertEvent(input: AnalyticsStoredEventInput): Promise<void> {
    AnalyticsStoredEventV1Schema.parse({
      version: input.eventVersion,
      event: input.eventType,
      workspaceId: input.workspaceId,
      siteId: input.siteId,
      landingPageId: input.landingPageId,
      pageVersionId: input.pageVersionId,
      publishedVersionNumber: input.publishedVersionNumber,
      ...(input.nodeId ? { nodeId: input.nodeId } : {}),
      ...(input.elementType ? { elementType: input.elementType } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.formSubmissionId ? { formSubmissionId: input.formSubmissionId } : {}),
      occurredAt: input.occurredAt.toISOString(),
      receivedAt: input.receivedAt.toISOString(),
      ...(input.referrerHost ? { referrerHost: input.referrerHost } : {}),
      ...(input.utmSource ? { utmSource: input.utmSource } : {}),
      ...(input.utmMedium ? { utmMedium: input.utmMedium } : {}),
      ...(input.utmCampaign ? { utmCampaign: input.utmCampaign } : {}),
      ...(input.utmTerm ? { utmTerm: input.utmTerm } : {}),
      ...(input.utmContent ? { utmContent: input.utmContent } : {}),
      ...(input.deviceType ? { deviceType: input.deviceType } : {}),
    });
    await this.eventModel.create(input);
  }

  async findFirstPageViewAttribution(
    workspaceId: string,
    sessionId: string,
  ): Promise<AnalyticsAttribution | undefined> {
    const record = await this.eventModel
      .findOne({ workspaceId, sessionId, eventType: 'page.viewed' })
      .sort({ occurredAt: 1, _id: 1 })
      .select('referrerHost utmSource utmMedium utmCampaign utmTerm utmContent')
      .lean()
      .exec();
    if (!record) return undefined;
    return {
      ...(record.referrerHost ? { referrerHost: record.referrerHost } : {}),
      ...(record.utmSource ? { utmSource: record.utmSource } : {}),
      ...(record.utmMedium ? { utmMedium: record.utmMedium } : {}),
      ...(record.utmCampaign ? { utmCampaign: record.utmCampaign } : {}),
      ...(record.utmTerm ? { utmTerm: record.utmTerm } : {}),
      ...(record.utmContent ? { utmContent: record.utmContent } : {}),
    };
  }

  async countMetrics(filter: AnalyticsFilter): Promise<AnalyticsEventMetrics> {
    const match = eventMatch(filter);
    const [pageViews, ctaClicks, sessionRows] = await Promise.all([
      this.eventModel.countDocuments({ ...match, eventType: 'page.viewed' }).exec(),
      this.eventModel.countDocuments({ ...match, eventType: 'element.clicked' }).exec(),
      this.eventModel
        .aggregate<{ _id: string }>([
          {
            $match: {
              ...match,
              eventType: 'page.viewed',
              sessionId: { $type: 'string' },
            },
          },
          { $group: { _id: '$sessionId' } },
        ])
        .exec(),
    ]);
    return { pageViews, ctaClicks, sessions: sessionRows.length };
  }

  async countSubmissions(filter: AnalyticsFilter): Promise<number> {
    return this.submissionModel
      .countDocuments({
        workspaceId: filter.workspaceId,
        ...(filter.landingPageId ? { landingPageId: filter.landingPageId } : {}),
        submittedAt: { $gte: filter.from, $lt: filter.to },
      })
      .exec();
  }

  async pageMetrics(filter: AnalyticsFilter): Promise<AnalyticsPageEventMetrics[]> {
    const match = eventMatch(filter);
    const [eventRows, sessionRows, submissionRows] = await Promise.all([
      this.eventModel
        .aggregate<{ _id: { landingPageId: string; eventType: string }; count: number }>([
          { $match: match },
          {
            $group: {
              _id: { landingPageId: '$landingPageId', eventType: '$eventType' },
              count: { $sum: 1 },
            },
          },
        ])
        .exec(),
      this.eventModel
        .aggregate<{ _id: string; count: number }>([
          {
            $match: {
              ...match,
              eventType: 'page.viewed',
              sessionId: { $type: 'string' },
            },
          },
          {
            $group: { _id: { landingPageId: '$landingPageId', sessionId: '$sessionId' } },
          },
          { $group: { _id: '$_id.landingPageId', count: { $sum: 1 } } },
        ])
        .exec(),
      this.submissionModel
        .aggregate<{ _id: string; count: number }>([
          {
            $match: {
              workspaceId: filter.workspaceId,
              ...(filter.landingPageId ? { landingPageId: filter.landingPageId } : {}),
              submittedAt: { $gte: filter.from, $lt: filter.to },
            },
          },
          { $group: { _id: '$landingPageId', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);

    const metrics = new Map<string, AnalyticsPageEventMetrics>();
    for (const row of eventRows) {
      const page = metrics.get(row._id.landingPageId) ?? {
        landingPageId: row._id.landingPageId,
        pageViews: 0,
        sessions: 0,
        ctaClicks: 0,
        submissions: 0,
      };
      if (row._id.eventType === 'page.viewed') page.pageViews = row.count;
      if (row._id.eventType === 'element.clicked') page.ctaClicks = row.count;
      metrics.set(row._id.landingPageId, page);
    }
    for (const row of sessionRows) {
      const page = metrics.get(row._id) ?? emptyPageMetrics(row._id);
      page.sessions = row.count;
      metrics.set(row._id, page);
    }
    for (const row of submissionRows) {
      const page = metrics.get(row._id) ?? emptyPageMetrics(row._id);
      page.submissions = row.count;
      metrics.set(row._id, page);
    }
    return [...metrics.values()];
  }

  async timeline(filter: AnalyticsFilter): Promise<{
    events: AnalyticsTimelineAggregate[];
    sessions: AnalyticsSessionTimelineAggregate[];
    submissions: AnalyticsTimelineAggregate[];
  }> {
    const match = eventMatch(filter);
    const [events, sessions, submissions] = await Promise.all([
      this.eventModel
        .aggregate<AnalyticsTimelineAggregate>([
          { $match: match },
          {
            $group: {
              _id: {
                date: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$receivedAt',
                    timezone: 'UTC',
                  },
                },
                eventType: '$eventType',
              },
              count: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
              date: '$_id.date',
              eventType: '$_id.eventType',
              count: 1,
            },
          },
        ])
        .exec(),
      this.eventModel
        .aggregate<AnalyticsSessionTimelineAggregate>([
          {
            $match: {
              ...match,
              eventType: 'page.viewed',
              sessionId: { $type: 'string' },
            },
          },
          {
            $project: {
              date: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$receivedAt',
                  timezone: 'UTC',
                },
              },
              sessionId: 1,
            },
          },
          { $group: { _id: { date: '$date', sessionId: '$sessionId' } } },
          { $group: { _id: '$_id.date', count: { $sum: 1 } } },
          { $project: { _id: 0, date: '$_id', count: 1 } },
        ])
        .exec(),
      this.submissionModel
        .aggregate<AnalyticsTimelineAggregate>([
          {
            $match: {
              workspaceId: filter.workspaceId,
              ...(filter.landingPageId ? { landingPageId: filter.landingPageId } : {}),
              submittedAt: { $gte: filter.from, $lt: filter.to },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$submittedAt',
                  timezone: 'UTC',
                },
              },
              count: { $sum: 1 },
            },
          },
          { $project: { _id: 0, date: '$_id', count: 1 } },
        ])
        .exec(),
    ]);
    return { events, sessions, submissions };
  }

  async breakdown(
    filter: AnalyticsFilter,
    dimension: 'referrer' | 'campaign' | 'device',
  ): Promise<AnalyticsBreakdownAggregate[]> {
    const match = eventMatch(filter);
    const keyExpression = dimensionExpression(dimension);
    const [views, sessions, submissions] = await Promise.all([
      this.eventModel
        .aggregate<{ _id: string; count: number }>([
          { $match: { ...match, eventType: 'page.viewed' } },
          { $project: { key: keyExpression, sessionId: 1 } },
          { $group: { _id: '$key', count: { $sum: 1 } } },
        ])
        .exec(),
      this.eventModel
        .aggregate<{ _id: string; count: number }>([
          {
            $match: {
              ...match,
              eventType: 'page.viewed',
              sessionId: { $type: 'string' },
            },
          },
          { $project: { key: keyExpression, sessionId: 1 } },
          { $group: { _id: { key: '$key', sessionId: '$sessionId' } } },
          { $group: { _id: '$_id.key', count: { $sum: 1 } } },
        ])
        .exec(),
      this.eventModel
        .aggregate<{ _id: string; count: number }>([
          { $match: { ...match, eventType: 'form.submitted' } },
          { $project: { key: keyExpression } },
          { $group: { _id: '$key', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);
    const result = new Map<string, AnalyticsBreakdownAggregate>();
    for (const row of views)
      result.set(row._id, {
        name: row._id,
        pageViews: row.count,
        sessions: 0,
        submissions: 0,
      });
    for (const row of sessions) {
      const item = result.get(row._id) ?? {
        name: row._id,
        pageViews: 0,
        sessions: 0,
        submissions: 0,
      };
      item.sessions = row.count;
      result.set(row._id, item);
    }
    for (const row of submissions) {
      const item = result.get(row._id) ?? {
        name: row._id,
        pageViews: 0,
        sessions: 0,
        submissions: 0,
      };
      item.submissions = row.count;
      result.set(row._id, item);
    }
    return [...result.values()]
      .sort(
        (left, right) =>
          right.pageViews + right.submissions - (left.pageViews + left.submissions),
      )
      .slice(0, 20);
  }
}

function eventMatch(filter: AnalyticsFilter): Record<string, unknown> {
  return {
    workspaceId: filter.workspaceId,
    ...(filter.landingPageId ? { landingPageId: filter.landingPageId } : {}),
    receivedAt: { $gte: filter.from, $lt: filter.to },
  };
}

function emptyPageMetrics(landingPageId: string): AnalyticsPageEventMetrics {
  return { landingPageId, pageViews: 0, sessions: 0, ctaClicks: 0, submissions: 0 };
}

function dimensionExpression(
  dimension: 'referrer' | 'campaign' | 'device',
): Record<string, unknown> {
  if (dimension === 'referrer') {
    return { $ifNull: ['$referrerHost', 'direct'] };
  }
  if (dimension === 'device') {
    return { $ifNull: ['$deviceType', 'unknown'] };
  }
  return {
    $cond: [
      {
        $or: [
          { $ne: [{ $ifNull: ['$utmSource', ''] }, ''] },
          { $ne: [{ $ifNull: ['$utmMedium', ''] }, ''] },
          { $ne: [{ $ifNull: ['$utmCampaign', ''] }, ''] },
        ],
      },
      {
        $concat: [
          { $ifNull: ['$utmSource', '(none)'] },
          ' / ',
          { $ifNull: ['$utmMedium', '(none)'] },
          ' / ',
          { $ifNull: ['$utmCampaign', '(none)'] },
        ],
      },
      'direct',
    ],
  };
}
