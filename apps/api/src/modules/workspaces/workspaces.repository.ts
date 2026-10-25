import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Role } from '@plp/contracts';
import type { Model } from 'mongoose';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceScope } from './workspace-scope.js';
import {
  MEMBERSHIP_MODEL,
  type MembershipRecord,
  WORKSPACE_MODEL,
  type WorkspaceRecord,
} from './workspace.schema.js';

@Injectable()
export class WorkspacesRepository {
  constructor(
    @InjectModel(WORKSPACE_MODEL) private readonly workspaces: Model<WorkspaceRecord>,
    @InjectModel(MEMBERSHIP_MODEL) private readonly memberships: Model<MembershipRecord>,
  ) {}

  async createWithOwner(name: string, ownerId: ObjectId, tx: Tx): Promise<WorkspaceRecord> {
    const now = new Date();
    const [workspace] = await this.workspaces.create(
      [{ name, siteSeq: 0, createdBy: ownerId, createdAt: now }],
      { session: tx },
    );
    if (!workspace) {
      throw new Error('Workspace insert returned no document');
    }
    await this.memberships.create(
      [{ workspaceId: workspace._id, userId: ownerId, role: 'owner', createdAt: now }],
      {
        session: tx,
      },
    );
    return workspace.toObject();
  }

  /**
   * Increments `siteSeq` inside a site-creation transaction. The write makes concurrent creations
   * in the workspace conflict, so the site count read afterwards in the same transaction is exact.
   */
  async recordSiteCreation(scope: WorkspaceScope, tx: Tx): Promise<void> {
    const result = await this.workspaces
      .updateOne({ _id: scope.workspaceId }, { $inc: { siteSeq: 1 } }, { session: tx })
      .exec();
    if (result.matchedCount === 0) {
      throw new Error(`Workspace ${scope.workspaceId.toHexString()} of the scope does not exist`);
    }
  }

  findMembership(workspaceId: ObjectId, userId: ObjectId): Promise<MembershipRecord | null> {
    return this.memberships.findOne({ workspaceId, userId }).lean<MembershipRecord>().exec();
  }

  /** Memberships of a user with their workspace names, oldest first. */
  async listForUser(userId: ObjectId): Promise<{ workspace: WorkspaceRecord; role: Role }[]> {
    const memberships = await this.memberships
      .find({ userId })
      .sort({ createdAt: 1 })
      .lean<MembershipRecord[]>()
      .exec();
    if (memberships.length === 0) {
      return [];
    }
    const workspaces = await this.workspaces
      .find({ _id: { $in: memberships.map((membership) => membership.workspaceId) } })
      .lean<WorkspaceRecord[]>()
      .exec();
    const byId = new Map(workspaces.map((workspace) => [workspace._id.toHexString(), workspace]));
    return memberships.flatMap((membership) => {
      const workspace = byId.get(membership.workspaceId.toHexString());
      return workspace ? [{ workspace, role: membership.role }] : [];
    });
  }
}
