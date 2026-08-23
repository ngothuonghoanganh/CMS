import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

import {
  PaginationQuerySchema,
  SiteListResponseSchema,
  SiteSchema,
  type CreateSiteRequest,
  type PaginationQuery,
  type Site,
  type SiteListResponse,
  type UpdateSiteRequest,
} from '@payload/contracts';

import { DomainError } from './domain-error';
import { SiteRecord, type SiteDocument } from '../persistence/schemas/site.schema';
import { WorkspaceRecord } from '../persistence/schemas/workspace.schema';

@Injectable()
export class SiteService {
  constructor(
    @InjectModel(SiteRecord.name)
    private readonly siteModel: Model<SiteRecord>,
    @InjectModel(WorkspaceRecord.name)
    private readonly workspaceModel: Model<WorkspaceRecord>,
  ) {}

  async create(workspaceId: string, input: CreateSiteRequest): Promise<Site> {
    await this.requireWorkspace(workspaceId);
    const record = await this.siteModel.create({
      _id: randomUUID(),
      workspaceId,
      ...input,
    });
    return this.toContract(record);
  }

  async list(workspaceId: string, input: PaginationQuery): Promise<SiteListResponse> {
    await this.requireWorkspace(workspaceId);
    const query = PaginationQuerySchema.parse(input);
    const [records, total] = await Promise.all([
      this.siteModel
        .find({ workspaceId })
        .sort({ createdAt: -1, _id: -1 })
        .skip(query.offset)
        .limit(query.limit)
        .exec(),
      this.siteModel.countDocuments({ workspaceId }).exec(),
    ]);

    return SiteListResponseSchema.parse({
      items: records.map((record) => this.toContract(record)),
      pagination: {
        ...query,
        hasNextPage: query.offset + records.length < total,
        total,
      },
    });
  }

  async getById(workspaceId: string, siteId: string): Promise<Site> {
    const record = await this.siteModel.findOne({ _id: siteId, workspaceId }).exec();

    if (!record) {
      throw new NotFoundException({
        code: 'SITE_NOT_FOUND',
        message: `Site ${siteId} was not found in workspace ${workspaceId}`,
      });
    }

    return this.toContract(record);
  }

  async update(
    workspaceId: string,
    siteId: string,
    input: UpdateSiteRequest,
  ): Promise<Site> {
    const record = await this.siteModel
      .findOneAndUpdate(
        { _id: siteId, workspaceId },
        {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
        },
        { new: true, runValidators: true },
      )
      .exec();

    if (!record) {
      throw new NotFoundException({
        code: 'SITE_NOT_FOUND',
        message: `Site ${siteId} was not found in workspace ${workspaceId}`,
      });
    }

    return this.toContract(record);
  }

  private async requireWorkspace(workspaceId: string): Promise<void> {
    const workspace = await this.workspaceModel.exists({ _id: workspaceId });

    if (!workspace) {
      throw new NotFoundException({
        code: 'WORKSPACE_NOT_FOUND',
        message: `Workspace ${workspaceId} was not found`,
      });
    }
  }

  private toContract(record: SiteDocument): Site {
    try {
      return SiteSchema.parse({
        id: record._id.toString(),
        workspaceId: record.workspaceId,
        name: record.name,
        slug: record.slug,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      });
    } catch {
      throw new DomainError(
        'INVALID_PERSISTED_SITE',
        'Persisted site data is invalid',
        500,
      );
    }
  }
}
