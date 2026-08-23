import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

import {
  WorkspaceSchema,
  type Workspace,
  type CreateWorkspaceRequest,
} from '@payload/contracts';

import {
  WorkspaceRecord,
  type WorkspaceDocument,
} from '../persistence/schemas/workspace.schema';

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectModel(WorkspaceRecord.name)
    private readonly workspaceModel: Model<WorkspaceRecord>,
  ) {}

  async create(input: CreateWorkspaceRequest): Promise<Workspace> {
    const record = await this.workspaceModel.create({ _id: randomUUID(), ...input });
    return this.toContract(record);
  }

  async getById(id: string, workspaceId: string): Promise<Workspace> {
    const record =
      id === workspaceId ? await this.workspaceModel.findById(id).exec() : null;

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
      name: record.name,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }
}
