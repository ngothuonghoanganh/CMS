import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  FormIntegrationBindingListResponseSchema,
  FormIntegrationBindingSchema,
  PagePayloadV2Schema,
  UpdateFormIntegrationBindingRequestSchema,
  type FormIntegrationBinding,
  type FormIntegrationBindingListResponse,
  type PageNodeV2,
  type UpdateFormIntegrationBindingRequest,
} from '@payload/contracts';
import { randomUUID } from 'node:crypto';

import {
  FormIntegrationBindingRecord,
  type FormIntegrationBindingDocument,
} from '../persistence/schemas/form-integration-binding.schema';
import { IntegrationRecord } from '../persistence/schemas/integration.schema';
import { PageRecord, type PageDocument } from '../persistence/schemas/page.schema';
import { PageVersionRecord } from '../persistence/schemas/page-version.schema';

@Injectable()
export class FormIntegrationBindingService {
  constructor(
    @InjectModel(FormIntegrationBindingRecord.name)
    private readonly bindingModel: Model<FormIntegrationBindingRecord>,
    @InjectModel(IntegrationRecord.name)
    private readonly integrationModel: Model<IntegrationRecord>,
    @InjectModel(PageRecord.name)
    private readonly pageModel: Model<PageRecord>,
    @InjectModel(PageVersionRecord.name)
    private readonly versionModel: Model<PageVersionRecord>,
  ) {}

  async list(
    pageId: string,
    workspaceId: string,
  ): Promise<FormIntegrationBindingListResponse> {
    await this.requirePage(pageId, workspaceId);
    const records = await this.bindingModel
      .find({ landingPageId: pageId, workspaceId })
      .sort({ formNodeId: 1 })
      .exec();
    return FormIntegrationBindingListResponseSchema.parse({
      items: records.map((record) => this.toContract(record)),
    });
  }

  async update(
    pageId: string,
    formNodeId: string,
    workspaceId: string,
    input: UpdateFormIntegrationBindingRequest,
  ): Promise<FormIntegrationBinding> {
    const parsed = UpdateFormIntegrationBindingRequestSchema.parse(input);
    const page = await this.requirePage(pageId, workspaceId);
    const version = await this.versionModel
      .findOne({
        _id: page.currentDraftVersionId,
        landingPageId: pageId,
        workspaceId,
      })
      .exec();
    const payload = version ? PagePayloadV2Schema.safeParse(version.payload) : null;
    if (!payload?.success || !findForm(payload.data.root, formNodeId)) {
      throw new NotFoundException({
        code: 'FORM_NOT_FOUND',
        message: 'The form is not present in the current draft',
      });
    }

    const uniqueIds = [...new Set(parsed.integrationIds)];
    const integrations = await this.integrationModel
      .find({ _id: { $in: uniqueIds }, workspaceId })
      .select('_id')
      .exec();
    if (integrations.length !== uniqueIds.length) {
      throw new BadRequestException({
        code: 'INTEGRATION_NOT_FOUND',
        message: 'Every selected integration must belong to the active workspace',
      });
    }

    const record = await this.bindingModel
      .findOneAndUpdate(
        { landingPageId: pageId, formNodeId, workspaceId },
        {
          $set: { integrationIds: uniqueIds },
          $setOnInsert: { _id: randomUUID() },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
    if (!record) throw new Error('Failed to persist form integration binding');
    return this.toContract(record);
  }

  private async requirePage(pageId: string, workspaceId: string): Promise<PageDocument> {
    const page = await this.pageModel.findOne({ _id: pageId, workspaceId }).exec();
    if (!page) {
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: `Page ${pageId} was not found`,
      });
    }
    return page;
  }

  private toContract(record: FormIntegrationBindingDocument): FormIntegrationBinding {
    return FormIntegrationBindingSchema.parse({
      id: record._id.toString(),
      workspaceId: record.workspaceId,
      landingPageId: record.landingPageId,
      formNodeId: record.formNodeId,
      integrationIds: record.integrationIds,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }
}

function findForm(node: PageNodeV2, formNodeId: string): boolean {
  if (node.type === 'form') return node.id === formNodeId;
  return node.children.some((child) => findForm(child, formNodeId));
}
