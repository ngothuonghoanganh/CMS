import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  type AccessGrant,
  assignableRoleSchema,
  customRoleIdOf,
  MEMBERS_MAX,
  type Role,
  roleSchema,
  rolesWith,
} from '@plp/contracts';
import type { Model } from 'mongoose';
import { type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';

/** A grant as stored: site ids parsed, a custom role as `custom` with its id (ADR-024). */
export interface StoredGrant {
  role: Exclude<Role, 'owner'> | 'custom';
  customRoleId: ObjectId | null;
  siteIds: ObjectId[] | null;
}

function storedSiteIds(grant: AccessGrant): ObjectId[] | null {
  return grant.siteIds === null ? null : grant.siteIds.map((id) => toObjectId(id));
}

/** The grant of a request, with its ids parsed (already validated by the schema). */
export function storedGrant(grant: AccessGrant): StoredGrant {
  const customRoleId = customRoleIdOf(grant.role);
  return customRoleId === null
    ? {
        role: assignableRoleSchema.parse(grant.role),
        customRoleId: null,
        siteIds: storedSiteIds(grant),
      }
    : { role: 'custom', customRoleId: toObjectId(customRoleId), siteIds: storedSiteIds(grant) };
}
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

  /**
   * Increments `inviteSeq` inside the transaction that creates invitations. The write makes two
   * batches at once conflict, so the count of people read afterwards in the same transaction is
   * exact and the member limit holds.
   */
  async recordInvitations(scope: WorkspaceScope, tx: Tx): Promise<void> {
    const result = await this.workspaces
      .updateOne({ _id: scope.workspaceId }, { $inc: { inviteSeq: 1 } }, { session: tx })
      .exec();
    if (result.matchedCount === 0) {
      throw new Error(`Workspace ${scope.workspaceId.toHexString()} of the scope does not exist`);
    }
  }

  /** Increments `customRoleSeq` in the transaction that creates a custom role (ADR-024). */
  async recordCustomRole(scope: WorkspaceScope, tx: Tx): Promise<void> {
    const result = await this.workspaces
      .updateOne({ _id: scope.workspaceId }, { $inc: { customRoleSeq: 1 } }, { session: tx })
      .exec();
    if (result.matchedCount === 0) {
      throw new Error(`Workspace ${scope.workspaceId.toHexString()} of the scope does not exist`);
    }
  }

  /**
   * Holds the inviter's membership in an invitation transaction, while their role may still
   * invite: a role change or removal at the same moment conflicts with it. False when it may not.
   */
  async holdInviter(scope: WorkspaceScope, tx: Tx): Promise<boolean> {
    const result = await this.memberships
      .updateOne(
        {
          workspaceId: scope.workspaceId,
          userId: scope.userId,
          role: { $in: rolesWith('members.manage') },
        },
        { $inc: { inviteSeq: 1 } },
        { session: tx },
      )
      .exec();
    return result.matchedCount === 1;
  }

  /** Members holding a custom role; `withSites` only those kept to some sites. */
  countCustomRoleHolders(
    scope: WorkspaceScope,
    roleId: ObjectId,
    options: { withSites?: boolean } = {},
    tx?: Tx,
  ): Promise<number> {
    return this.memberships
      .countDocuments(
        {
          workspaceId: scope.workspaceId,
          role: 'custom',
          customRoleId: roleId,
          ...(options.withSites === true ? { siteIds: { $type: 'array' } } : {}),
        },
        tx ? { session: tx } : {},
      )
      .exec();
  }

  findWorkspace(scope: WorkspaceScope): Promise<WorkspaceRecord | null> {
    return this.workspaces.findById(scope.workspaceId).lean<WorkspaceRecord>().exec();
  }

  /** The workspace an invitation is for; no scope yet, the link is the proof (ADR-021). */
  findWorkspaceForInvitation(workspaceId: ObjectId): Promise<WorkspaceRecord | null> {
    return this.workspaces.findById(workspaceId).lean<WorkspaceRecord>().exec();
  }

  /** Members of the workspace, oldest first; at most `MEMBERS_MAX` (ADR-021). */
  async listMembers(scope: WorkspaceScope): Promise<MembershipRecord[]> {
    const members = await this.memberships
      .find({ workspaceId: scope.workspaceId })
      .sort({ createdAt: 1, _id: 1 })
      .limit(MEMBERS_MAX + 1)
      .lean<MembershipRecord[]>()
      .exec();
    if (members.length > MEMBERS_MAX) {
      throw new Error(
        `Workspace ${scope.workspaceId.toHexString()} holds more than ${MEMBERS_MAX} members (ADR-021)`,
      );
    }
    return members;
  }

  countMembers(scope: WorkspaceScope, tx?: Tx): Promise<number> {
    return this.memberships
      .countDocuments({ workspaceId: scope.workspaceId }, tx ? { session: tx } : {})
      .exec();
  }

  findMember(scope: WorkspaceScope, userId: ObjectId): Promise<MembershipRecord | null> {
    return this.memberships
      .findOne({ workspaceId: scope.workspaceId, userId })
      .lean<MembershipRecord>()
      .exec();
  }

  findOwner(scope: WorkspaceScope): Promise<MembershipRecord | null> {
    return this.memberships
      .findOne({ workspaceId: scope.workspaceId, role: 'owner' })
      .lean<MembershipRecord>()
      .exec();
  }

  /** Changes a member's role and sites; never Chủ sở hữu's. Null when there is no such member. */
  updateGrant(
    scope: WorkspaceScope,
    userId: ObjectId,
    grant: StoredGrant,
    tx?: Tx,
  ): Promise<MembershipRecord | null> {
    return this.memberships
      .findOneAndUpdate(
        { workspaceId: scope.workspaceId, userId, role: { $ne: 'owner' } },
        { $set: { role: grant.role, customRoleId: grant.customRoleId, siteIds: grant.siteIds } },
        { new: true, ...(tx ? { session: tx } : {}) },
      )
      .lean<MembershipRecord>()
      .exec();
  }

  /** Removes a member; never Chủ sở hữu. False when there was no such member. */
  async removeMember(scope: WorkspaceScope, userId: ObjectId, tx: Tx): Promise<boolean> {
    const result = await this.memberships
      .deleteOne(
        { workspaceId: scope.workspaceId, userId, role: { $ne: 'owner' } },
        { session: tx },
      )
      .exec();
    return result.deletedCount === 1;
  }

  /**
   * Makes the Quản trị `toUserId` Chủ sở hữu and `fromUserId` Quản trị, in the caller's
   * transaction. False when either is no longer in that role: the transaction must be aborted.
   */
  async transferOwnership(
    scope: WorkspaceScope,
    fromUserId: ObjectId,
    toUserId: ObjectId,
    tx: Tx,
  ): Promise<boolean> {
    const demoted = await this.memberships
      .updateOne(
        { workspaceId: scope.workspaceId, userId: fromUserId, role: 'owner' },
        { $set: { role: 'admin', customRoleId: null, siteIds: null } },
        { session: tx },
      )
      .exec();
    const promoted = await this.memberships
      .updateOne(
        { workspaceId: scope.workspaceId, userId: toUserId, role: 'admin' },
        { $set: { role: 'owner', customRoleId: null, siteIds: null } },
        { session: tx },
      )
      .exec();
    return demoted.modifiedCount === 1 && promoted.modifiedCount === 1;
  }

  /**
   * Adds the user to the workspace an invitation is for (ADR-021): no scope yet, the invitation
   * is the authority. False when they are a member already. Read in the transaction, not caught as
   * a duplicate key: a write error aborts a MongoDB transaction, and committing it then retries.
   */
  async joinByInvitation(
    workspaceId: ObjectId,
    userId: ObjectId,
    grant: StoredGrant,
    now: Date,
    tx: Tx,
  ): Promise<boolean> {
    const existing = await this.memberships.exists({ workspaceId, userId }).session(tx).exec();
    if (existing !== null) {
      return false;
    }
    await this.memberships.create(
      [
        {
          workspaceId,
          userId,
          role: grant.role,
          customRoleId: grant.customRoleId,
          siteIds: grant.siteIds,
          createdAt: now,
        },
      ],
      { session: tx },
    );
    return true;
  }

  findMembership(workspaceId: ObjectId, userId: ObjectId): Promise<MembershipRecord | null> {
    return this.memberships.findOne({ workspaceId, userId }).lean<MembershipRecord>().exec();
  }

  /** Chủ sở hữu, for a job that acts for nobody (the domain monitor's emails). */
  findOwnerOf(workspaceId: ObjectId): Promise<MembershipRecord | null> {
    return this.memberships.findOne({ workspaceId, role: 'owner' }).lean<MembershipRecord>().exec();
  }

  /** Memberships of a user with their workspace names, oldest first. */
  async listForUser(
    userId: ObjectId,
  ): Promise<{ workspace: WorkspaceRecord; membership: MembershipRecord }[]> {
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
      return workspace ? [{ workspace, membership }] : [];
    });
  }

  /** Members of the workspace per role; one group per role, so the result is bounded. */
  async countByRole(scope: WorkspaceScope): Promise<Record<Role, number>> {
    const groups = await this.memberships
      .aggregate<{ _id: unknown; count: number }>([
        { $match: { workspaceId: scope.workspaceId } },
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ])
      .exec();
    const counts = Object.fromEntries(roleSchema.options.map((role) => [role, 0])) as Record<
      Role,
      number
    >;
    for (const group of groups) {
      // Holders of custom roles are counted with their roles (ADR-024).
      if (group._id === 'custom') {
        continue;
      }
      const role = roleSchema.safeParse(group._id);
      if (!role.success) {
        throw new Error(`Membership role ${String(group._id)} is not a known role`);
      }
      counts[role.data] = group.count;
    }
    return counts;
  }

  /** Members holding each custom role of the workspace, keyed by role id hex (at most 10). */
  async countByCustomRole(scope: WorkspaceScope, tx?: Tx): Promise<Map<string, number>> {
    const groups = await this.memberships
      .aggregate<{ _id: ObjectId; count: number }>(
        [
          {
            $match: {
              workspaceId: scope.workspaceId,
              role: 'custom',
              customRoleId: { $type: 'objectId' },
            },
          },
          { $group: { _id: '$customRoleId', count: { $sum: 1 } } },
        ],
        tx ? { session: tx } : {},
      )
      .exec();
    return new Map(groups.map((group) => [group._id.toHexString(), group.count]));
  }
}
