import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

import { env } from '../config/env';
import { WorkspaceRecord } from '../persistence/schemas/workspace.schema';

/**
 * The configured-principal demo workspace is infrastructure bootstrap data.
 * Keeping it here means authentication never creates a domain resource as a
 * side effect of a login request.
 */
@Injectable()
export class DemoWorkspaceBootstrap implements OnModuleInit {
  private readonly logger = new Logger(DemoWorkspaceBootstrap.name);

  constructor(
    @InjectModel(WorkspaceRecord.name)
    private readonly workspaceModel: Model<WorkspaceRecord>,
  ) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.workspaceModel.findOne().select({ _id: 1 }).exec();
    if (existing) {
      return;
    }

    await this.workspaceModel.create({
      _id: randomUUID(),
      name: env.AUTH_WORKSPACE_NAME,
    });
    this.logger.log('Created the configured-principal demo workspace during bootstrap');
  }
}
