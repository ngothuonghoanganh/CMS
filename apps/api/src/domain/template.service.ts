import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

import {
  ApplyTemplateRequestSchema,
  CreateTemplateRequestSchema,
  PaginationQuerySchema,
  TemplateListResponseSchema,
  TemplateSchema,
  TemplateVersionSchema,
  TemplateVersionsResponseSchema,
  UpdateTemplateRequestSchema,
  type ApplyTemplateRequest,
  type CreateTemplateRequest,
  type PageLayoutAttachment,
  type PagePayload,
  type PaginationQuery,
  type PublishTemplateRequest,
  type Template,
  type TemplateListResponse,
  type TemplateVersion,
  type TemplateVersionsResponse,
  type UpdateTemplateRequest,
} from '@payload/contracts';

import {
  TemplateRecord,
  TemplateVersionRecord,
  type TemplateDocument,
  type TemplateVersionDocument,
} from '../persistence/schemas/template.schema';
import { PageService } from './page.service';

/**
 * Design Templates are immutable, versioned starter snapshots. Applying a
 * template clones its payload and attachment configuration into an
 * independent Page; there is never a live link back to the template, and
 * editing a template never mutates pages that were created from it.
 */
@Injectable()
export class TemplateService {
  constructor(
    @InjectModel(TemplateRecord.name)
    private readonly templateModel: Model<TemplateRecord>,
    @InjectModel(TemplateVersionRecord.name)
    private readonly versionModel: Model<TemplateVersionRecord>,
    @Inject(PageService)
    private readonly pages: PageService,
  ) {}

  async create(workspaceId: string, input: CreateTemplateRequest): Promise<Template> {
    const parsedInput = CreateTemplateRequestSchema.parse(input);
    const versionId = randomUUID();
    const record = await this.templateModel.create({
      _id: randomUUID(),
      workspaceId,
      ...(parsedInput.siteId ? { siteId: parsedInput.siteId } : {}),
      name: parsedInput.name,
      ...(parsedInput.description ? { description: parsedInput.description } : {}),
      latestVersionId: versionId,
    });
    await this.versionModel.create({
      _id: versionId,
      templateId: record._id.toString(),
      versionNumber: 1,
      payload: parsedInput.payload,
      ...(parsedInput.layoutAttachments
        ? { layoutAttachments: parsedInput.layoutAttachments }
        : {}),
    });
    return this.toContract(record, {
      id: versionId,
      payload: parsedInput.payload,
      ...(parsedInput.layoutAttachments
        ? { layoutAttachments: parsedInput.layoutAttachments }
        : {}),
    });
  }

  async list(workspaceId: string, input: PaginationQuery): Promise<TemplateListResponse> {
    const query = PaginationQuerySchema.parse(input);
    const [records, total] = await Promise.all([
      this.templateModel
        .find({ workspaceId })
        .sort({ createdAt: -1, _id: -1 })
        .skip(query.offset)
        .limit(query.limit)
        .exec(),
      this.templateModel.countDocuments({ workspaceId }).exec(),
    ]);
    const items = await this.resolveRecords(records);
    return TemplateListResponseSchema.parse({
      items,
      pagination: {
        ...query,
        hasNextPage: query.offset + records.length < total,
        total,
      },
    });
  }

  async getById(workspaceId: string, templateId: string): Promise<Template> {
    const record = await this.templateModel
      .findOne({ _id: templateId, workspaceId })
      .exec();
    if (!record) throw this.notFound(templateId);
    return (await this.resolveRecords([record]))[0]!;
  }

  async update(
    workspaceId: string,
    templateId: string,
    input: UpdateTemplateRequest,
  ): Promise<Template> {
    const parsedInput = UpdateTemplateRequestSchema.parse(input);
    const record = await this.templateModel
      .findOne({ _id: templateId, workspaceId })
      .exec();
    if (!record) throw this.notFound(templateId);

    if (parsedInput.name !== undefined) record.name = parsedInput.name;
    if (parsedInput.description !== undefined) {
      if (parsedInput.description === null) record.set('description', undefined);
      else record.description = parsedInput.description;
    }
    if (
      parsedInput.payload !== undefined ||
      parsedInput.layoutAttachments !== undefined
    ) {
      const latest = await this.versionModel
        .findOne({ _id: record.latestVersionId, templateId })
        .exec();
      const payload = parsedInput.payload ?? (latest?.payload as PagePayload | undefined);
      const layoutAttachments =
        parsedInput.layoutAttachments ??
        (latest?.layoutAttachments as PageLayoutAttachment[] | undefined) ??
        (parsedInput.payload ? [] : undefined);
      if (payload === undefined) {
        throw new ConflictException({
          code: 'TEMPLATE_PAYLOAD_REQUIRED',
          message: 'The template does not have a payload to version',
        });
      }
      const version = await this.createVersion(record, payload, layoutAttachments);
      record.latestVersionId = version.id;
    }
    await record.save();
    return (await this.resolveRecords([record]))[0]!;
  }

  async remove(workspaceId: string, templateId: string): Promise<void> {
    const record = await this.templateModel
      .findOne({ _id: templateId, workspaceId })
      .exec();
    if (!record) throw this.notFound(templateId);
    await this.versionModel.deleteMany({ templateId }).exec();
    await record.deleteOne();
  }

  async listVersions(
    workspaceId: string,
    templateId: string,
  ): Promise<TemplateVersionsResponse> {
    await this.requireRecord(workspaceId, templateId);
    const records = await this.versionModel
      .find({ templateId })
      .sort({ versionNumber: -1, _id: -1 })
      .exec();
    return TemplateVersionsResponseSchema.parse({
      items: records.map((record) => this.toVersion(record)),
    });
  }

  async getVersion(
    workspaceId: string,
    templateId: string,
    versionNumber: number,
  ): Promise<TemplateVersion> {
    await this.requireRecord(workspaceId, templateId);
    const record = await this.versionModel.findOne({ templateId, versionNumber }).exec();
    if (!record) throw this.versionNotFound(templateId, versionNumber);
    return this.toVersion(record);
  }

  async publish(
    workspaceId: string,
    templateId: string,
    input: PublishTemplateRequest,
  ): Promise<Template> {
    const record = await this.templateModel
      .findOne({ _id: templateId, workspaceId })
      .exec();
    if (!record) throw this.notFound(templateId);
    if (!record.latestVersionId) {
      throw new ConflictException({
        code: 'TEMPLATE_NO_VERSION',
        message: 'The template does not have a version to publish',
      });
    }
    const version = input.versionNumber
      ? await this.versionModel
          .findOne({ templateId, versionNumber: input.versionNumber })
          .exec()
      : await this.versionModel
          .findOne({ _id: record.latestVersionId, templateId })
          .exec();
    if (!version) {
      throw this.versionNotFound(templateId, input.versionNumber ?? 0);
    }
    record.publishedVersionId = version._id.toString();
    await record.save();
    return (await this.resolveRecords([record]))[0]!;
  }

  async apply(
    workspaceId: string,
    siteId: string,
    templateId: string,
    input: ApplyTemplateRequest,
  ) {
    const parsedInput = ApplyTemplateRequestSchema.parse(input);
    const record = await this.templateModel
      .findOne({ _id: templateId, workspaceId })
      .exec();
    if (!record) throw this.notFound(templateId);

    const version = parsedInput.templateVersionId
      ? await this.versionModel
          .findOne({ _id: parsedInput.templateVersionId, templateId })
          .exec()
      : await this.versionModel
          .findOne({
            _id: record.publishedVersionId ?? record.latestVersionId,
            templateId,
          })
          .exec();
    if (!version) {
      throw new NotFoundException({
        code: 'TEMPLATE_VERSION_NOT_FOUND',
        message: 'The selected template version was not found',
      });
    }

    const payload = clonePayload(version.payload as PagePayload);
    const attachments = version.layoutAttachments
      ? cloneAttachments(version.layoutAttachments as PageLayoutAttachment[])
      : undefined;
    const name = parsedInput.name ?? `${record.name} page`;

    return this.pages.create(
      siteId,
      {
        name,
        ...(parsedInput.description ? { description: parsedInput.description } : {}),
        ...(parsedInput.path ? { path: parsedInput.path } : {}),
        ...(parsedInput.slug ? { slug: parsedInput.slug } : {}),
        ...(parsedInput.kind ? { kind: parsedInput.kind } : {}),
        payload,
        ...(attachments ? { layoutAttachments: attachments } : {}),
        appliedTemplate: {
          templateId,
          templateVersionId: version._id.toString(),
          appliedAt: new Date().toISOString(),
        },
      },
      workspaceId,
    );
  }

  private async createVersion(
    record: TemplateDocument,
    payload: PagePayload,
    layoutAttachments: unknown[] | undefined,
  ): Promise<TemplateVersion> {
    const latest = await this.versionModel
      .findOne({ templateId: record._id.toString() })
      .sort({ versionNumber: -1 })
      .select({ versionNumber: 1 })
      .exec();
    const versionNumber = (latest?.versionNumber ?? 0) + 1;
    const created = await this.versionModel.create({
      _id: randomUUID(),
      templateId: record._id.toString(),
      versionNumber,
      payload,
      ...(layoutAttachments ? { layoutAttachments } : {}),
    });
    return this.toVersion(created);
  }

  private async resolveRecords(records: TemplateDocument[]): Promise<Template[]> {
    const versionIds = records
      .map((record) => record.latestVersionId)
      .filter((id): id is string => typeof id === 'string');
    const versions = versionIds.length
      ? await this.versionModel.find({ _id: { $in: versionIds } }).exec()
      : [];
    const byId = new Map(versions.map((version) => [version._id.toString(), version]));
    return records.map((record) => {
      const latest = byId.get(record.latestVersionId);
      return this.toContract(record, latest ? this.toVersion(latest) : undefined);
    });
  }

  private toContract(
    record: TemplateDocument,
    latest?:
      | {
          id: string;
          payload: PagePayload;
          layoutAttachments?: PageLayoutAttachment[] | undefined;
        }
      | undefined,
  ): Template {
    if (!latest) {
      throw new NotFoundException({
        code: 'TEMPLATE_VERSION_NOT_FOUND',
        message: `Template ${record._id.toString()} has no version`,
      });
    }
    return TemplateSchema.parse({
      id: record._id.toString(),
      workspaceId: record.workspaceId,
      ...(record.siteId ? { siteId: record.siteId } : {}),
      name: record.name,
      ...(record.description ? { description: record.description } : {}),
      payload: latest.payload,
      ...(latest.layoutAttachments
        ? { layoutAttachments: latest.layoutAttachments }
        : {}),
      latestVersionId: latest.id,
      ...(record.publishedVersionId
        ? { publishedVersionId: record.publishedVersionId }
        : {}),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private toVersion(record: TemplateVersionDocument): TemplateVersion {
    return TemplateVersionSchema.parse({
      id: record._id.toString(),
      templateId: record.templateId,
      versionNumber: record.versionNumber,
      payload: record.payload,
      ...(record.layoutAttachments
        ? { layoutAttachments: record.layoutAttachments }
        : {}),
      createdAt: record.createdAt.toISOString(),
      ...(record.createdBy ? { createdBy: record.createdBy } : {}),
    });
  }

  private async requireRecord(workspaceId: string, templateId: string): Promise<void> {
    const record = await this.templateModel
      .findOne({ _id: templateId, workspaceId })
      .exec();
    if (!record) throw this.notFound(templateId);
  }

  private notFound(templateId: string): NotFoundException {
    return new NotFoundException({
      code: 'TEMPLATE_NOT_FOUND',
      message: `Template ${templateId} was not found`,
    });
  }

  private versionNotFound(templateId: string, versionNumber: number): NotFoundException {
    return new NotFoundException({
      code: 'TEMPLATE_VERSION_NOT_FOUND',
      message: `Version ${versionNumber} for template ${templateId} was not found`,
    });
  }
}

function clonePayload(payload: PagePayload): PagePayload {
  return JSON.parse(JSON.stringify(payload)) as PagePayload;
}

function cloneAttachments(attachments: PageLayoutAttachment[]): PageLayoutAttachment[] {
  return JSON.parse(JSON.stringify(attachments)) as PageLayoutAttachment[];
}
