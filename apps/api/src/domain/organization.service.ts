import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  EntityIdSchema,
  normalizeOrganizationSlug,
  OrganizationListResponseSchema,
  OrganizationMembershipListResponseSchema,
  OrganizationMembershipSchema,
  OrganizationSchema,
  UpdateOrganizationMembershipRequestSchema,
  UpdateOrganizationRequestSchema,
  WorkspaceListResponseSchema,
  WorkspaceSchema,
  type CreateOrganizationMembershipRequest,
  type CreateOrganizationRequest,
  type CreateWorkspaceRequest,
  type Organization,
  type OrganizationMembership,
  type UpdateOrganizationMembershipRequest,
  type UpdateOrganizationRequest,
  type Tenant,
  type TenantPermission,
  type Workspace,
} from '@payload/contracts';

import { env } from '../config/env';
import { QuotaService } from '../billing/quota.service';
import {
  WorkspaceRecord,
  type WorkspaceDocument,
} from '../persistence/schemas/workspace.schema';
import {
  TenantMembershipRecord,
  type TenantMembershipDocument,
} from '../tenancy/schemas/tenant-membership.schema';
import { MASTER_CONNECTION } from '../tenancy/master-connection';
import { TenantRecord, type TenantDocument } from '../tenancy/schemas/tenant.schema';
import { TenantContext } from '../tenancy/tenant-context';
import { TenantProvisioningService } from '../tenancy/tenant-provisioning.service';
import { TenantResolver } from '../tenancy/tenant-resolver';
import { AuthorizationService } from '../security/authorization.service';
import { RoleService } from '../security/role.service';
import { EventBus } from '../extensions/event-bus';

/**
 * Compatibility adapter for the pre-Phase 10 `/organizations` routes.
 *
 * The route names remain temporarily stable for existing CMS clients, but the
 * implementation is now backed by Master tenants and tenant-local membership
 * and workspace collections. No Organization model or shared resource query is
 * used here.
 */
@Injectable()
export class OrganizationService {
  private readonly ownerLocks = new Map<string, Promise<void>>();

  constructor(
    @InjectModel(TenantRecord.name, MASTER_CONNECTION)
    private readonly tenantModel: Model<TenantRecord>,
    @InjectModel(TenantMembershipRecord.name)
    private readonly membershipModel: Model<TenantMembershipRecord>,
    @InjectModel(WorkspaceRecord.name)
    private readonly workspaceModel: Model<WorkspaceRecord>,
    @Inject(TenantResolver) private readonly resolver: TenantResolver,
    @Inject(TenantContext) private readonly context: TenantContext,
    @Inject(TenantProvisioningService)
    private readonly provisioning: TenantProvisioningService,
    @Inject(QuotaService) private readonly quotas: QuotaService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(RoleService) private readonly roles: RoleService,
    @Inject(EventBus) private readonly events: EventBus,
  ) {}

  async listForUser(userId: string) {
    const normalizedUserId = userId.trim().toLowerCase();
    const tenants = await this.tenantModel
      .find({ status: { $in: ['active', 'suspended'] } })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    const visible: TenantDocument[] = [];

    for (const tenant of tenants) {
      if (tenant.ownerUserId === normalizedUserId) {
        visible.push(tenant);
        continue;
      }
      try {
        const scope = this.resolver.toScope(tenant);
        await this.resolver.ensureConnection(scope);
        const member = await this.context.run(scope, () =>
          this.membershipModel.exists({ tenantId: scope.id, userId: normalizedUserId }),
        );
        if (member) visible.push(tenant);
      } catch (error) {
        if (!(error instanceof ServiceUnavailableException)) throw error;
      }
    }

    return OrganizationListResponseSchema.parse({
      items: visible.map((tenant) => this.toOrganization(tenant)),
    });
  }

  async create(userId: string, input: CreateOrganizationRequest): Promise<Organization> {
    const ownerEmail = userId.trim().toLowerCase();
    if (!ownerEmail.includes('@')) {
      throw new ConflictException({
        code: 'TENANT_OWNER_EMAIL_INVALID',
        message: 'The authenticated subject must be an email address',
      });
    }
    const slug = normalizeOrganizationSlug(input.slug ?? input.name);
    if (!slug) {
      throw new ConflictException({
        code: 'TENANT_SLUG_INVALID',
        message: 'Tenant name must produce a valid slug',
      });
    }
    const tenant = await this.provisioning.create({
      name: input.name,
      slug,
      ownerEmail,
      // The compatibility route predates per-request tenant credentials. The
      // explicit control-plane endpoint should be used for new integrations.
      ownerPassword: env.AUTH_PASSWORD,
      workspaceName: input.name,
    });
    return this.toOrganization(tenant);
  }

  async get(userId: string, tenantId: string): Promise<Organization> {
    await this.requirePermission(userId, tenantId, 'workspace.read');
    const { tenant } = await this.requireMembership(userId, tenantId);
    return this.toOrganization(tenant);
  }

  async update(
    userId: string,
    tenantId: string,
    input: UpdateOrganizationRequest,
  ): Promise<Organization> {
    const parsed = UpdateOrganizationRequestSchema.parse(input);
    const { tenant, effective } = await this.requireTenantPermission(
      userId,
      tenantId,
      'workspace.update',
    );
    if (parsed.status === undefined && !this.isOwner(effective)) {
      throw this.forbidden('Only tenant administrators can update a tenant');
    }
    if (parsed.status !== undefined && !this.isOwner(effective)) {
      throw this.forbidden('Only a tenant owner can change tenant status');
    }
    if (tenant.status === 'suspended' && parsed.status !== 'active') {
      throw this.suspended();
    }

    const set: Record<string, unknown> = {};
    if (parsed.name !== undefined) set.name = parsed.name;
    if (parsed.slug !== undefined) {
      const slug = normalizeOrganizationSlug(parsed.slug);
      if (!slug) {
        throw new ConflictException({
          code: 'TENANT_SLUG_INVALID',
          message: 'Tenant slug is invalid',
        });
      }
      set.slug = slug;
    }
    if (parsed.status !== undefined) set.status = parsed.status;

    try {
      const updated = await this.tenantModel
        .findOneAndUpdate(
          { _id: tenantId },
          { $set: set },
          { new: true, runValidators: true },
        )
        .exec();
      if (!updated) throw this.notFound();
      return this.toOrganization(updated);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictException({
          code: 'TENANT_SLUG_TAKEN',
          message: 'A tenant with this slug already exists',
        });
      }
      throw error;
    }
  }

  async listMembers(userId: string, tenantId: string) {
    await this.requirePermission(userId, tenantId, 'member.read');
    const members = await this.inTenant(tenantId, () =>
      this.membershipModel.find({ tenantId }).sort({ createdAt: 1, _id: 1 }).exec(),
    );
    return OrganizationMembershipListResponseSchema.parse({
      items: members.map((member) => this.toMembership(member)),
    });
  }

  async addMember(
    userId: string,
    tenantId: string,
    input: CreateOrganizationMembershipRequest,
  ): Promise<OrganizationMembership> {
    const { effective } = await this.requirePermission(userId, tenantId, 'member.add');
    if (input.role === 'owner' && !this.isOwner(effective)) {
      throw this.forbidden('Only a tenant owner can add another owner');
    }
    try {
      const member = await this.inTenant(tenantId, () =>
        this.membershipModel.create({
          _id: randomUUID(),
          tenantId,
          userId: input.userId.trim().toLowerCase(),
          role: input.role,
        }),
      );
      await this.roles.syncLegacyMembershipRole(member.userId, input.role);
      return this.toMembership(member);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictException({
          code: 'TENANT_MEMBER_EXISTS',
          message: 'This user is already a member',
        });
      }
      throw error;
    }
  }

  async updateMember(
    actorId: string,
    tenantId: string,
    memberId: string,
    input: UpdateOrganizationMembershipRequest,
  ): Promise<OrganizationMembership> {
    return this.withOwnerLock(tenantId, async () => {
      const { effective } = await this.requirePermission(
        actorId,
        tenantId,
        'member.update',
      );
      const parsed = UpdateOrganizationMembershipRequestSchema.parse(input);
      const member = await this.requireMembershipById(tenantId, memberId);
      if (parsed.role === 'owner' && !this.isOwner(effective)) {
        throw this.forbidden('Only a tenant owner can promote an owner');
      }
      if (member.role === 'owner' && parsed.role !== 'owner') {
        await this.assertNotLastOwner(tenantId);
      }
      member.role = parsed.role;
      await member.save();
      await this.roles.syncLegacyMembershipRole(member.userId, parsed.role);
      return this.toMembership(member);
    });
  }

  async removeMember(actorId: string, tenantId: string, memberId: string): Promise<void> {
    await this.withOwnerLock(tenantId, async () => {
      await this.requirePermission(actorId, tenantId, 'member.remove');
      const member = await this.requireMembershipById(tenantId, memberId);
      if (member.role === 'owner') await this.assertNotLastOwner(tenantId);
      await member.deleteOne();
      await this.roles.removeLegacyMembershipRoles(member.userId);
    });
  }

  async listWorkspaces(userId: string, tenantId: string) {
    await this.requireActiveMember(userId, tenantId);
    return this.inTenant(tenantId, async () => {
      const workspaces = await this.workspaceModel
        .find()
        .sort({ createdAt: 1, _id: 1 })
        .exec();
      const visible = await Promise.all(
        workspaces.map(async (workspace) =>
          (await this.authorization.can(
            userId,
            workspace._id.toString(),
            'workspace.read',
          ))
            ? workspace
            : null,
        ),
      );
      return WorkspaceListResponseSchema.parse({
        items: visible
          .filter((workspace): workspace is WorkspaceDocument => workspace !== null)
          .map((workspace) => this.toWorkspace(workspace)),
      });
    });
  }

  async createWorkspace(
    userId: string,
    tenantId: string,
    input: CreateWorkspaceRequest,
  ): Promise<Workspace> {
    await this.requirePermission(userId, tenantId, 'workspace.create');
    return this.inTenant(tenantId, async () => {
      return this.quotas.withHardQuota('workspaces', async () => {
        const workspace = await this.workspaceModel.create({
          _id: randomUUID(),
          name: input.name,
        });
        await this.events.publish('workspace.created', {
          tenantId: this.context.require().id,
          workspaceId: workspace._id.toString(),
          occurredAt: new Date().toISOString(),
        });
        return this.toWorkspace(workspace);
      });
    });
  }

  async requireActiveMember(
    userId: string,
    tenantId: string,
  ): Promise<TenantMembershipDocument> {
    const { tenant, membership } = await this.requireMembership(userId, tenantId);
    if (tenant.status !== 'active') throw this.suspended();
    return membership;
  }

  async requireWorkspaceInOrganization(
    userId: string,
    tenantId: string,
    workspaceId: string,
  ): Promise<WorkspaceDocument> {
    await this.requireActiveMember(userId, tenantId);
    const workspace = await this.inTenant(tenantId, () =>
      this.workspaceModel.findOne({ _id: workspaceId }).exec(),
    );
    if (!workspace) {
      throw new NotFoundException({
        code: 'WORKSPACE_NOT_FOUND',
        message: 'Workspace was not found',
      });
    }
    if (!(await this.authorization.can(userId, workspaceId, 'workspace.read'))) {
      throw this.forbidden('The user does not have access to this workspace');
    }
    return workspace;
  }

  private async requirePermission(
    userId: string,
    tenantId: string,
    permission: TenantPermission,
  ) {
    const membership = await this.requireActiveMember(userId, tenantId);
    const effective = await this.effectiveForTenant(userId, tenantId);
    if (!effective.permissions.includes(permission)) {
      throw this.forbidden('The current role does not allow this action');
    }
    return { membership, effective };
  }

  private async requireTenantPermission(
    userId: string,
    tenantId: string,
    permission: TenantPermission,
  ) {
    const { tenant, membership } = await this.requireMembership(userId, tenantId);
    if (tenant.status !== 'active') throw this.suspended();
    const effective = await this.effectiveForTenant(userId, tenantId);
    if (!effective.permissions.includes(permission)) {
      throw this.forbidden('The current role does not allow this action');
    }
    return { tenant, membership, effective };
  }

  private async effectiveForTenant(userId: string, tenantId: string) {
    return this.inTenant(tenantId, async () => {
      const workspace = await this.workspaceModel
        .findOne()
        .sort({ createdAt: 1, _id: 1 })
        .exec();
      if (!workspace) throw this.forbidden('The tenant has no workspace context');
      return this.authorization.getEffectivePermissions(userId, workspace._id.toString());
    });
  }

  private isOwner(
    effective: Awaited<ReturnType<AuthorizationService['getEffectivePermissions']>>,
  ): boolean {
    return effective.assignments.some((assignment) => assignment.roleKey === 'owner');
  }

  private async requireMembership(userId: string, tenantId: string) {
    if (!EntityIdSchema.safeParse(tenantId).success) throw this.notFound();
    const tenant = await this.tenantModel.findById(tenantId).exec();
    if (!tenant) throw this.notFound();
    const membership = await this.inTenant(tenantId, () =>
      this.membershipModel
        .findOne({ tenantId, userId: userId.trim().toLowerCase() })
        .exec(),
    );
    if (!membership) throw this.notFound();
    return { tenant, membership };
  }

  private async requireMembershipById(
    tenantId: string,
    memberId: string,
  ): Promise<TenantMembershipDocument> {
    const member = await this.inTenant(tenantId, () =>
      this.membershipModel.findOne({ _id: memberId, tenantId }).exec(),
    );
    if (!member) {
      throw new NotFoundException({
        code: 'TENANT_MEMBER_NOT_FOUND',
        message: 'Tenant member was not found',
      });
    }
    return member;
  }

  private async assertNotLastOwner(tenantId: string): Promise<void> {
    const owners = await this.inTenant(tenantId, () =>
      this.membershipModel.countDocuments({ tenantId, role: 'owner' }).exec(),
    );
    if (owners <= 1) {
      throw new ForbiddenException({
        code: 'LAST_OWNER_REQUIRED',
        message: 'A tenant must retain at least one owner',
      });
    }
  }

  private async withOwnerLock<T>(tenantId: string, work: () => Promise<T>): Promise<T> {
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

  private async inTenant<T>(tenantId: string, work: () => Promise<T>): Promise<T> {
    const scope = await this.resolver.resolveById(tenantId);
    await this.resolver.ensureConnection(scope);
    return this.context.run(scope, work);
  }

  private toOrganization(record: TenantDocument | Tenant | Organization): Organization {
    if ('databaseKey' in record && '_id' in record) {
      return OrganizationSchema.parse({
        id: record._id.toString(),
        name: record.name,
        slug: record.slug,
        status: record.status === 'active' ? 'active' : 'suspended',
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      });
    }
    if ('id' in record) {
      return OrganizationSchema.parse({
        id: record.id,
        name: record.name,
        slug: record.slug,
        status: record.status === 'active' ? 'active' : 'suspended',
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
    }
    return record;
  }

  private toMembership(record: TenantMembershipDocument): OrganizationMembership {
    return OrganizationMembershipSchema.parse({
      id: record._id.toString(),
      organizationId: record.tenantId,
      userId: record.userId,
      role: record.role,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private toWorkspace(record: WorkspaceDocument): Workspace {
    return WorkspaceSchema.parse({
      id: record._id.toString(),
      organizationId: this.context.require().id,
      name: record.name,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'TENANT_NOT_FOUND',
      message: 'Tenant was not found',
    });
  }

  private forbidden(message: string): ForbiddenException {
    return new ForbiddenException({ code: 'TENANT_FORBIDDEN', message });
  }

  private suspended(): ForbiddenException {
    return new ForbiddenException({
      code: 'TENANT_SUSPENDED',
      message: 'This tenant is suspended',
    });
  }
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
  );
}
