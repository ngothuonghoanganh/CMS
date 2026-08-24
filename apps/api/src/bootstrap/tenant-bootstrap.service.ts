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
    await this.ensurePlatformUser();
    const scope = this.resolver.toScope(tenant);
    await this.connections.get(scope);
    await this.context.run(scope, () => this.ensureTenantSeedData());
    await this.syncExistingDomains(scope);
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

  private async ensurePlatformUser(): Promise<void> {
    const email = env.AUTH_EMAIL.toLowerCase();
    await this.platformUserModel
      .findOneAndUpdate(
        { email },
        {
          $set: { role: 'platform-admin', status: 'active' },
          $setOnInsert: { _id: randomUUID(), email },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
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
