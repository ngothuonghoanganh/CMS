import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  AssignRoleRequestSchema,
  CreateRoleRequestSchema,
  RoleAssignmentListResponseSchema,
  RoleListResponseSchema,
  RoleSchema,
  UpdateRoleRequestSchema,
  type AssignRoleRequest,
  type AuthPrincipal,
  type CreateRoleRequest,
  type Role,
  type RoleAssignment,
  type UpdateRoleRequest,
  type TenantPermission,
} from '@payload/contracts';

import { AuditService } from './audit.service';
import { AuthorizationService } from './authorization.service';
import { systemRoleDefinitions } from './role-defaults';
import { RoleRecord, type RoleDocument } from '../persistence/schemas/role.schema';
import {
  RoleAssignmentRecord,
  type RoleAssignmentDocument,
} from '../persistence/schemas/role-assignment.schema';
import { TenantMembershipRecord } from '../tenancy/schemas/tenant-membership.schema';
import { WorkspaceRecord } from '../persistence/schemas/workspace.schema';
import { TenantContext } from '../tenancy/tenant-context';

@Injectable()
export class RoleService {
  private readonly ownerLocks = new Map<string, Promise<void>>();

  constructor(
    @InjectModel(RoleRecord.name) private readonly roleModel: Model<RoleRecord>,
    @InjectModel(RoleAssignmentRecord.name)
    private readonly assignmentModel: Model<RoleAssignmentRecord>,
    @InjectModel(TenantMembershipRecord.name)
    private readonly membershipModel: Model<TenantMembershipRecord>,
    @InjectModel(WorkspaceRecord.name)
    private readonly workspaceModel: Model<WorkspaceRecord>,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(TenantContext) private readonly tenantContext: TenantContext,
  ) {}

  async ensureSeeded(): Promise<void> {
    for (const role of systemRoleDefinitions) {
      await this.roleModel
        .updateOne(
          { key: role.key },
          {
            $set: { ...role, type: 'system' },
            $setOnInsert: { _id: randomUUID() },
          },
          { upsert: true, setDefaultsOnInsert: true },
        )
        .exec();
    }
    // One-time compatibility migration for tenant-defined full editors. The
    // system Editor persona is intentionally content-only; custom roles that
    // already granted page.update retain their previous structural capability.
    await this.roleModel
      .updateMany(
        {
          type: 'custom',
          permissions: 'page.update',
          $and: [{ permissions: { $ne: 'page.design' } }],
        },
        { $addToSet: { permissions: 'page.design' } },
      )
      .exec();
  }

  async list(principal?: AuthPrincipal): Promise<{ items: Role[] }> {
    await this.requirePermission(principal, 'role.read');
    await this.ensureSeeded();
    const records = await this.roleModel.find().sort({ type: 1, key: 1, _id: 1 }).exec();
    const items = await Promise.all(
      records.map(async (record) => this.toContract(record)),
    );
    return RoleListResponseSchema.parse({ items });
  }

  async get(roleId: string, principal?: AuthPrincipal): Promise<Role> {
    await this.requirePermission(principal, 'role.read');
    await this.ensureSeeded();
    const record = await this.roleModel.findById(roleId).exec();
    if (!record) throw this.notFound();
    return this.toContract(record);
  }

  async create(
    principal: AuthPrincipal | undefined,
    input: CreateRoleRequest,
  ): Promise<Role> {
    await this.requirePermission(principal, 'role.create');
    const parsed = CreateRoleRequestSchema.parse(input);
    await this.ensureSeeded();
    await this.assertPermissionsManageable(principal, parsed.permissions);
    try {
      const record = await this.roleModel.create({
        _id: randomUUID(),
        ...parsed,
        type: 'custom',
      });
      const result = await this.toContract(record);
      await this.auditMutation(principal, 'role.create', 'role', result.id, {
        key: result.key,
        permissions: result.permissions,
      });
      return result;
    } catch (error) {
      if (isDuplicateKey(error))
        throw new ConflictException({
          code: 'ROLE_KEY_TAKEN',
          message: 'A role with this key already exists',
        });
      throw error;
    }
  }

  async update(
    principal: AuthPrincipal | undefined,
    roleId: string,
    input: UpdateRoleRequest,
  ): Promise<Role> {
    await this.requirePermission(principal, 'role.update');
    const parsed = UpdateRoleRequestSchema.parse(input);
    const role = await this.requireRole(roleId);
    if (role.type === 'system') throw this.systemRoleError();
    if (parsed.permissions)
      await this.assertPermissionsManageable(principal, parsed.permissions);
    if (parsed.name !== undefined) role.name = parsed.name;
    if (parsed.description !== undefined) {
      if (parsed.description === null) role.set('description', undefined);
      else role.description = parsed.description;
    }
    if (parsed.permissions !== undefined) role.permissions = parsed.permissions;
    await role.save();
    const result = await this.toContract(role);
    await this.auditMutation(principal, 'role.update', 'role', roleId, {
      changedFields: Object.keys(parsed),
      ...(parsed.permissions ? { permissions: parsed.permissions } : {}),
    });
    return result;
  }

  async remove(principal: AuthPrincipal | undefined, roleId: string): Promise<void> {
    await this.requirePermission(principal, 'role.delete');
    const role = await this.requireRole(roleId);
    if (role.type === 'system') throw this.systemRoleError();
    if (await this.assignmentModel.exists({ roleId })) {
      throw new ConflictException({
        code: 'ROLE_IN_USE',
        message: 'A role with assignments cannot be deleted',
      });
    }
    await role.deleteOne();
    await this.auditMutation(principal, 'role.delete', 'role', roleId, { key: role.key });
  }

  async listAssignments(
    userId: string | undefined,
    principal?: AuthPrincipal,
    permission: TenantPermission = 'member.read',
  ): Promise<{ items: RoleAssignment[] }> {
    await this.requirePermission(principal, permission);
    await this.ensureSeeded();
    const filter = userId ? { userId: userId.trim().toLowerCase() } : {};
    const assignments = await this.assignmentModel
      .find(filter)
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    const roles = await this.roleModel
      .find({ _id: { $in: assignments.map((item) => item.roleId) } })
      .exec();
    const roleKeys = new Map(roles.map((role) => [role._id.toString(), role.key]));
    return RoleAssignmentListResponseSchema.parse({
      items: assignments.map((assignment) =>
        this.assignmentContract(assignment, roleKeys.get(assignment.roleId)),
      ),
    });
  }

  async assign(
    principal: AuthPrincipal | undefined,
    input: AssignRoleRequest,
  ): Promise<RoleAssignment> {
    await this.requirePermission(
      principal,
      'role.assign',
      input.workspaceId ?? principal?.workspaceId,
    );
    const parsed = AssignRoleRequestSchema.parse({
      ...input,
      userId: input.userId.trim().toLowerCase(),
    });
    await this.ensureSeeded();
    const role = await this.requireRole(parsed.roleId);
    if (!(await this.membershipModel.exists({ userId: parsed.userId }))) {
      throw new NotFoundException({
        code: 'TENANT_MEMBER_NOT_FOUND',
        message: 'The target user is not a tenant member',
      });
    }
    if (role.key === 'owner' && !(await this.isOwner(principal))) {
      throw new ForbiddenException({
        code: 'OWNER_ROLE_REQUIRED',
        message: 'Only an owner can assign the owner role',
      });
    }
    if (role.key === 'owner' && parsed.scope !== 'tenant') {
      throw new ForbiddenException({
        code: 'OWNER_ROLE_TENANT_SCOPE',
        message: 'The owner role must be assigned at tenant scope',
      });
    }
    await this.assertPermissionsManageable(principal, role.permissions);
    if (
      parsed.scope === 'workspace' &&
      !(await this.workspaceModel.exists({ _id: parsed.workspaceId }))
    ) {
      throw new NotFoundException({
        code: 'WORKSPACE_NOT_FOUND',
        message: 'The workspace was not found',
      });
    }
    try {
      const assignment = await this.assignmentModel.create({
        _id: randomUUID(),
        ...parsed,
      });
      const result = this.assignmentContract(assignment, role.key);
      await this.auditMutation(principal, 'role.assign', 'role_assignment', result.id, {
        userId: result.userId,
        roleKey: role.key,
        scope: result.scope,
        workspaceId: result.workspaceId,
      });
      return result;
    } catch (error) {
      if (isDuplicateKey(error))
        throw new ConflictException({
          code: 'ROLE_ASSIGNMENT_EXISTS',
          message: 'This role is already assigned',
        });
      throw error;
    }
  }

  async removeAssignment(
    principal: AuthPrincipal | undefined,
    assignmentId: string,
  ): Promise<void> {
    await this.requirePermission(principal, 'role.assign');
    await this.withOwnerLock(async () => {
      const assignment = await this.assignmentModel.findById(assignmentId).exec();
      if (!assignment)
        throw new NotFoundException({
          code: 'ROLE_ASSIGNMENT_NOT_FOUND',
          message: 'The role assignment was not found',
        });
      const role = await this.roleModel.findById(assignment.roleId).exec();
      if (role?.key === 'owner') await this.assertNotLastOwner();
      await assignment.deleteOne();
      await this.auditMutation(
        principal,
        'role.unassign',
        'role_assignment',
        assignmentId,
        { result: 'removed', userId: assignment.userId },
      );
    });
  }

  async currentPermissions(principal: AuthPrincipal | undefined, workspaceId?: string) {
    await this.ensureSeeded();
    const selectedWorkspace = workspaceId ?? principal?.workspaceId;
    if (!selectedWorkspace)
      throw new ForbiddenException({
        code: 'WORKSPACE_CONTEXT_REQUIRED',
        message: 'An active workspace context is required',
      });
    if (!(await this.workspaceModel.exists({ _id: selectedWorkspace }))) {
      throw new NotFoundException({
        code: 'WORKSPACE_NOT_FOUND',
        message: 'The workspace was not found',
      });
    }
    return this.authorization.getEffectivePermissions(
      principal?.subject ?? '',
      selectedWorkspace,
    );
  }

  async syncLegacyMembershipRole(
    userId: string,
    roleKey: 'owner' | 'admin' | 'member',
  ): Promise<void> {
    await this.ensureSeeded();
    const targetKey = roleKey === 'member' ? 'editor' : roleKey;
    const role = await this.roleModel.findOne({ key: targetKey }).exec();
    if (!role)
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: 'The role was not found',
      });
    const normalizedUserId = userId.trim().toLowerCase();
    await this.assignmentModel
      .deleteMany({ userId: normalizedUserId, scope: 'tenant' })
      .exec();
    await this.assignmentModel.create({
      _id: randomUUID(),
      userId: normalizedUserId,
      roleId: role._id,
      scope: 'tenant',
    });
  }

  async removeLegacyMembershipRoles(userId: string): Promise<void> {
    await this.assignmentModel
      .deleteMany({ userId: userId.trim().toLowerCase(), scope: 'tenant' })
      .exec();
  }

  private async requirePermission(
    principal: AuthPrincipal | undefined,
    permission: Parameters<AuthorizationService['assertCan']>[1],
    workspaceId = principal?.workspaceId,
  ): Promise<void> {
    await this.authorization.assertCan(principal, permission, workspaceId);
  }

  private async requireRole(roleId: string): Promise<RoleDocument> {
    const role = await this.roleModel.findById(roleId).exec();
    if (!role) throw this.notFound();
    return role;
  }

  private async assertPermissionsManageable(
    principal: AuthPrincipal | undefined,
    permissions: readonly string[],
  ): Promise<void> {
    const workspaceId = principal?.workspaceId;
    if (!principal?.subject || !workspaceId) throw this.systemRoleError();
    const effective = await this.authorization.getEffectivePermissions(
      principal.subject,
      workspaceId,
    );
    if (
      permissions.some(
        (permission) => !effective.permissions.includes(permission as never),
      )
    ) {
      throw new ForbiddenException({
        code: 'ROLE_PERMISSION_ESCALATION',
        message: 'A role cannot grant permissions the actor does not have',
      });
    }
  }

  private async isOwner(principal: AuthPrincipal | undefined): Promise<boolean> {
    if (!principal?.subject || !principal.workspaceId) return false;
    const effective = await this.authorization.getEffectivePermissions(
      principal.subject,
      principal.workspaceId,
    );
    return effective.assignments.some((assignment) => assignment.roleKey === 'owner');
  }

  async assertNotLastOwner(): Promise<void> {
    if ((await this.ownerUserIds()).size <= 1) {
      throw new ForbiddenException({
        code: 'LAST_OWNER_REQUIRED',
        message: 'A tenant must retain at least one owner',
      });
    }
  }

  async isTenantOwner(userId: string): Promise<boolean> {
    return (await this.ownerUserIds()).has(userId.trim().toLowerCase());
  }

  async withOwnerLock<T>(work: () => Promise<T>): Promise<T> {
    return this.withOwnerLockInternal(work);
  }

  private async ownerUserIds(): Promise<Set<string>> {
    const ownerRole = await this.roleModel.findOne({ key: 'owner' }).exec();
    const ownerAssignments = ownerRole
      ? await this.assignmentModel
          .find({ roleId: ownerRole._id, scope: 'tenant' })
          .select({ userId: 1 })
          .exec()
      : [];
    const ownerMemberships = await this.membershipModel
      .find({ role: 'owner' })
      .select({ userId: 1 })
      .exec();
    return new Set(
      [...ownerAssignments, ...ownerMemberships].map((record) =>
        record.userId.trim().toLowerCase(),
      ),
    );
  }

  private async withOwnerLockInternal<T>(work: () => Promise<T>): Promise<T> {
    const tenantId = this.tenantContext.require().id;
    const previous = this.ownerLocks.get(tenantId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = previous.then(() => current);
    this.ownerLocks.set(tenantId, chain);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (this.ownerLocks.get(tenantId) === chain) this.ownerLocks.delete(tenantId);
    }
  }

  private async toContract(record: RoleDocument): Promise<Role> {
    const userCount = await this.assignmentModel
      .countDocuments({ roleId: record._id })
      .exec();
    return RoleSchema.parse({
      id: record._id.toString(),
      key: record.key,
      name: record.name,
      ...(record.description ? { description: record.description } : {}),
      type: record.type,
      permissions: record.permissions,
      userCount,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private assignmentContract(
    record: RoleAssignmentDocument,
    roleKey?: string,
  ): RoleAssignment {
    return {
      id: record._id.toString(),
      userId: record.userId,
      roleId: record.roleId,
      ...(roleKey ? { roleKey } : {}),
      scope: record.scope,
      ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private async auditMutation(
    principal: AuthPrincipal | undefined,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action,
        resourceType,
        resourceId,
        result: 'success',
        ...(principal?.workspaceId ? { workspaceId: principal.workspaceId } : {}),
        metadata,
      })
      .catch(() => undefined);
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'ROLE_NOT_FOUND',
      message: 'The requested role was not found',
    });
  }
  private systemRoleError(): ForbiddenException {
    return new ForbiddenException({
      code: 'SYSTEM_ROLE_PROTECTED',
      message: 'System roles are protected',
    });
  }
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
  );
}
