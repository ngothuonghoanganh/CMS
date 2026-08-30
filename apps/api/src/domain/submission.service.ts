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
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import {
  PagePayloadSchema,
  PaginationSchema,
  SubmissionListQuerySchema,
  SubmissionListResponseSchema,
  SubmitFormRequestSchema,
  SubmissionStatusSchema,
  FormSubmissionSchema,
  normalizePagePath,
  UpdateSubmissionRequestSchema,
  type FormField,
  type PageNodeV3,
  type PageNodeV2,
  type PageNodeV4,
  type FormProps,
  type FormSubmission,
  type SubmissionListQuery,
  type SubmissionListResponse,
  type SubmitFormRequest,
  type SubmitFormResponse,
  type UpdateSubmissionRequest,
} from '@payload/contracts';

import {
  FormSubmissionRecord,
  type FormSubmissionDocument,
} from '../persistence/schemas/form-submission.schema';
import { PageRecord, type PageDocument } from '../persistence/schemas/page.schema';
import {
  PageVersionRecord,
  type PageVersionDocument,
} from '../persistence/schemas/page-version.schema';
import { SiteRecord, type SiteDocument } from '../persistence/schemas/site.schema';
import { WorkspaceRecord } from '../persistence/schemas/workspace.schema';
import { UsageService } from '../billing/usage.service';
import { TenantContext } from '../tenancy/tenant-context';
import { IntegrationDispatcher } from './integration-dispatcher';
import { AnalyticsService } from './analytics.service';
import { platformLogger } from '../common/logging/platform-logger';
import { EventBus } from '../extensions/event-bus';

type ResolvedForm = {
  site: SiteDocument;
  page: PageDocument;
  version: PageVersionDocument;
  form: AnyFormNode;
};

type SubmissionContext = {
  site?: SiteDocument;
  page?: PageDocument;
  version?: PageVersionDocument;
  form?: AnyFormNode;
};

type AnyFormNode = {
  id: string;
  type: 'form';
  props: FormProps;
  children: [];
};

type RateBucket = { startedAt: number; count: number };

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

@Injectable()
export class SubmissionService {
  private readonly rateBuckets = new Map<string, RateBucket>();

  constructor(
    @InjectModel(FormSubmissionRecord.name)
    private readonly submissionModel: Model<FormSubmissionRecord>,
    @InjectModel(SiteRecord.name)
    private readonly siteModel: Model<SiteRecord>,
    @InjectModel(PageRecord.name)
    private readonly pageModel: Model<PageRecord>,
    @InjectModel(PageVersionRecord.name)
    private readonly versionModel: Model<PageVersionRecord>,
    @Inject(IntegrationDispatcher)
    private readonly integrationDispatcher: IntegrationDispatcher,
    @Inject(AnalyticsService)
    private readonly analyticsService: AnalyticsService,
    @InjectModel(WorkspaceRecord.name)
    private readonly workspaceModel: Model<WorkspaceRecord>,
    @Inject(UsageService) private readonly usage: UsageService,
    @Inject(TenantContext) private readonly tenantContext: TenantContext,
    @Inject(EventBus) private readonly events: EventBus,
  ) {}

  async submitPublic(
    siteSlug: string,
    pageSlug: string,
    formNodeId: string,
    input: SubmitFormRequest,
    clientIp: string,
  ): Promise<SubmitFormResponse> {
    return this.submitPublicByPath(
      siteSlug,
      pageSlug ? `/${pageSlug}` : '/',
      formNodeId,
      input,
      clientIp,
    );
  }

  async submitPublicByPath(
    siteSlug: string,
    pagePath: string,
    formNodeId: string,
    input: SubmitFormRequest,
    clientIp: string,
  ): Promise<SubmitFormResponse> {
    const parsedInput = SubmitFormRequestSchema.parse(input);
    const resolved = await this.resolvePublishedFormByPath(
      siteSlug,
      pagePath,
      formNodeId,
    );
    this.assertRateLimit(`${clientIp}:${resolved.site._id}:${resolved.form.id}`);

    // Honeypot submissions look successful to bots but never create a record.
    if (parsedInput.website?.trim()) {
      return { success: true };
    }

    const values = this.validateValues(resolved.form.props, parsedInput);
    const submittedAt = new Date();
    const submission = await this.submissionModel.create({
      _id: randomUUID(),
      workspaceId: resolved.site.workspaceId,
      siteId: resolved.site._id.toString(),
      landingPageId: resolved.page._id.toString(),
      pageVersionId: resolved.version._id.toString(),
      formNodeId: resolved.form.id,
      values,
      status: 'new',
      submittedAt,
    });
    try {
      await this.usage.increment(
        this.tenantContextId(),
        'form_submissions_monthly',
        1,
        submittedAt,
      );
    } catch (error) {
      platformLogger.warn(
        { err: error },
        'form-submission billing usage increment failed',
      );
    }
    try {
      await this.integrationDispatcher.enqueueForSubmission(
        submission._id.toString(),
        resolved.site.workspaceId,
      );
    } catch {
      // The lead is already durable. A temporary outbox/database failure must
      // not turn a successful form submission into a visitor-visible failure.
      platformLogger.warn(
        { submissionId: submission._id.toString() },
        'integration delivery enqueue failed after form submission',
      );
    }
    try {
      await this.analyticsService.recordSubmission({
        workspaceId: resolved.site.workspaceId,
        siteId: resolved.site._id.toString(),
        landingPageId: resolved.page._id.toString(),
        pageVersionId: resolved.version._id.toString(),
        publishedVersionNumber: resolved.version.versionNumber,
        submissionId: submission._id.toString(),
        submittedAt,
        ...(parsedInput.analyticsSessionId
          ? { sessionId: parsedInput.analyticsSessionId }
          : {}),
      });
    } catch {
      // Analytics is best effort after the authoritative FormSubmission write.
      platformLogger.warn(
        { submissionId: submission._id.toString() },
        'analytics conversion recording failed after form submission',
      );
    }

    await this.events.publish('form.submitted', {
      tenantId: this.tenantContext.require().id,
      eventId: submission._id.toString(),
      submissionId: submission._id.toString(),
      workspaceId: resolved.site.workspaceId,
      siteId: resolved.site._id.toString(),
      pageId: resolved.page._id.toString(),
      formNodeId: resolved.form.id,
      occurredAt: submittedAt.toISOString(),
    });
    await this.events.publish('lead.created', {
      tenantId: this.tenantContext.require().id,
      eventId: `lead:${submission._id.toString()}`,
      submissionId: submission._id.toString(),
      workspaceId: resolved.site.workspaceId,
      occurredAt: submittedAt.toISOString(),
    });

    return { success: true };
  }

  private tenantContextId(): string {
    return this.tenantContext.require().id;
  }

  async list(
    input: SubmissionListQuery,
    workspaceId: string,
  ): Promise<SubmissionListResponse> {
    const query = SubmissionListQuerySchema.parse(input);
    const filter: Record<string, unknown> = { workspaceId };
    if (query.siteId) filter.siteId = query.siteId;
    if (query.landingPageId) filter.landingPageId = query.landingPageId;
    if (query.status) filter.status = query.status;
    if (query.search) {
      filter['values.value'] = { $regex: escapeRegExp(query.search), $options: 'i' };
    }
    if (query.dateFrom || query.dateTo) {
      filter.submittedAt = {
        ...(query.dateFrom ? { $gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { $lte: new Date(query.dateTo) } : {}),
      };
    }

    const [records, total] = await Promise.all([
      this.submissionModel
        .find(filter)
        .sort({ submittedAt: -1, _id: -1 })
        .skip(query.offset)
        .limit(query.limit)
        .exec(),
      this.submissionModel.countDocuments(filter).exec(),
    ]);
    const context = await this.loadContext(records, workspaceId);
    const items = records.map((record) =>
      this.toContract(record, context.get(record._id)),
    );

    return SubmissionListResponseSchema.parse({
      items,
      pagination: PaginationSchema.parse({
        limit: query.limit,
        offset: query.offset,
        total,
        hasNextPage: query.offset + records.length < total,
      }),
    });
  }

  async getById(id: string, workspaceId: string): Promise<FormSubmission> {
    const record = await this.submissionModel.findOne({ _id: id, workspaceId }).exec();
    if (!record) throw this.notFound(id);
    const context = await this.loadSingleContext(record, workspaceId);
    return this.toContract(record, context);
  }

  async updateStatus(
    id: string,
    input: UpdateSubmissionRequest,
    workspaceId: string,
  ): Promise<FormSubmission> {
    const parsed = UpdateSubmissionRequestSchema.parse(input);
    const record = await this.submissionModel
      .findOneAndUpdate(
        { _id: id, workspaceId },
        { $set: { status: parsed.status } },
        { new: true },
      )
      .exec();
    if (!record) throw this.notFound(id);
    const context = await this.loadSingleContext(record, workspaceId);
    return this.toContract(record, context);
  }

  private async resolvePublishedFormByPath(
    siteSlug: string,
    pagePath: string,
    formNodeId: string,
  ): Promise<ResolvedForm> {
    const sites = await this.siteModel.find({ slug: siteSlug }).limit(2).exec();
    if (sites.length !== 1 || !sites[0]) throw this.publicNotFound();
    const site = sites[0];
    if (!(await this.workspaceModel.exists({ _id: site.workspaceId }))) {
      throw this.publicNotFound();
    }
    const normalizedPath = normalizePagePath(pagePath);
    if (!normalizedPath) throw this.publicNotFound();
    const page =
      normalizedPath === '/' && site.homePageId
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
              path: normalizedPath,
              workspaceId: site.workspaceId,
            })
            .exec();
    const legacyPage =
      page ??
      (normalizedPath === '/'
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
              slug: normalizedPath.slice(1),
              workspaceId: site.workspaceId,
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
    const form = findForm(payload.data.root, formNodeId);
    if (!form) throw this.publicNotFound();
    return { site, page: legacyPage, version, form };
  }

  private validateValues(
    form: FormProps,
    input: SubmitFormRequest,
  ): Array<{ fieldId: string; value: string | boolean }> {
    const fieldsById = new Map(form.fields.map((field) => [field.id, field]));
    const received = new Map<string, string | boolean>();
    for (const submitted of input.values) {
      if (!fieldsById.has(submitted.fieldId) || received.has(submitted.fieldId)) {
        throw this.validationError('Unknown or duplicate form field');
      }
      received.set(submitted.fieldId, submitted.value);
    }

    return form.fields.map((field) => {
      const raw = received.get(field.id);
      const value = raw === undefined ? (field.type === 'checkbox' ? false : '') : raw;
      return { fieldId: field.id, value: normalizeFieldValue(field, value) };
    });
  }

  private async loadContext(
    records: FormSubmissionDocument[],
    workspaceId: string,
  ): Promise<Map<string, SubmissionContext>> {
    const siteIds = [...new Set(records.map((record) => record.siteId))];
    const pageIds = [...new Set(records.map((record) => record.landingPageId))];
    const versionIds = [...new Set(records.map((record) => record.pageVersionId))];
    const [sites, pages, versions] = await Promise.all([
      this.siteModel.find({ _id: { $in: siteIds }, workspaceId }).exec(),
      this.pageModel.find({ _id: { $in: pageIds }, workspaceId }).exec(),
      this.versionModel.find({ _id: { $in: versionIds }, workspaceId }).exec(),
    ]);
    const siteMap = new Map(sites.map((site) => [site._id.toString(), site]));
    const pageMap = new Map(pages.map((page) => [page._id.toString(), page]));
    const versionMap = new Map(
      versions.map((version) => [version._id.toString(), version]),
    );
    return new Map(
      records.map((record) => {
        const version = versionMap.get(record.pageVersionId);
        const site = siteMap.get(record.siteId);
        const page = pageMap.get(record.landingPageId);
        const form = version
          ? findFormFromVersion(version, record.formNodeId)
          : undefined;
        return [
          record._id.toString(),
          {
            ...(site ? { site } : {}),
            ...(page ? { page } : {}),
            ...(version ? { version } : {}),
            ...(form ? { form } : {}),
          },
        ];
      }),
    );
  }

  private async loadSingleContext(
    record: FormSubmissionDocument,
    workspaceId: string,
  ): Promise<SubmissionContext> {
    const map = await this.loadContext([record], workspaceId);
    return map.get(record._id.toString()) ?? {};
  }

  private toContract(
    record: FormSubmissionDocument,
    context: SubmissionContext | undefined,
  ): FormSubmission {
    const fieldMap = new Map(
      context?.form?.props.fields.map((field) => [field.id, field]),
    );
    const pagePath = context?.page
      ? context.site?.homePageId === context.page._id.toString()
        ? '/'
        : normalizePagePath(
            context.page.path ?? (context.page.slug ? `/${context.page.slug}` : '/'),
          )
      : undefined;
    return FormSubmissionSchema.parse({
      id: record._id.toString(),
      workspaceId: record.workspaceId,
      siteId: record.siteId,
      siteName: context?.site?.name ?? 'Unknown site',
      landingPageId: record.landingPageId,
      pageName: context?.page?.name ?? 'Unknown page',
      ...(pagePath ? { pagePath } : {}),
      ...(context?.page?.slug ? { pageSlug: context.page.slug } : {}),
      pageVersionId: record.pageVersionId,
      formNodeId: record.formNodeId,
      fields: record.values.map((entry) => {
        const field = fieldMap.get(entry.fieldId);
        return {
          fieldId: entry.fieldId,
          label: field?.label ?? entry.fieldId,
          name: field?.name ?? entry.fieldId,
          type: field?.type ?? 'text',
          value: entry.value,
        };
      }),
      status: SubmissionStatusSchema.parse(record.status),
      submittedAt: record.submittedAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private assertRateLimit(key: string): void {
    const now = Date.now();
    const current = this.rateBuckets.get(key);
    if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
      this.rateBuckets.set(key, { startedAt: now, count: 1 });
      return;
    }
    if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
      throw new HttpException(
        {
          code: 'FORM_RATE_LIMITED',
          message: 'Too many submissions. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    current.count += 1;
  }

  private validationError(message: string): BadRequestException {
    return new BadRequestException({ code: 'FORM_VALIDATION_FAILED', message });
  }

  private publicNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'FORM_NOT_FOUND',
      message: 'The requested published form was not found',
    });
  }

  private notFound(id: string): NotFoundException {
    return new NotFoundException({
      code: 'SUBMISSION_NOT_FOUND',
      message: `Submission ${id} was not found`,
    });
  }
}

function findForm(
  node: PageNodeV2 | PageNodeV3 | PageNodeV4,
  formNodeId: string,
): AnyFormNode | null {
  if (node.type === 'form') {
    return node.id === formNodeId
      ? { id: node.id, type: 'form', props: node.props, children: [] }
      : null;
  }
  for (const child of node.children) {
    const form = findForm(child, formNodeId);
    if (form) return form;
  }
  return null;
}

function findFormFromVersion(
  version: PageVersionDocument,
  formNodeId: string,
): AnyFormNode | undefined {
  const payload = PagePayloadSchema.safeParse(version.payload);
  return payload.success
    ? (findForm(payload.data.root, formNodeId) ?? undefined)
    : undefined;
}

function normalizeFieldValue(
  field: FormField,
  value: string | boolean,
): string | boolean {
  if (field.type === 'checkbox') {
    if (typeof value !== 'boolean')
      throw new BadRequestException({
        code: 'FORM_VALIDATION_FAILED',
        message: `${field.label} must be a boolean`,
      });
    if (field.required && !value)
      throw new BadRequestException({
        code: 'FORM_VALIDATION_FAILED',
        message: `${field.label} is required`,
      });
    return value;
  }
  if (typeof value !== 'string')
    throw new BadRequestException({
      code: 'FORM_VALIDATION_FAILED',
      message: `${field.label} must be text`,
    });
  const normalized = value.trim();
  if (field.required && normalized.length === 0)
    throw new BadRequestException({
      code: 'FORM_VALIDATION_FAILED',
      message: `${field.label} is required`,
    });
  if (
    field.type === 'email' &&
    normalized &&
    !z.string().email().safeParse(normalized).success
  ) {
    throw new BadRequestException({
      code: 'FORM_VALIDATION_FAILED',
      message: `${field.label} must be a valid email address`,
    });
  }
  if ((field.type === 'select' || field.type === 'radio') && normalized) {
    if (!field.options.some((option) => option.value === normalized)) {
      throw new BadRequestException({
        code: 'FORM_VALIDATION_FAILED',
        message: `${field.label} has an invalid option`,
      });
    }
  }
  return normalized;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
