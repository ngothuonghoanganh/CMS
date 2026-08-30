import {
  BadRequestException,
  Inject,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

import {
  AnalyticsClientEventV1Schema,
  AnalyticsIngestResponseSchema,
  PagePayloadSchema,
  normalizePagePath,
  type AnalyticsClientEventV1,
  type AnalyticsIngestResponse,
  type PageNode,
  type PageNodeV2,
  type PageNodeV3,
  type PageNodeV4,
} from '@payload/contracts';

import {
  AnalyticsRepository,
  type AnalyticsStoredEventInput,
} from './analytics.repository';
import { PageRecord, type PageDocument } from '../persistence/schemas/page.schema';
import {
  PageVersionRecord,
  type PageVersionDocument,
} from '../persistence/schemas/page-version.schema';
import { SiteRecord, type SiteDocument } from '../persistence/schemas/site.schema';
import { WorkspaceRecord } from '../persistence/schemas/workspace.schema';
import { TenantContext } from '../tenancy/tenant-context';
import { UsageService } from '../billing/usage.service';
import { platformLogger } from '../common/logging/platform-logger';
import { EventBus } from '../extensions/event-bus';

const ANALYTICS_MAX_EVENT_BYTES = 8 * 1024;
const ANALYTICS_RATE_WINDOW_MS = 60_000;
const ANALYTICS_RATE_MAX_EVENTS = 120;
const MAX_OCCURRED_AT_SKEW_MS = 15 * 60_000;

type RateBucket = { startedAt: number; count: number };

export type SubmissionAnalyticsInput = {
  workspaceId: string;
  siteId: string;
  landingPageId: string;
  pageVersionId: string;
  publishedVersionNumber: number;
  submissionId: string;
  submittedAt: Date;
  sessionId?: string;
};

type PublishedAnalyticsContext = {
  site: SiteDocument;
  page: PageDocument;
  version: PageVersionDocument;
  payload: ReturnType<typeof PagePayloadSchema.parse>;
};

@Injectable()
export class AnalyticsService {
  private readonly rateBuckets = new Map<string, RateBucket>();

  constructor(
    @Inject(AnalyticsRepository)
    private readonly repository: AnalyticsRepository,
    @InjectModel(SiteRecord.name)
    private readonly siteModel: Model<SiteRecord>,
    @InjectModel(PageRecord.name)
    private readonly pageModel: Model<PageRecord>,
    @InjectModel(PageVersionRecord.name)
    private readonly versionModel: Model<PageVersionRecord>,
    @InjectModel(WorkspaceRecord.name)
    private readonly workspaceModel: Model<WorkspaceRecord>,
    @Inject(TenantContext) private readonly tenantContext: TenantContext,
    @Inject(UsageService) private readonly usage: UsageService,
    @Inject(EventBus) private readonly events: EventBus,
  ) {}

  async ingestClientEvent(
    input: unknown,
    clientIp: string,
    userAgent: string | undefined,
  ): Promise<AnalyticsIngestResponse> {
    this.assertRateLimit(clientIp || 'unknown');
    if (JSON.stringify(input).length > ANALYTICS_MAX_EVENT_BYTES) {
      throw new BadRequestException({
        code: 'ANALYTICS_EVENT_TOO_LARGE',
        message: 'The analytics event is too large',
      });
    }
    const event = AnalyticsClientEventV1Schema.parse(input);
    const pagePath = normalizePagePath(
      event.pagePath ?? (event.pageSlug ? `/${event.pageSlug}` : '/'),
    );
    if (!pagePath) throw this.publicNotFound();
    const context = await this.resolvePublishedContext(event.siteSlug, pagePath);
    const node =
      event.event === 'element.clicked'
        ? findNode(context.payload.root, event.nodeId)
        : undefined;
    if (event.event === 'element.clicked' && (!node || node.type !== 'button')) {
      throw new BadRequestException({
        code: 'ANALYTICS_TARGET_INVALID',
        message: 'The analytics target is not a published CTA button',
      });
    }

    const receivedAt = new Date();
    const occurredAt = parseOccurredAt(event, receivedAt);
    const stored = this.toStoredEvent(
      event,
      context,
      receivedAt,
      occurredAt,
      userAgent,
      node?.type,
    );
    await this.repository.insertEvent(stored);
    const runtimeEvent = event.event === 'page.viewed' ? 'page.viewed' : 'button.clicked';
    await this.events.publish(runtimeEvent, {
      tenantId: this.tenantContext.require().id,
      eventId: stored._id,
      workspaceId: context.site.workspaceId,
      siteId: context.site._id.toString(),
      pageId: context.page._id.toString(),
      pageVersionId: context.version._id.toString(),
      ...(event.event === 'element.clicked' ? { nodeId: event.nodeId } : {}),
      ...(event.sessionId ? { sessionId: event.sessionId } : {}),
      occurredAt: occurredAt.toISOString(),
    });
    if (event.event === 'page.viewed') {
      try {
        await this.usage.increment(
          this.tenantContext.require().id,
          'page_views_monthly',
          1,
          receivedAt,
        );
      } catch (error) {
        platformLogger.warn({ err: error }, 'page-view billing usage increment failed');
      }
    }
    return AnalyticsIngestResponseSchema.parse({ accepted: true });
  }

  async recordSubmission(input: SubmissionAnalyticsInput): Promise<void> {
    const attribution = input.sessionId
      ? await this.repository.findFirstPageViewAttribution(
          input.workspaceId,
          input.sessionId,
        )
      : undefined;
    await this.repository.insertEvent({
      _id: randomUUID(),
      eventVersion: 1,
      eventType: 'form.submitted',
      workspaceId: input.workspaceId,
      siteId: input.siteId,
      landingPageId: input.landingPageId,
      pageVersionId: input.pageVersionId,
      publishedVersionNumber: input.publishedVersionNumber,
      formSubmissionId: input.submissionId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      occurredAt: input.submittedAt,
      receivedAt: new Date(),
      ...(attribution ?? { referrerHost: 'direct' }),
      deviceType: 'unknown',
    });
  }

  private async resolvePublishedContext(
    siteSlug: string,
    pagePath: string,
  ): Promise<PublishedAnalyticsContext> {
    const sites = await this.siteModel.find({ slug: siteSlug }).limit(2).exec();
    if (sites.length !== 1 || !sites[0]) throw this.publicNotFound();
    const site = sites[0];
    if (!(await this.workspaceModel.exists({ _id: site.workspaceId }))) {
      throw this.publicNotFound();
    }
    const page =
      pagePath === '/' && site.homePageId
        ? await this.pageModel
            .findOne({
              _id: site.homePageId,
              siteId: site._id.toString(),
              workspaceId: site.workspaceId,
            })
            .exec()
        : await this.pageModel
            .findOne({
              siteId: site._id.toString(),
              workspaceId: site.workspaceId,
              path: pagePath,
            })
            .exec();
    const legacyPage =
      page ??
      (pagePath === '/'
        ? await this.pageModel
            .findOne({
              siteId: site._id.toString(),
              workspaceId: site.workspaceId,
              path: '/',
            })
            .sort({ createdAt: 1, _id: 1 })
            .exec()
        : await this.pageModel
            .findOne({
              siteId: site._id.toString(),
              workspaceId: site.workspaceId,
              slug: pagePath.slice(1),
            })
            .exec());
    if (!legacyPage?.publishedVersionId) throw this.publicNotFound();
    const version = await this.versionModel
      .findOne({
        _id: legacyPage.publishedVersionId,
        landingPageId: legacyPage._id.toString(),
        siteId: site._id.toString(),
        workspaceId: site.workspaceId,
      })
      .exec();
    if (!version) throw this.publicNotFound();
    const payload = PagePayloadSchema.safeParse(version.payload);
    if (!payload.success) throw this.publicNotFound();
    return { site, page: legacyPage, version, payload: payload.data };
  }

  private toStoredEvent(
    event: AnalyticsClientEventV1,
    context: PublishedAnalyticsContext,
    receivedAt: Date,
    occurredAt: Date,
    userAgent: string | undefined,
    elementType: string | undefined,
  ): AnalyticsStoredEventInput {
    const attribution = sanitizeContext(event.context, userAgent);
    return {
      _id: randomUUID(),
      eventVersion: 1,
      eventType: event.event,
      workspaceId: context.site.workspaceId,
      siteId: context.site._id.toString(),
      landingPageId: context.page._id.toString(),
      pageVersionId: context.version._id.toString(),
      publishedVersionNumber: context.version.versionNumber,
      ...(event.event === 'element.clicked' ? { nodeId: event.nodeId } : {}),
      ...(elementType ? { elementType } : {}),
      sessionId: event.sessionId,
      occurredAt,
      receivedAt,
      ...attribution,
    };
  }

  private assertRateLimit(clientIp: string): void {
    const now = Date.now();
    if (this.rateBuckets.size > 10_000) {
      for (const [key, bucket] of this.rateBuckets) {
        if (now - bucket.startedAt >= ANALYTICS_RATE_WINDOW_MS)
          this.rateBuckets.delete(key);
      }
    }
    const current = this.rateBuckets.get(clientIp);
    if (!current || now - current.startedAt >= ANALYTICS_RATE_WINDOW_MS) {
      this.rateBuckets.set(clientIp, { startedAt: now, count: 1 });
      return;
    }
    if (current.count >= ANALYTICS_RATE_MAX_EVENTS) {
      throw new HttpException(
        {
          code: 'ANALYTICS_RATE_LIMITED',
          message: 'Too many analytics events. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    current.count += 1;
  }

  private publicNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'PUBLIC_PAGE_NOT_FOUND',
      message: 'The published analytics page was not found',
    });
  }
}

function parseOccurredAt(event: AnalyticsClientEventV1, receivedAt: Date): Date {
  if (!event.occurredAt) return receivedAt;
  const occurredAt = new Date(event.occurredAt);
  if (
    Number.isNaN(occurredAt.getTime()) ||
    Math.abs(receivedAt.getTime() - occurredAt.getTime()) > MAX_OCCURRED_AT_SKEW_MS
  ) {
    throw new BadRequestException({
      code: 'ANALYTICS_TIMESTAMP_INVALID',
      message: 'The analytics timestamp is outside the accepted clock window',
    });
  }
  return occurredAt;
}

function sanitizeContext(
  context: AnalyticsClientEventV1['context'],
  userAgent: string | undefined,
): Partial<AnalyticsStoredEventInput> {
  const referrerHost = sanitizeReferrer(context?.referrer);
  const result: Partial<AnalyticsStoredEventInput> = {
    referrerHost,
    deviceType:
      deriveDeviceType(userAgent) === 'unknown'
        ? (context?.deviceType ?? 'unknown')
        : deriveDeviceType(userAgent),
  };
  for (const key of [
    'utmSource',
    'utmMedium',
    'utmCampaign',
    'utmTerm',
    'utmContent',
  ] as const) {
    const value = context?.[key]?.trim();
    if (value) result[key] = value.slice(0, 100);
  }
  return result;
}

function sanitizeReferrer(value: string | undefined): string {
  if (!value) return 'direct';
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'direct';
    return parsed.hostname.toLowerCase().slice(0, 253) || 'direct';
  } catch {
    return 'direct';
  }
}

function deriveDeviceType(
  userAgent: string | undefined,
): 'desktop' | 'mobile' | 'tablet' | 'unknown' {
  if (!userAgent) return 'unknown';
  if (/ipad|tablet|playbook|silk/i.test(userAgent)) return 'tablet';
  if (/mobi|android|iphone|ipod/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

function findNode(
  node: PageNode | PageNodeV2 | PageNodeV3 | PageNodeV4,
  nodeId: string,
): PageNode | PageNodeV2 | PageNodeV3 | PageNodeV4 | undefined {
  if (node.id === nodeId) return node;
  for (const child of node.children) {
    const match = findNode(child, nodeId);
    if (match) return match;
  }
  return undefined;
}
