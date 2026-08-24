import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

import {
  WorkspaceSchema,
  type Workspace,
  type CreateWorkspaceRequest,
} from '@payload/contracts';

import { QuotaService } from '../billing/quota.service';
import {
  WorkspaceRecord,
  type WorkspaceDocument,
} from '../persistence/schemas/workspace.schema';
import { TenantContext } from '../tenancy/tenant-context';

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectModel(WorkspaceRecord.name)
    private readonly workspaceModel: Model<WorkspaceRecord>,
    @Inject(TenantContext) private readonly tenantContext: TenantContext,
    @Inject(QuotaService) private readonly quotas: QuotaService,
  ) {}

  async create(input: CreateWorkspaceRequest, _tenantId: string): Promise<Workspace> {
    return this.quotas.withHardQuota('workspaces', async () => {
      const record = await this.workspaceModel.create({
        _id: randomUUID(),
        ...input,
      });
      return this.toContract(record);
    });
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
