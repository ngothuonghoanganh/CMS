import { randomBytes, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  CreateCustomDomainRequestSchema,
  CustomDomainListResponseSchema,
  CustomDomainSchema,
  UpdateCustomDomainRequestSchema,
  normalizeHostname,
  PublicSiteRoutesSchema,
  type CreateCustomDomainRequest,
  type CustomDomain,
  type CustomDomainListResponse,
  type UpdateCustomDomainRequest,
} from '@payload/contracts';

import { env } from '../config/env';
import {
  CustomDomainRecord,
  type CustomDomainDocument,
} from '../persistence/schemas/custom-domain.schema';
import { PageRecord } from '../persistence/schemas/page.schema';
import { PageSeoSettingsRecord } from '../persistence/schemas/page-seo-settings.schema';
import { SiteRecord } from '../persistence/schemas/site.schema';
import { WorkspaceRecord } from '../persistence/schemas/workspace.schema';
import {
  DOMAIN_VERIFICATION_RESOLVER,
  type DomainVerificationResolver,
} from './domain-verification-resolver';
import { PublicPageResolver } from './public-page.resolver';
import { TenantResolver } from '../tenancy/tenant-resolver';
import { TenantContext } from '../tenancy/tenant-context';
import { QuotaService } from '../billing/quota.service';
import { EventBus } from '../extensions/event-bus';

const PUBLIC_DOMAIN_RESOLVE_RATE_LIMIT_MAX_REQUESTS = 240;
const PUBLIC_DOMAIN_RESOLVE_RATE_LIMIT_WINDOW_MS = 60_000;

type RateBucket = { startedAt: number; count: number };

@Injectable()
export class CustomDomainService {
  private readonly recentVerificationAttempts = new Map<string, number>();
  private readonly publicResolveBuckets = new Map<string, RateBucket>();

  constructor(
    @InjectModel(CustomDomainRecord.name)
    private readonly domainModel: Model<CustomDomainRecord>,
    @InjectModel(PageRecord.name)
    private readonly pageModel: Model<PageRecord>,
    @InjectModel(SiteRecord.name)
    private readonly siteModel: Model<SiteRecord>,
    @InjectModel(PageSeoSettingsRecord.name)
    private readonly seoModel: Model<PageSeoSettingsRecord>,
    @InjectModel(WorkspaceRecord.name)
    private readonly workspaceModel: Model<WorkspaceRecord>,
    @Inject(DOMAIN_VERIFICATION_RESOLVER)
    private readonly verificationResolver: DomainVerificationResolver,
    @Inject(PublicPageResolver)
    private readonly publicPageResolver: PublicPageResolver,
    @Inject(TenantResolver) private readonly tenantResolver: TenantResolver,
    @Inject(TenantContext) private readonly tenantContext: TenantContext,
    @Inject(QuotaService) private readonly quotas: QuotaService,
    @Inject(EventBus) private readonly events: EventBus,
  ) {}

  async list(workspaceId: string): Promise<CustomDomainListResponse> {
    await this.requireWorkspace(workspaceId);
    const records = await this.domainModel
      .find({ workspaceId })
      .select('+verificationToken')
      .sort({ createdAt: -1, _id: -1 })
      .exec();

    return CustomDomainListResponseSchema.parse({
      items: records.map((record) => this.toContract(record, true)),
    });
  }

  async create(
    workspaceId: string,
    input: CreateCustomDomainRequest,
  ): Promise<CustomDomain> {
    await this.requireWorkspace(workspaceId);
    const parsedInput = CreateCustomDomainRequestSchema.parse(input);
    const hostname = this.requirePublicHostname(parsedInput.hostname);
    const landingPageId = parsedInput.landingPageId;
    const siteId = parsedInput.siteId;
    let pageSiteId: string | undefined;
    if (landingPageId) {
      const page = await this.requirePage(landingPageId, workspaceId);
      pageSiteId = page.siteId;
      if (siteId && siteId !== page.siteId) {
        throw new BadRequestException({
          code: 'DOMAIN_SITE_PAGE_MISMATCH',
          message: 'The domain site and page must belong to the same site',
        });
      }
    }
    if (siteId) await this.requireSite(siteId, workspaceId);

    const token = randomBytes(32).toString('base64url');
    const verificationHostname = `${env.DOMAIN_VERIFICATION_PREFIX}.${hostname}`;
    if (parsedInput.isPrimary && !siteId && !pageSiteId) {
      throw new BadRequestException({
        code: 'PRIMARY_DOMAIN_SITE_REQUIRED',
        message: 'A primary domain must be assigned to a site',
      });
    }

    return this.quotas.withHardQuota('custom_domains', async () => {
      if (parsedInput.isPrimary && (siteId ?? pageSiteId))
        await this.clearPrimaryDomain(workspaceId, siteId ?? pageSiteId!, landingPageId);

      const record = await this.domainModel.create({
        _id: randomUUID(),
        workspaceId,
        hostname,
        normalizedHostname: hostname,
        status: 'pending',
        verificationMethod: 'dns_txt',
        verificationHostname,
        verificationToken: token,
        ...(siteId ? { siteId } : {}),
        ...(landingPageId ? { landingPageId } : {}),
        isPrimary: parsedInput.isPrimary ?? false,
      });
      if (env.DOMAIN_VERIFICATION_PROVIDER === 'fake') {
        this.verificationResolver.registerTxt?.(verificationHostname, token);
      }

      return this.toContract(record, true);
    });
  }

  async get(workspaceId: string, domainId: string): Promise<CustomDomain> {
    const record = await this.requireDomain(domainId, workspaceId);
    await this.populateVerificationToken(record);
    return this.toContract(record, true);
  }

  async update(
    workspaceId: string,
    domainId: string,
    input: UpdateCustomDomainRequest,
  ): Promise<CustomDomain> {
    const parsedInput = UpdateCustomDomainRequestSchema.parse(input);
    const record = await this.requireDomain(domainId, workspaceId);
    const nextPageId =
      parsedInput.landingPageId === null
        ? undefined
        : (parsedInput.landingPageId ?? record.landingPageId);
    let nextSiteId =
      parsedInput.siteId === null ? undefined : (parsedInput.siteId ?? record.siteId);

    const nextPage = nextPageId
      ? await this.requirePage(nextPageId, workspaceId)
      : undefined;
    if (nextPage) {
      if (nextSiteId && nextSiteId !== nextPage.siteId) {
        throw new BadRequestException({
          code: 'DOMAIN_SITE_PAGE_MISMATCH',
          message: 'The domain site and page must belong to the same site',
        });
      }
    }
    if (nextSiteId) await this.requireSite(nextSiteId, workspaceId);
    const effectiveSiteId = nextSiteId ?? nextPage?.siteId;
    if (parsedInput.isPrimary && !effectiveSiteId) {
      throw new BadRequestException({
        code: 'PRIMARY_DOMAIN_SITE_REQUIRED',
        message: 'A primary domain must be assigned to a site',
      });
    }
    if (
      effectiveSiteId &&
      (parsedInput.isPrimary === true ||
        (record.isPrimary &&
          (nextSiteId !== record.siteId || nextPageId !== record.landingPageId)))
    ) {
      await this.clearPrimaryDomain(workspaceId, effectiveSiteId, nextPageId, domainId);
    }

    if (parsedInput.landingPageId === null) {
      record.set('landingPageId', undefined);
      record.isPrimary = false;
    } else if (parsedInput.landingPageId !== undefined) {
      record.landingPageId = parsedInput.landingPageId;
    }
    if (parsedInput.siteId === null) {
      record.set('siteId', undefined);
    } else if (parsedInput.siteId !== undefined && nextSiteId) {
      record.siteId = nextSiteId;
    }
    if (parsedInput.isPrimary !== undefined) {
      record.isPrimary = parsedInput.isPrimary;
    }
    await record.save();
    await this.populateVerificationToken(record);
    return this.toContract(record, true);
  }

  async remove(workspaceId: string, domainId: string): Promise<void> {
    const record = await this.requireDomain(domainId, workspaceId);
    await record.deleteOne();
    await this.tenantResolver.disableDomain(record.hostname, record._id.toString());
  }

  async verify(workspaceId: string, domainId: string): Promise<CustomDomain> {
    const record = await this.requireDomain(domainId, workspaceId, true);
    const lastAttempt = this.recentVerificationAttempts.get(domainId) ?? 0;
    if (Date.now() - lastAttempt < 1_000) {
      throw new BadRequestException({
        code: 'DOMAIN_VERIFICATION_RATE_LIMITED',
        message: 'Please wait before retrying domain verification',
      });
    }
    this.recentVerificationAttempts.set(domainId, Date.now());

    record.status = 'verifying';
    record.lastCheckedAt = new Date();
    record.set('failureReason', undefined);
    await record.save();

    try {
      const records = await this.verificationResolver.resolveTxt(
        record.verificationHostname,
      );
      if (!records.includes(record.verificationToken)) {
        record.status = 'failed';
        record.failureReason = 'Verification TXT record was not found';
        await record.save();
        await this.tenantResolver.disableDomain(record.hostname, record._id.toString());
        return this.toContract(record, true);
      }

      record.status = 'active';
      record.verifiedAt = new Date();
      record.set('failureReason', undefined);
      await record.save();
      await this.tenantResolver.registerDomain({
        tenantId: this.tenantContext.require().id,
        hostname: record.hostname,
        sourceDomainId: record._id.toString(),
      });
      await this.events.publish('domain.verified', {
        tenantId: this.tenantContext.require().id,
        domainId: record._id.toString(),
        workspaceId,
        occurredAt: new Date().toISOString(),
      });
      return this.toContract(record, true);
    } catch {
      record.status = 'failed';
      record.failureReason = 'The verification DNS lookup could not be completed';
      await record.save();
      await this.tenantResolver.disableDomain(record.hostname, record._id.toString());
      return this.toContract(record, true);
    }
  }

  async resolvePublic(hostname: string | undefined, path = '/', clientIp = 'unknown') {
    this.assertPublicResolveRateLimit(clientIp);
    const normalizedHostname = normalizeHostname(hostname ?? '');
    if (!normalizedHostname) {
      throw this.publicNotFound();
    }
    return this.publicPageResolver.resolveByHostname(normalizedHostname, path);
  }

  async resolvePublicRoutes(
    hostname: string | undefined,
    clientIp = 'unknown',
  ): Promise<{ urls: string[] }> {
    this.assertPublicResolveRateLimit(clientIp);
    const normalizedHostname = normalizeHostname(hostname ?? '');
    if (!normalizedHostname) throw this.publicNotFound();
    const domain = await this.domainModel
      .findOne({ normalizedHostname, hostname: normalizedHostname, status: 'active' })
      .exec();
    if (!domain) throw this.publicNotFound();

    const assignedPage = domain.landingPageId
      ? await this.pageModel
          .findOne({ _id: domain.landingPageId, workspaceId: domain.workspaceId })
          .exec()
      : null;
    const siteId = domain.siteId ?? assignedPage?.siteId;
    if (!siteId) throw this.publicNotFound();

    const pages = await this.pageModel
      .find({
        siteId,
        workspaceId: domain.workspaceId,
        publishedVersionId: { $exists: true, $ne: null },
      })
      .sort({ path: 1, _id: 1 })
      .exec();
    const seoRecords = await this.seoModel
      .find({
        workspaceId: domain.workspaceId,
        landingPageId: { $in: pages.map((page) => page._id.toString()) },
      })
      .exec();
    const seoByPageId = new Map(
      seoRecords.map((record) => [record.landingPageId, record]),
    );
    const origin = `https://${normalizedHostname}`;
    const urls = pages.flatMap((page) => {
      const seo = seoByPageId.get(page._id.toString());
      if (seo?.noIndex) return [];
      const path = page.path ?? (page.slug ? `/${page.slug}` : '/');
      const fallback = `${origin}${path === '/' ? '/' : path}`;
      if (!seo?.canonicalUrl) return [fallback];
      try {
        const canonical = new URL(seo.canonicalUrl, fallback);
        return canonical.protocol === 'http:' || canonical.protocol === 'https:'
          ? [canonical.toString()]
          : [fallback];
      } catch {
        return [fallback];
      }
    });
    return PublicSiteRoutesSchema.parse({ urls });
  }

  private async requireWorkspace(workspaceId: string): Promise<void> {
    if (!(await this.workspaceModel.exists({ _id: workspaceId }))) {
      throw new NotFoundException({
        code: 'WORKSPACE_NOT_FOUND',
        message: 'Workspace was not found',
      });
    }
  }

  private async requirePage(pageId: string, workspaceId: string) {
    const page = await this.pageModel.findOne({ _id: pageId, workspaceId }).exec();
    if (!page) {
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: 'Page was not found in the requested workspace',
      });
    }
    return page;
  }

  private async requireSite(siteId: string, workspaceId: string): Promise<void> {
    if (!(await this.siteModel.exists({ _id: siteId, workspaceId }))) {
      throw new NotFoundException({
        code: 'SITE_NOT_FOUND',
        message: 'Site was not found in the requested workspace',
      });
    }
  }

  private async requireDomain(
    domainId: string,
    workspaceId: string,
    includeToken = false,
  ): Promise<CustomDomainDocument> {
    const query = this.domainModel.findOne({ _id: domainId, workspaceId });
    if (includeToken) query.select('+verificationToken');
    const record = await query.exec();
    if (!record) {
      throw new NotFoundException({
        code: 'CUSTOM_DOMAIN_NOT_FOUND',
        message: 'Custom domain was not found',
      });
    }
    return record;
  }

  private async populateVerificationToken(record: CustomDomainDocument): Promise<void> {
    if (record.verificationToken) return;
    const withToken = await this.domainModel
      .findOne({ _id: record._id.toString() })
      .select('+verificationToken')
      .exec();
    if (withToken?.verificationToken)
      record.verificationToken = withToken.verificationToken;
  }

  private async clearPrimaryDomain(
    workspaceId: string,
    siteId: string,
    landingPageId?: string,
    exceptDomainId?: string,
  ): Promise<void> {
    await this.domainModel
      .updateMany(
        {
          workspaceId,
          $or: [{ siteId }, ...(landingPageId ? [{ landingPageId }] : [])],
          isPrimary: true,
          ...(exceptDomainId ? { _id: { $ne: exceptDomainId } } : {}),
        },
        { $set: { isPrimary: false } },
      )
      .exec();
  }

  private requirePublicHostname(input: string): string {
    const hostname = normalizeHostname(input);
    if (!hostname || !this.isPublicHostname(hostname)) {
      throw new BadRequestException({
        code: 'INVALID_CUSTOM_DOMAIN',
        message: 'Enter a valid public DNS hostname without a protocol or path',
      });
    }
    return hostname;
  }

  private isPublicHostname(hostname: string): boolean {
    const ipType = isIP(hostname);
    return (
      ipType === 0 &&
      hostname !== 'localhost' &&
      !hostname.endsWith('.localhost') &&
      !hostname.endsWith('.local') &&
      !hostname.endsWith('.internal') &&
      !hostname.endsWith('.test')
    );
  }

  private assertPublicResolveRateLimit(clientIp: string): void {
    const now = Date.now();
    if (this.publicResolveBuckets.size > 10_000) {
      for (const [key, bucket] of this.publicResolveBuckets) {
        if (now - bucket.startedAt >= PUBLIC_DOMAIN_RESOLVE_RATE_LIMIT_WINDOW_MS) {
          this.publicResolveBuckets.delete(key);
        }
      }
    }

    const key = clientIp || 'unknown';
    const current = this.publicResolveBuckets.get(key);
    if (
      !current ||
      now - current.startedAt >= PUBLIC_DOMAIN_RESOLVE_RATE_LIMIT_WINDOW_MS
    ) {
      this.publicResolveBuckets.set(key, { startedAt: now, count: 1 });
      return;
    }
    if (current.count >= PUBLIC_DOMAIN_RESOLVE_RATE_LIMIT_MAX_REQUESTS) {
      throw new HttpException(
        {
          code: 'PUBLIC_DOMAIN_RESOLVE_RATE_LIMITED',
          message: 'Too many public domain resolution requests. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    current.count += 1;
  }

  private toContract(record: CustomDomainDocument, includeToken: boolean): CustomDomain {
    return CustomDomainSchema.parse({
      id: record._id.toString(),
      workspaceId: record.workspaceId,
      ...(record.siteId ? { siteId: record.siteId } : {}),
      hostname: record.hostname,
      status: record.status,
      verificationMethod: record.verificationMethod,
      verificationHostname: record.verificationHostname,
      ...(includeToken && record.verificationToken
        ? { verificationToken: record.verificationToken }
        : {}),
      ...(record.verifiedAt ? { verifiedAt: record.verifiedAt.toISOString() } : {}),
      ...(record.lastCheckedAt
        ? { lastCheckedAt: record.lastCheckedAt.toISOString() }
        : {}),
      ...(record.failureReason ? { failureReason: record.failureReason } : {}),
      ...(record.landingPageId ? { landingPageId: record.landingPageId } : {}),
      isPrimary: record.isPrimary,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private publicNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'PUBLIC_PAGE_NOT_FOUND',
      message: 'The requested public page was not found',
    });
  }
}
