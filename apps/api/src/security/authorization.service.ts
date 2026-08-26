import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  EffectivePermissionsResponseSchema,
  TenantPermissionSchema,
  TenantPermissions,
  type AuthPrincipal,
  type EffectivePermissionsResponse,
  type TenantPermission,
} from '@payload/contracts';

import { RoleRecord } from '../persistence/schemas/role.schema';
import {
  RoleAssignmentRecord,
  type RoleAssignmentDocument,
} from '../persistence/schemas/role-assignment.schema';
import { TenantMembershipRecord } from '../tenancy/schemas/tenant-membership.schema';
import { TenantContext } from '../tenancy/tenant-context';

const legacyRoleKeys = {
  owner: 'owner',
  admin: 'admin',
  member: 'editor',
} as const;

@Injectable()
export class AuthorizationService {
  constructor(
    @InjectModel(RoleRecord.name)
    private readonly roleModel: Model<RoleRecord>,
    @InjectModel(RoleAssignmentRecord.name)
    private readonly assignmentModel: Model<RoleAssignmentRecord>,
    @InjectModel(TenantMembershipRecord.name)
    private readonly membershipModel: Model<TenantMembershipRecord>,
    @Inject(TenantContext) private readonly tenantContext: TenantContext,
  ) {}

  async getEffectivePermissions(
    userId: string,
    workspaceId: string,
  ): Promise<EffectivePermissionsResponse> {
    const scope = this.tenantContext.require();
    const normalizedUserId = userId.trim().toLowerCase();
    const assignments = await this.assignmentModel
      .find({ userId: normalizedUserId })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    const roleIds = new Set<string>();
    const applicable = assignments.filter((assignment) => {
      const applies =
        assignment.scope === 'tenant' || assignment.workspaceId === workspaceId;
      if (applies) roleIds.add(assignment.roleId);
      return applies;
    });

    // Phase 10 tenants can be encountered before the idempotent RBAC seed has run.
    // Resolve their legacy membership as a compatibility fallback, never as a
    // second permission policy.
    if (roleIds.size === 0) {
      const membership = await this.membershipModel
        .findOne({ tenantId: scope.id, userId: normalizedUserId })
        .exec();
      if (membership) {
        const role = await this.roleModel
          .findOne({ key: legacyRoleKeys[membership.role] })
          .exec();
        if (role) {
          roleIds.add(role._id.toString());
          applicable.push({
            _id: randomUUID(),
            userId: normalizedUserId,
            roleId: role._id.toString(),
            scope: 'tenant',
            createdAt: membership.createdAt,
            updatedAt: membership.updatedAt,
          } as unknown as RoleAssignmentDocument);
        }
      }
    }

    const roles = await this.roleModel.find({ _id: { $in: [...roleIds] } }).exec();
    const roleById = new Map(roles.map((role) => [role._id.toString(), role]));
    const permissions = new Set<TenantPermission>();
    for (const role of roles) {
      for (const permission of role.permissions) {
        const parsed = TenantPermissionSchema.safeParse(permission);
        if (parsed.success) permissions.add(parsed.data);
      }
    }

    return EffectivePermissionsResponseSchema.parse({
      userId: normalizedUserId,
      tenantId: scope.id,
      workspaceId,
      permissions: [...permissions].sort(),
      assignments: applicable.map((assignment) => ({
        id: assignment._id.toString(),
        userId: assignment.userId,
        roleId: assignment.roleId,
        roleKey: roleById.get(assignment.roleId)?.key,
        scope: assignment.scope,
        ...(assignment.workspaceId ? { workspaceId: assignment.workspaceId } : {}),
        createdAt: assignment.createdAt.toISOString(),
        updatedAt: assignment.updatedAt.toISOString(),
      })),
    });
  }

  async can(
    userId: string,
    workspaceId: string,
    permission: TenantPermission,
  ): Promise<boolean> {
    const effective = await this.getEffectivePermissions(userId, workspaceId);
    return effective.permissions.includes(permission);
  }

  async assertCan(
    principal: AuthPrincipal | undefined,
    permission: TenantPermission,
    workspaceId = principal?.workspaceId,
  ): Promise<void> {
    if (!principal?.subject || !workspaceId) {
      throw this.forbidden();
    }
    if (!(await this.can(principal.subject, workspaceId, permission))) {
      throw this.forbidden();
    }
  }

  async assertCanAny(
    principal: AuthPrincipal | undefined,
    permissions: readonly TenantPermission[],
    workspaceId = principal?.workspaceId,
  ): Promise<void> {
    if (!principal?.subject || !workspaceId) throw this.forbidden();
    const effective = await this.getEffectivePermissions(principal.subject, workspaceId);
    if (!permissions.some((permission) => effective.permissions.includes(permission))) {
      throw this.forbidden();
    }
  }

  private forbidden(): ForbiddenException {
    return new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'You do not have permission to perform this action.',
    });
  }
}

export const Permission = TenantPermissions;
