import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { FilterQuery, Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  CreateTenantUserRequestSchema,
  EntityIdSchema,
  RoleAssignmentSchema,
  TenantUserDetailResponseSchema,
  TenantUserListQuerySchema,
  TenantUserListResponseSchema,
  TenantUserSchema,
  UpdateTenantUserRequestSchema,
  type AuthPrincipal,
  type CreateTenantUserRequest,
  type RoleAssignment,
  type TenantUserDetailResponse,
  type TenantUserListQuery,
  type TenantUserListResponse,
  type UpdateTenantUserRequest,
} from '@payload/contracts';

import { hashPassword } from '../common/guards/password';
import { AuthSessionRecord } from '../persistence/schemas/auth-session.schema';
import { RoleAssignmentRecord } from '../persistence/schemas/role-assignment.schema';
import { RoleRecord } from '../persistence/schemas/role.schema';
import { WorkspaceRecord } from '../persistence/schemas/workspace.schema';
import { AuditService } from './audit.service';
import { AuthorizationService } from './authorization.service';
import { RoleService } from './role.service';
import { TenantMembershipRecord } from '../tenancy/schemas/tenant-membership.schema';
import {
  TenantUserRecord,
  type TenantUserDocument,
} from '../tenancy/schemas/tenant-user.schema';
import { TenantContext } from '../tenancy/tenant-context';
import { EventBus } from '../extensions/event-bus';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(TenantUserRecord.name)
    private readonly userModel: Model<TenantUserRecord>,
    @InjectModel(TenantMembershipRecord.name)
    private readonly membershipModel: Model<TenantMembershipRecord>,
    @InjectModel(AuthSessionRecord.name)
    private readonly sessionModel: Model<AuthSessionRecord>,
    @InjectModel(RoleAssignmentRecord.name)
    private readonly assignmentModel: Model<RoleAssignmentRecord>,
    @InjectModel(RoleRecord.name)
    private readonly roleModel: Model<RoleRecord>,
    @InjectModel(WorkspaceRecord.name)
    private readonly workspaceModel: Model<WorkspaceRecord>,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(RoleService) private readonly roles: RoleService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(TenantContext) private readonly tenantContext: TenantContext,
    @Inject(EventBus) private readonly events: EventBus,
  ) {}

  async list(
    principal: AuthPrincipal | undefined,
    input: TenantUserListQuery,
  ): Promise<TenantUserListResponse> {
    await this.roles.ensureSeeded();
    await this.authorization.assertCan(principal, 'user.read');
    const query = TenantUserListQuerySchema.parse(input);
    const filter: FilterQuery<TenantUserRecord> = {};
    if (query.status) filter.status = query.status;
    if (query.search) {
      const search = escapeRegex(query.search);
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { displayName: { $regex: search, $options: 'i' } },
      ];
    }

    const assignmentFilter: FilterQuery<RoleAssignmentRecord> = {};
    if (query.roleId) assignmentFilter.roleId = query.roleId;
    if (query.workspaceId) {
      assignmentFilter.$or = [
        { scope: 'tenant' },
        { scope: 'workspace', workspaceId: query.workspaceId },
      ];
    }
    if (query.roleId || query.workspaceId) {
      const matchingAssignments = await this.assignmentModel
        .find(assignmentFilter)
        .select({ userId: 1 })
        .exec();
      filter.email = { $in: matchingAssignments.map((item) => item.userId) };
    }

    const [records, total, workspaces] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ createdAt: 1, _id: 1 })
        .skip(query.offset)
        .limit(query.limit)
        .exec(),
      this.userModel.countDocuments(filter).exec(),
      this.workspaceModel.find().select({ _id: 1 }).exec(),
    ]);
    const emails = records.map((record) => record.email);
    const assignments = await this.assignmentModel
      .find({ userId: { $in: emails } })
      .exec();
    const roleIds = [...new Set(assignments.map((assignment) => assignment.roleId))];
    const roles = await this.roleModel.find({ _id: { $in: roleIds } }).exec();
    const roleKeys = new Map(roles.map((role) => [role._id.toString(), role.key]));
    const assignmentsByUser = groupBy(assignments, (assignment) => assignment.userId);

    return TenantUserListResponseSchema.parse({
      items: records.map((record) => {
        const userAssignments = assignmentsByUser.get(record.email) ?? [];
        const tenantAssignments = userAssignments.filter(
          (assignment) => assignment.scope === 'tenant',
        );
        const workspaceIds = new Set(
          userAssignments
            .filter(
              (assignment) => assignment.scope === 'workspace' && assignment.workspaceId,
            )
            .map((assignment) => assignment.workspaceId as string),
        );
        return {
          ...this.userContract(record),
          tenantRoleKeys: tenantAssignments
            .map((assignment) => roleKeys.get(assignment.roleId))
            .filter((key): key is string => Boolean(key)),
          workspaceAccessCount:
            tenantAssignments.length > 0 ? workspaces.length : workspaceIds.size,
        };
      }),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total,
        hasNextPage: query.offset + records.length < total,
      },
    });
  }

  async get(
    principal: AuthPrincipal | undefined,
    userId: string,
  ): Promise<TenantUserDetailResponse> {
    await this.roles.ensureSeeded();
    await this.authorization.assertCan(principal, 'user.read');
    const user = await this.requireUser(userId);
    return this.detailContract(user);
  }

  async create(
    principal: AuthPrincipal | undefined,
    input: CreateTenantUserRequest,
  ): Promise<TenantUserDetailResponse> {
    await this.roles.ensureSeeded();
    await this.authorization.assertCan(principal, 'user.create');
    const parsed = CreateTenantUserRequestSchema.parse(input);
    const email = parsed.email.trim().toLowerCase();
    const tenantId = this.tenantContext.require().id;
    const existing = await this.userModel.findOne({ email }).exec();
    if (existing) throw this.emailTaken();

    let user: TenantUserDocument | undefined;
    let membershipCreated = false;
    try {
      user = await this.userModel.create({
        _id: randomUUID(),
        email,
        ...(parsed.displayName ? { displayName: parsed.displayName } : {}),
        passwordHash: await hashPassword(parsed.password),
        status: 'active',
      });
      const membership = await this.membershipModel.create({
        _id: randomUUID(),
        tenantId,
        userId: email,
        role: 'member',
      });
      membershipCreated = Boolean(membership);

      if (parsed.roleId) {
        const scope = parsed.scope ?? (parsed.workspaceId ? 'workspace' : 'tenant');
        await this.roles.assign(principal, {
          userId: email,
          roleId: parsed.roleId,
          scope,
          ...(parsed.workspaceId ? { workspaceId: parsed.workspaceId } : {}),
        });
      }

      const result = await this.detailContract(user);
      await this.recordAudit(principal, 'user.create', user._id.toString(), {
        email,
        ...(parsed.displayName ? { changedFields: ['displayName'] } : {}),
        ...(parsed.roleId ? { initialRoleId: parsed.roleId } : {}),
      });
      await this.events.publish('user.created', {
        tenantId,
        userId: user._id.toString(),
        occurredAt: new Date().toISOString(),
      });
      return result;
    } catch (error) {
      const duplicate = isDuplicateKey(error);
      if (user) {
        await this.assignmentModel
          .deleteMany({ userId: email })
          .exec()
          .catch(() => undefined);
        if (membershipCreated) {
          await this.membershipModel
            .deleteOne({ tenantId, userId: email })
            .exec()
            .catch(() => undefined);
        }
        await this.userModel
          .deleteOne({ _id: user._id })
          .exec()
          .catch(() => undefined);
      }
      if (duplicate) throw this.emailTaken();
      throw error;
    }
  }

  async update(
    principal: AuthPrincipal | undefined,
    userId: string,
    input: UpdateTenantUserRequest,
  ): Promise<TenantUserDetailResponse> {
    await this.roles.ensureSeeded();
    await this.authorization.assertCan(principal, 'user.update');
    const parsed = UpdateTenantUserRequestSchema.parse(input);
    const user = await this.requireUser(userId);
    const changedFields: string[] = [];
    if (parsed.displayName !== undefined) {
      changedFields.push('displayName');
      if (parsed.displayName === null) user.set('displayName', undefined);
      else user.displayName = parsed.displayName;
    }
    await user.save();
    await this.recordAudit(principal, 'user.update', user._id.toString(), {
      changedFields,
    });
    return this.detailContract(user);
  }

  async setStatus(
    principal: AuthPrincipal | undefined,
    userId: string,
    status: 'active' | 'disabled',
  ): Promise<TenantUserDetailResponse> {
    await this.roles.ensureSeeded();
    await this.authorization.assertCan(principal, 'user.disable');
    const user = await this.requireUser(userId);
    this.assertNotSelf(principal, user.email);
    const previousStatus = user.status;
    await this.roles.withOwnerLock(async () => {
      if (status === 'disabled' && (await this.roles.isTenantOwner(user.email))) {
        await this.roles.assertNotLastOwner();
      }
      user.status = status;
      await user.save();
      if (status === 'disabled') await this.revokeSessions(user.email);
    });
    await this.recordAudit(
      principal,
      status === 'disabled' ? 'user.disable' : 'user.enable',
      user._id.toString(),
      {
        changedFields: previousStatus === status ? [] : ['status'],
        previousStatus,
        status,
      },
    );
    return this.detailContract(user);
  }

  async remove(principal: AuthPrincipal | undefined, userId: string): Promise<void> {
    await this.roles.ensureSeeded();
    await this.authorization.assertCan(principal, 'user.remove');
    const user = await this.requireUser(userId);
    this.assertNotSelf(principal, user.email);
    await this.roles.withOwnerLock(async () => {
      if (await this.roles.isTenantOwner(user.email))
        await this.roles.assertNotLastOwner();
      user.status = 'disabled';
      await user.save();
      await this.revokeSessions(user.email);
    });
    await this.recordAudit(principal, 'user.remove', user._id.toString(), {
      policy: 'soft-disable',
      changedFields: ['status'],
    });
  }

  async emailForId(userId: string): Promise<string> {
    return (await this.requireUser(userId)).email;
  }

  async removeRoleAssignment(
    principal: AuthPrincipal | undefined,
    userId: string,
    assignmentId: string,
  ): Promise<void> {
    const email = await this.emailForId(userId);
    const assignment = await this.assignmentModel.findById(assignmentId).exec();
    if (!assignment || assignment.userId !== email) throw this.assignmentNotFound();
    return this.roles.removeAssignment(principal, assignmentId);
  }

  private async detailContract(
    user: TenantUserDocument,
  ): Promise<TenantUserDetailResponse> {
    await this.roles.ensureSeeded();
    const assignments = await this.assignmentContracts(user.email);
    const workspaces = await this.workspaceModel
      .find()
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    const workspaceAccess = [];
    for (const workspace of workspaces) {
      const effective = await this.authorization.getEffectivePermissions(
        user.email,
        workspace._id.toString(),
      );
      if (effective.assignments.length === 0) continue;
      workspaceAccess.push({
        workspaceId: workspace._id.toString(),
        workspaceName: workspace.name,
        roleKeys: effective.assignments
          .map((assignment) => assignment.roleKey)
          .filter((key): key is string => Boolean(key)),
        permissions: effective.permissions,
      });
    }
    return TenantUserDetailResponseSchema.parse({
      user: this.userContract(user),
      tenantRoles: assignments.filter((assignment) => assignment.scope === 'tenant'),
      workspaceAccess,
    });
  }

  private async assignmentContracts(email: string): Promise<RoleAssignment[]> {
    const assignments = await this.assignmentModel
      .find({ userId: email })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    const roles = await this.roleModel
      .find({ _id: { $in: assignments.map((assignment) => assignment.roleId) } })
      .exec();
    const roleKeys = new Map(roles.map((role) => [role._id.toString(), role.key]));
    return assignments.map((assignment) =>
      RoleAssignmentSchema.parse({
        id: assignment._id.toString(),
        userId: assignment.userId,
        roleId: assignment.roleId,
        ...(roleKeys.has(assignment.roleId)
          ? { roleKey: roleKeys.get(assignment.roleId) }
          : {}),
        scope: assignment.scope,
        ...(assignment.workspaceId ? { workspaceId: assignment.workspaceId } : {}),
        createdAt: assignment.createdAt.toISOString(),
        updatedAt: assignment.updatedAt.toISOString(),
      }),
    );
  }

  private async requireUser(userId: string): Promise<TenantUserDocument> {
    if (!EntityIdSchema.safeParse(userId).success) throw this.userNotFound();
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw this.userNotFound();
    return user;
  }

  private userContract(user: TenantUserDocument) {
    return TenantUserSchema.parse({
      id: user._id.toString(),
      email: user.email,
      ...(user.displayName ? { displayName: user.displayName } : {}),
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    });
  }

  private assertNotSelf(principal: AuthPrincipal | undefined, email: string): void {
    if (principal?.subject.trim().toLowerCase() === email) {
      throw new ForbiddenException({
        code: 'SELF_USER_MUTATION_NOT_ALLOWED',
        message: 'A user cannot change their own status or remove themselves',
      });
    }
  }

  private async revokeSessions(email: string): Promise<void> {
    await this.sessionModel
      .updateMany(
        { principalId: email, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      )
      .exec();
  }

  private async recordAudit(
    principal: AuthPrincipal | undefined,
    action: string,
    resourceId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action,
        resourceType: 'tenant_user',
        resourceId,
        result: 'success',
        ...(principal?.workspaceId ? { workspaceId: principal.workspaceId } : {}),
        metadata,
      })
      .catch(() => undefined);
  }

  private userNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'TENANT_USER_NOT_FOUND',
      message: 'The tenant user was not found',
    });
  }

  private assignmentNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'ROLE_ASSIGNMENT_NOT_FOUND',
      message: 'The role assignment was not found for this user',
    });
  }

  private emailTaken(): ConflictException {
    return new ConflictException({
      code: 'TENANT_USER_EMAIL_TAKEN',
      message: 'A user with this email already exists in this tenant',
    });
  }
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const groupKey = key(item);
    const group = groups.get(groupKey) ?? [];
    group.push(item);
    groups.set(groupKey, group);
  }
  return groups;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
  );
}
