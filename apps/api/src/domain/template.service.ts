import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

import {
  CreateTemplateRequestSchema,
  PaginationQuerySchema,
  TemplateListResponseSchema,
  TemplateSchema,
  UpdateTemplateRequestSchema,
  type CreateTemplateRequest,
  type PaginationQuery,
  type Template,
  type TemplateListResponse,
  type UpdateTemplateRequest,
} from '@payload/contracts';

import {
  TemplateRecord,
  type TemplateDocument,
} from '../persistence/schemas/template.schema';

@Injectable()
export class TemplateService {
  constructor(
    @InjectModel(TemplateRecord.name)
    private readonly templateModel: Model<TemplateRecord>,
  ) {}

  async create(workspaceId: string, input: CreateTemplateRequest): Promise<Template> {
    const parsedInput = CreateTemplateRequestSchema.parse(input);
    const record = await this.templateModel.create({
      _id: randomUUID(),
      workspaceId,
      ...parsedInput,
    });
    return this.toContract(record);
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

    return TemplateListResponseSchema.parse({
      items: records.map((record) => this.toContract(record)),
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
    if (!record) {
      throw this.notFound(templateId);
    }
    return this.toContract(record);
  }

  async update(
    workspaceId: string,
    templateId: string,
    input: UpdateTemplateRequest,
  ): Promise<Template> {
    const parsedInput = UpdateTemplateRequestSchema.parse(input);
    const update: Record<string, unknown> = {};
    if (parsedInput.name !== undefined) {
      update.name = parsedInput.name;
    }
    if (parsedInput.description === null) {
      update.$unset = { description: 1 };
    } else if (parsedInput.description !== undefined) {
      update.description = parsedInput.description;
    }

    const record = await this.templateModel
      .findOneAndUpdate({ _id: templateId, workspaceId }, update, {
        new: true,
        runValidators: true,
      })
      .exec();

    if (!record) {
      throw this.notFound(templateId);
    }
    return this.toContract(record);
  }

  async remove(workspaceId: string, templateId: string): Promise<void> {
    const result = await this.templateModel
      .deleteOne({ _id: templateId, workspaceId })
      .exec();
    if (result.deletedCount === 0) {
      throw this.notFound(templateId);
    }
  }

  private toContract(record: TemplateDocument): Template {
    return TemplateSchema.parse({
      createdAt: record.createdAt.toISOString(),
      description: record.description,
      id: record._id.toString(),
      name: record.name,
      payload: record.payload,
      updatedAt: record.updatedAt.toISOString(),
      workspaceId: record.workspaceId,
    });
  }

  private notFound(templateId: string): NotFoundException {
    return new NotFoundException({
      code: 'TEMPLATE_NOT_FOUND',
      message: `Template ${templateId} was not found`,
    });
  }
}
