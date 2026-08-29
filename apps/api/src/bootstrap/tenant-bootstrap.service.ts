import { InjectModel } from '@nestjs/mongoose';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Model } from 'mongoose';
import { randomUUID, randomBytes, scrypt as nodeScrypt } from 'node:crypto';
import { promisify } from 'node:util';

import { env } from '../config/env';
import { SubscriptionService } from '../billing/subscription.service';
import { legacyDatabaseName, MASTER_CONNECTION } from '../tenancy/master-connection';
import { TenantDomainRecord } from '../tenancy/schemas/tenant-domain.schema';
import { TenantRecord, type TenantDocument } from '../tenancy/schemas/tenant.schema';
import { PlatformUserRecord } from '../tenancy/schemas/platform-user.schema';
import {
  TenantUserRecord,
  TenantUserSchema,
} from '../tenancy/schemas/tenant-user.schema';
import {
  TenantMembershipRecord,
  TenantMembershipSchema,
} from '../tenancy/schemas/tenant-membership.schema';
import { TenantConnectionManager } from '../tenancy/tenant-connection.manager';
import { TenantContext } from '../tenancy/tenant-context';
import { TenantModelRegistry } from '../tenancy/tenant-model.registry';
import { TenantResolver } from '../tenancy/tenant-resolver';
import {
  CustomDomainRecord,
  CustomDomainSchema,
} from '../persistence/schemas/custom-domain.schema';
import {
  WorkspaceRecord,
  WorkspaceSchema,
} from '../persistence/schemas/workspace.schema';
import { RoleRecord, RoleSchema } from '../persistence/schemas/role.schema';
import { SiteRecord, SiteSchema } from '../persistence/schemas/site.schema';
import {
  RoleAssignmentRecord,
  RoleAssignmentSchema,
} from '../persistence/schemas/role-assignment.schema';
import {
  PlatformRoleRecord,
  PlatformRoleSchema,
} from '../tenancy/schemas/platform-role.schema';
import {
  PlatformRoleAssignmentRecord,
  PlatformRoleAssignmentSchema,
} from '../tenancy/schemas/platform-role-assignment.schema';
import { systemRoleDefinitions } from '../security/role-defaults';

const scrypt = promisify(nodeScrypt);

/** Idempotently maps the pre-Phase 10 database to the first tenant. */
@Injectable()
export class TenantBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(TenantBootstrapService.name);

  constructor(
    @InjectModel(TenantRecord.name, MASTER_CONNECTION)
    private readonly tenantModel: Model<TenantRecord>,
    @InjectModel(TenantDomainRecord.name, MASTER_CONNECTION)
    private readonly tenantDomainModel: Model<TenantDomainRecord>,
    @InjectModel(PlatformUserRecord.name, MASTER_CONNECTION)
    private readonly platformUserModel: Model<PlatformUserRecord>,
    @Inject(TenantResolver) private readonly resolver: TenantResolver,
    @Inject(TenantConnectionManager)
    private readonly connections: TenantConnectionManager,
    @Inject(TenantContext) private readonly context: TenantContext,
    @Inject(TenantModelRegistry) private readonly models: TenantModelRegistry,
    @Inject(SubscriptionService)
    private readonly subscriptions: SubscriptionService,
  ) {}

  async onModuleInit(): Promise<void> {
    const tenant = await this.ensureInitialTenant();
    const platformUser = await this.ensurePlatformUser();
    await this.ensurePlatformRoleAssignment(platformUser._id.toString());
    const scope = this.resolver.toScope(tenant);
    await this.connections.get(scope);
    await this.context.run(scope, () => this.ensureTenantSeedData());
    await this.syncExistingDomains(scope);
    await this.syncExistingSiteRoutes(scope);
    await this.syncRoutesForOtherActiveTenants(scope.id);
    await this.subscriptions.ensureDefaultForTenant(
      scope.id,
      env.BILLING_EXISTING_TENANT_PLAN_KEY,
    );
    if (tenant.status !== 'active') {
      await this.tenantModel
        .updateOne(
          { _id: tenant._id },
          { $set: { status: 'active', provisioningError: undefined } },
        )
        .exec();
    }
    this.logger.log(`Tenant ${scope.slug} is active on database ${scope.databaseName}`);
  }

  private async ensureInitialTenant(): Promise<TenantDocument> {
    const databaseName = legacyDatabaseName();
    const existing = await this.tenantModel
      .findOne({ slug: env.AUTH_TENANT_SLUG })
      .exec();
    if (existing) {
      if (
        existing.databaseName !== databaseName &&
        existing.legacyDatabaseName === databaseName
      ) {
        existing.databaseName = databaseName;
        existing.databaseKey = `mongo:${databaseName}`;
        await existing.save();
      }
      return existing;
    }

    try {
      return await this.tenantModel.create({
        _id: randomUUID(),
        name: env.AUTH_WORKSPACE_NAME,
        slug: env.AUTH_TENANT_SLUG,
        status: 'provisioning',
        databaseKey: `mongo:${databaseName}`,
        databaseName,
        clusterKey: 'primary',
        schemaVersion: 1,
        legacyDatabaseName: databaseName,
        ownerUserId: env.AUTH_EMAIL.toLowerCase(),
      });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const raced = await this.tenantModel.findOne({ slug: env.AUTH_TENANT_SLUG }).exec();
      if (!raced) throw error;
      return raced;
    }
  }

  private async ensureTenantSeedData(): Promise<void> {
    const workspaceModel = this.models.proxy(WorkspaceRecord.name, WorkspaceSchema);
    const userModel = this.models.proxy(TenantUserRecord.name, TenantUserSchema);
    const membershipModel = this.models.proxy(
      TenantMembershipRecord.name,
      TenantMembershipSchema,
    );
    await workspaceModel.updateMany({}, { $unset: { organizationId: 1 } }).exec();
    const workspace = await workspaceModel
      .findOne()
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    if (!workspace) {
      await workspaceModel.create({ _id: randomUUID(), name: env.AUTH_WORKSPACE_NAME });
      this.logger.log('Created the initial tenant workspace');
    }

    const email = env.AUTH_EMAIL.toLowerCase();
    const existingUser = await userModel
      .findOne({ email })
      .select('+passwordHash')
      .exec();
    if (!existingUser) {
      await userModel.create({
        _id: randomUUID(),
        email,
        passwordHash: await hashPassword(env.AUTH_PASSWORD),
        status: 'active',
      });
    }
    const tenantId = this.context.require().id;
    if (!(await membershipModel.exists({ tenantId, userId: email }))) {
      await membershipModel.create({
        _id: randomUUID(),
        tenantId,
        userId: email,
        role: 'owner',
      });
    }
    const roleModel = this.models.proxy(RoleRecord.name, RoleSchema);
    const assignmentModel = this.models.proxy(
      RoleAssignmentRecord.name,
      RoleAssignmentSchema,
    );
    await seedTenantRoles(roleModel);
    const ownerRole = await roleModel.findOne({ key: 'owner' }).exec();
    if (
      ownerRole &&
      !(await assignmentModel.exists({
        userId: email,
        roleId: ownerRole._id,
        scope: 'tenant',
      }))
    ) {
      await assignmentModel.create({
        _id: randomUUID(),
        userId: email,
        roleId: ownerRole._id,
        scope: 'tenant',
      });
    }
  }

  private async syncExistingDomains(
    scope: ReturnType<TenantResolver['toScope']>,
  ): Promise<void> {
    await this.context.run(scope, async () => {
      const domainModel = this.models.proxy(CustomDomainRecord.name, CustomDomainSchema);
      const domains = await domainModel.find({ status: 'active' }).exec();
      for (const domain of domains) {
        const record = domain as unknown as { _id: string; hostname: string };
        await this.tenantDomainModel
          .findOneAndUpdate(
            { hostname: record.hostname, kind: 'public' },
            {
              $set: {
                tenantId: scope.id,
                status: 'active',
                sourceDomainId: record._id.toString(),
              },
              $setOnInsert: {
                _id: randomUUID(),
                hostname: record.hostname,
                kind: 'public',
              },
            },
            { upsert: true, new: true },
          )
          .exec();
      }
    });
  }

  /** Idempotent control-plane backfill for sites created before public routing. */
  private async syncExistingSiteRoutes(
    scope: ReturnType<TenantResolver['toScope']>,
  ): Promise<void> {
    await this.context.run(scope, async () => {
      const siteModel = this.models.proxy(SiteRecord.name, SiteSchema);
      const sites = await siteModel.find().exec();
      for (const site of sites) {
        try {
          await this.resolver.registerPublicSiteRoute({
            siteSlug: site.slug,
            tenantId: scope.id,
            tenantSlug: scope.slug,
            databaseKey: scope.databaseKey,
            workspaceId: site.workspaceId,
            siteId: site._id.toString(),
          });
        } catch (error) {
          this.logger.warn(
            `Could not backfill public route for site ${site._id.toString()}: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          );
        }
      }
    });
  }

  private async syncRoutesForOtherActiveTenants(currentTenantId: string): Promise<void> {
    const tenants = await this.tenantModel
      .find({ status: 'active', _id: { $ne: currentTenantId } })
      .exec();
    for (const tenant of tenants) {
      const scope = this.resolver.toScope(tenant);
      try {
        await this.connections.get(scope);
        await this.syncExistingSiteRoutes(scope);
      } catch (error) {
        this.logger.warn(
          `Could not backfill public routes for tenant ${scope.slug}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
  }

  private async ensurePlatformUser(): Promise<PlatformUserRecord> {
    const email = env.AUTH_EMAIL.toLowerCase();
    const user = await this.platformUserModel
      .findOneAndUpdate(
        { email },
        {
          $set: { role: 'platform-admin', status: 'active' },
          $setOnInsert: { _id: randomUUID(), email },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
    if (!user) throw new Error('PLATFORM_USER_BOOTSTRAP_FAILED');
    return user;
  }

  private async ensurePlatformRoleAssignment(platformUserId: string): Promise<void> {
    const roleModel = this.platformUserModel.db.model<PlatformRoleRecord>(
      PlatformRoleRecord.name,
      PlatformRoleSchema,
    );
    const assignmentModel = this.platformUserModel.db.model<PlatformRoleAssignmentRecord>(
      PlatformRoleAssignmentRecord.name,
      PlatformRoleAssignmentSchema,
    );
    const role = await roleModel
      .findOneAndUpdate(
        { key: 'platform-admin' },
        {
          $setOnInsert: {
            _id: randomUUID(),
            key: 'platform-admin',
            name: 'Platform administrator',
            permissions: Object.values({
              TenantRead: 'platform.tenant.read',
              TenantCreate: 'platform.tenant.create',
              TenantUpdate: 'platform.tenant.update',
              PlanRead: 'platform.plan.read',
              PlanCreate: 'platform.plan.create',
              PlanUpdate: 'platform.plan.update',
              SubscriptionRead: 'platform.subscription.read',
              SubscriptionUpdate: 'platform.subscription.update',
              AuditRead: 'platform.audit.read',
            }),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
    if (!role) throw new Error('PLATFORM_ROLE_BOOTSTRAP_FAILED');
    await assignmentModel
      .updateOne(
        { platformUserId, roleId: role._id },
        { $setOnInsert: { _id: randomUUID(), platformUserId, roleId: role._id } },
        { upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
  }
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
  );
}

async function seedTenantRoles(roleModel: Model<RoleRecord>): Promise<void> {
  for (const role of systemRoleDefinitions) {
    await roleModel
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
}
