import { Injectable } from '@nestjs/common';
import { workspaceOrigin } from '@plp/contracts';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { WorkspaceRecord } from './workspace.schema.js';
import { WorkspacesRepository } from './workspaces.repository.js';

/**
 * Where a workspace's members open the admin, for the links of emails (ADR-025): the workspace's
 * own address, or the common one when workspaces have no address of their own.
 */
@Injectable()
export class WorkspaceLinks {
  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly workspaces: WorkspacesRepository,
  ) {}

  /** For a workspace already read. */
  originFor(workspace: Pick<WorkspaceRecord, '_id' | 'slug'>): string {
    const template = this.env.ADMIN_WORKSPACE_ORIGIN_TEMPLATE;
    return template === undefined
      ? this.env.ADMIN_ORIGIN
      : workspaceOrigin(template, workspace.slug);
  }

  async originOf(workspaceId: ObjectId): Promise<string> {
    if (this.env.ADMIN_WORKSPACE_ORIGIN_TEMPLATE === undefined) {
      return this.env.ADMIN_ORIGIN;
    }
    const slug = await this.workspaces.findSlug(workspaceId);
    if (slug === null) {
      throw new Error(`Workspace ${workspaceId.toHexString()} has no address`);
    }
    return this.originFor({ _id: workspaceId, slug });
  }
}
