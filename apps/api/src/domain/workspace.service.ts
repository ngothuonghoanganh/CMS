import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

import {
  WorkspaceSchema,
  SiteDesignSystemSchema,
  SiteDesignSystemResponseSchema,
  PublishDesignSystemRequestSchema,
  createDefaultSiteDesignSystem,
  type Workspace,
  type CreateWorkspaceRequest,
  type SiteDesignSystem,
  type SiteDesignSystemResponse,
  type PublishDesignSystemRequest,
} from '@payload/contracts';

import { QuotaService } from '../billing/quota.service';
import {
  WorkspaceRecord,
  type WorkspaceDocument,
} from '../persistence/schemas/workspace.schema';
import { TenantContext } from '../tenancy/tenant-context';
import { EventBus } from '../extensions/event-bus';

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectModel(WorkspaceRecord.name)
    private readonly workspaceModel: Model<WorkspaceRecord>,
    @Inject(TenantContext) private readonly tenantContext: TenantContext,
    @Inject(QuotaService) private readonly quotas: QuotaService,
    @Inject(EventBus) private readonly events: EventBus,
  ) {}

  async create(input: CreateWorkspaceRequest, _tenantId: string): Promise<Workspace> {
    return this.quotas.withHardQuota('workspaces', async () => {
      const record = await this.workspaceModel.create({
        _id: randomUUID(),
        designSystemDraft: createDefaultSiteDesignSystem(),
        publishedDesignSystem: createDefaultSiteDesignSystem(),
        ...input,
      });
      await this.events.publish('workspace.created', {
        tenantId: this.tenantContext.require().id,
        workspaceId: record._id.toString(),
        occurredAt: new Date().toISOString(),
      });
      return this.toContract(record);
    });
  }

  async getDesignSystem(workspaceId: string): Promise<SiteDesignSystemResponse> {
    const record = await this.workspaceModel.findOne({ _id: workspaceId }).exec();
    if (!record)
      throw new NotFoundException({
        code: 'WORKSPACE_NOT_FOUND',
        message: 'Workspace was not found',
      });
    const draft = record.designSystemDraft
      ? SiteDesignSystemSchema.parse(record.designSystemDraft)
      : createDefaultSiteDesignSystem();
    const published = record.publishedDesignSystem
      ? SiteDesignSystemSchema.parse(record.publishedDesignSystem)
      : undefined;
    return SiteDesignSystemResponseSchema.parse({
      draft,
      ...(published ? { published } : {}),
    });
  }

  async updateDesignSystem(
    workspaceId: string,
    input: SiteDesignSystem,
  ): Promise<SiteDesignSystemResponse> {
    const record = await this.workspaceModel.findOne({ _id: workspaceId }).exec();
    if (!record)
      throw new NotFoundException({
        code: 'WORKSPACE_NOT_FOUND',
        message: 'Workspace was not found',
      });
    record.designSystemDraft = SiteDesignSystemSchema.parse(input);
    await record.save();
    return this.getDesignSystem(workspaceId);
  }

  async publishDesignSystem(
    workspaceId: string,
    input: PublishDesignSystemRequest = {},
  ): Promise<SiteDesignSystemResponse> {
    const record = await this.workspaceModel.findOne({ _id: workspaceId }).exec();
    if (!record)
      throw new NotFoundException({
        code: 'WORKSPACE_NOT_FOUND',
        message: 'Workspace was not found',
      });
    const parsed = PublishDesignSystemRequestSchema.parse(input);
    if (
      parsed.expectedVersion &&
      parsed.expectedVersion !== record.updatedAt.toISOString()
    ) {
      throw new ConflictException({
        code: 'DESIGN_SYSTEM_VERSION_CONFLICT',
        message: 'The design system changed elsewhere. Reload before publishing.',
      });
    }
    const current = parsed.designSystem
      ? SiteDesignSystemSchema.parse(parsed.designSystem)
      : record.designSystemDraft
        ? SiteDesignSystemSchema.parse(record.designSystemDraft)
        : createDefaultSiteDesignSystem();
    // One document save updates both pointers so Publish cannot promote stale
    // server state when the editor has unsaved changes.
    record.designSystemDraft = current;
    record.publishedDesignSystem = current;
    await record.save();
    return this.getDesignSystem(workspaceId);
  }

  async getById(
    id: string,
    workspaceId: string,
    _organizationId?: string,
  ): Promise<Workspace> {
    const record =
      id === workspaceId ? await this.workspaceModel.findOne({ _id: id }).exec() : null;

    if (!record) {
      throw new NotFoundException({
        code: 'WORKSPACE_NOT_FOUND',
        message: `Workspace ${id} was not found`,
      });
    }

    return this.toContract(record);
  }

  private toContract(record: WorkspaceDocument): Workspace {
    return WorkspaceSchema.parse({
      id: record._id.toString(),
      organizationId: this.tenantContext.require().id,
      name: record.name,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }
}
