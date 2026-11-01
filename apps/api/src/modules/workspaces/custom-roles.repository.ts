import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CUSTOM_ROLES_MAX } from '@plp/contracts';
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  CUSTOM_ROLE_MODEL,
  CUSTOM_ROLE_NAME_INDEX,
  type CustomRoleRecord,
} from './custom-role.schema.js';
import type { WorkspaceScope } from './workspace-scope.js';

export type CustomRoleChange = Pick<
  CustomRoleRecord,
  'name' | 'nameKey' | 'basedOn' | 'permissions' | 'wholeWorkspace' | 'updatedAt'
>;

/** Custom roles of a workspace (ADR-024); at most `CUSTOM_ROLES_MAX` each. */
@Injectable()
export class CustomRolesRepository {
  constructor(@InjectModel(CUSTOM_ROLE_MODEL) private readonly roles: Model<CustomRoleRecord>) {}

  list(scope: WorkspaceScope): Promise<CustomRoleRecord[]> {
    return this.roles
      .find({ workspaceId: scope.workspaceId })
      .sort({ createdAt: 1, _id: 1 })
      .limit(CUSTOM_ROLES_MAX)
      .lean<CustomRoleRecord[]>()
      .exec();
  }

  /** The role of a membership being turned into a scope: the scope does not exist yet. */
  findOfMembership(workspaceId: ObjectId, id: ObjectId): Promise<CustomRoleRecord | null> {
    return this.roles.findOne({ _id: id, workspaceId }).lean<CustomRoleRecord>().exec();
  }

  findById(scope: WorkspaceScope, id: ObjectId, tx?: Tx): Promise<CustomRoleRecord | null> {
    return this.roles
      .findOne({ _id: id, workspaceId: scope.workspaceId })
      .session(tx ?? null)
      .lean<CustomRoleRecord>()
      .exec();
  }

  /**
   * Roles by id, keyed by id hex, whatever their workspace: for the memberships of one user,
   * whose ids come from their own memberships, never from a request.
   */
  async findByIds(ids: readonly ObjectId[]): Promise<Map<string, CustomRoleRecord>> {
    if (ids.length === 0) {
      return new Map();
    }
    const roles = await this.roles
      .find({ _id: { $in: [...ids] } })
      .lean<CustomRoleRecord[]>()
      .exec();
    return new Map(roles.map((role) => [role._id.toHexString(), role]));
  }

  /**
   * The role being given, written in the grant's transaction (`grantSeq`): deleting it or making
   * it "Toàn workspace" at the same moment conflicts with the grant. Null when it is gone.
   */
  hold(workspaceId: ObjectId, id: ObjectId, tx: Tx): Promise<CustomRoleRecord | null> {
    return this.roles
      .findOneAndUpdate(
        { _id: id, workspaceId },
        { $inc: { grantSeq: 1 } },
        { new: true, session: tx },
      )
      .lean<CustomRoleRecord>()
      .exec();
  }

  /** The workspace's roles keyed by id hex, for the access of its members (at most 10). */
  async mapForWorkspace(scope: WorkspaceScope): Promise<Map<string, CustomRoleRecord>> {
    return new Map((await this.list(scope)).map((role) => [role._id.toHexString(), role]));
  }

  countForWorkspace(scope: WorkspaceScope, tx: Tx): Promise<number> {
    return this.roles.countDocuments({ workspaceId: scope.workspaceId }, { session: tx }).exec();
  }

  /** Stores a new role in the caller's transaction; false when the workspace has the name. */
  async insert(scope: WorkspaceScope, role: CustomRoleRecord, tx: Tx): Promise<boolean> {
    if (!role.workspaceId.equals(scope.workspaceId)) {
      throw new Error('A custom role must belong to the workspace of its scope');
    }
    try {
      await this.roles.create([role], { session: tx });
      return true;
    } catch (error) {
      if (isDuplicateKeyError(error, CUSTOM_ROLE_NAME_INDEX)) {
        return false;
      }
      throw error;
    }
  }

  /** The role after the change; null when there is no such role, 'name_taken' for a duplicate. */
  async update(
    scope: WorkspaceScope,
    id: ObjectId,
    change: CustomRoleChange,
    tx: Tx,
  ): Promise<CustomRoleRecord | null | 'name_taken'> {
    try {
      return await this.roles
        .findOneAndUpdate(
          { _id: id, workspaceId: scope.workspaceId },
          { $set: change },
          { new: true, session: tx },
        )
        .lean<CustomRoleRecord>()
        .exec();
    } catch (error) {
      if (isDuplicateKeyError(error, CUSTOM_ROLE_NAME_INDEX)) {
        return 'name_taken';
      }
      throw error;
    }
  }

  async remove(scope: WorkspaceScope, id: ObjectId, tx: Tx): Promise<boolean> {
    const result = await this.roles
      .deleteOne({ _id: id, workspaceId: scope.workspaceId }, { session: tx })
      .exec();
    return result.deletedCount === 1;
  }
}
