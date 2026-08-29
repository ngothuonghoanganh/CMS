import { InjectModel } from '@nestjs/mongoose';
import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { Model, Schema } from 'mongoose';
import { randomUUID } from 'node:crypto';

import {
  CreateTenantRequestSchema,
  EntityIdSchema,
  TenantListResponseSchema,
  TenantSchema,
  normalizeOrganizationSlug,
  type CreateTenantRequest,
  type Tenant,
  type TenantListResponse,
} from '@payload/contracts';

import { env } from '../config/env';
import {
  AuthSessionRecord,
  AuthSessionSchema,
} from '../persistence/schemas/auth-session.schema';
import {
  WorkspaceRecord,
  WorkspaceSchema,
} from '../persistence/schemas/workspace.schema';
import { AssetRecord, AssetSchema } from '../persistence/schemas/asset.schema';
import {
  AnalyticsEventRecord,
  AnalyticsEventSchema,
} from '../persistence/schemas/analytics-event.schema';
import {
  CustomDomainRecord,
  CustomDomainSchema,
} from '../persistence/schemas/custom-domain.schema';
import {
  FormIntegrationBindingRecord,
  FormIntegrationBindingSchema,
} from '../persistence/schemas/form-integration-binding.schema';
import {
  FormSubmissionRecord,
  FormSubmissionSchema,
} from '../persistence/schemas/form-submission.schema';
import {
  IntegrationDeliveryRecord,
  IntegrationDeliverySchema,
} from '../persistence/schemas/integration-delivery.schema';
import {
  IntegrationRecord,
  IntegrationSchema,
} from '../persistence/schemas/integration.schema';
import { PageRecord, PageSchema } from '../persistence/schemas/page.schema';
import {
  PageSeoSettingsRecord,
  PageSeoSettingsSchema,
} from '../persistence/schemas/page-seo-settings.schema';
import {
  PageVersionRecord,
  PageVersionSchema,
} from '../persistence/schemas/page-version.schema';
import { SiteRecord, SiteSchema } from '../persistence/schemas/site.schema';
import { TemplateRecord, TemplateSchema } from '../persistence/schemas/template.schema';
import { TenantRecord, type TenantDocument } from './schemas/tenant.schema';
import { TenantUserRecord, TenantUserSchema } from './schemas/tenant-user.schema';
import {
  TenantMembershipRecord,
  TenantMembershipSchema,
} from './schemas/tenant-membership.schema';
import { MASTER_CONNECTION } from './master-connection';
import { TenantConnectionManager } from './tenant-connection.manager';
import { TenantContext } from './tenant-context';
import { TenantModelRegistry } from './tenant-model.registry';
import { TenantResolver } from './tenant-resolver';
import { SubscriptionService } from '../billing/subscription.service';
import { RoleRecord, RoleSchema } from '../persistence/schemas/role.schema';
import {
  RoleAssignmentRecord,
  RoleAssignmentSchema,
} from '../persistence/schemas/role-assignment.schema';
import { systemRoleDefinitions } from '../security/role-defaults';
import { hashPassword } from '../common/guards/password';
import {
  TenantExtensionRecord,
  TenantExtensionSchema,
} from '../persistence/schemas/tenant-extension.schema';
import {
  PageExtensionInstanceRecord,
  PageExtensionInstanceSchema,
} from '../persistence/schemas/page-extension-instance.schema';
import {
  NavigationRecord,
  NavigationSchemaMongoose,
} from '../persistence/schemas/navigation.schema';

const tenantMigrations = [
  [AuthSessionRecord, AuthSessionSchema],
  [WorkspaceRecord, WorkspaceSchema],
  [AssetRecord, AssetSchema],
  [AnalyticsEventRecord, AnalyticsEventSchema],
  [CustomDomainRecord, CustomDomainSchema],
  [FormIntegrationBindingRecord, FormIntegrationBindingSchema],
  [FormSubmissionRecord, FormSubmissionSchema],
  [IntegrationDeliveryRecord, IntegrationDeliverySchema],
  [IntegrationRecord, IntegrationSchema],
  [PageRecord, PageSchema],
  [PageSeoSettingsRecord, PageSeoSettingsSchema],
  [PageVersionRecord, PageVersionSchema],
  [SiteRecord, SiteSchema],
  [TemplateRecord, TemplateSchema],
  [TenantUserRecord, TenantUserSchema],
  [TenantMembershipRecord, TenantMembershipSchema],
  [RoleRecord, RoleSchema],
  [RoleAssignmentRecord, RoleAssignmentSchema],
  [TenantExtensionRecord, TenantExtensionSchema],
  [PageExtensionInstanceRecord, PageExtensionInstanceSchema],
  [NavigationRecord, NavigationSchemaMongoose],
] as const;

@Injectable()
export class TenantProvisioningService {
  private readonly provisioning = new Map<string, Promise<Tenant>>();

  constructor(
    @InjectModel(TenantRecord.name, MASTER_CONNECTION)
    private readonly tenantModel: Model<TenantRecord>,
    @Inject(TenantResolver) private readonly resolver: TenantResolver,
    @Inject(TenantConnectionManager)
    private readonly connections: TenantConnectionManager,
    @Inject(TenantContext) private readonly context: TenantContext,
    @Inject(TenantModelRegistry) private readonly models: TenantModelRegistry,
    @Inject(SubscriptionService)
    private readonly subscriptions: SubscriptionService,
  ) {}

  async list(): Promise<TenantListResponse> {
    const records = await this.tenantModel.find().sort({ createdAt: 1, _id: 1 }).exec();
    return TenantListResponseSchema.parse({
      items: records.map((record) => this.toContract(record)),
    });
  }

  async create(input: CreateTenantRequest): Promise<Tenant> {
    const parsed = CreateTenantRequestSchema.parse(input);
    const slug = normalizeOrganizationSlug(parsed.slug ?? parsed.name);
    if (!slug) {
      throw new ConflictException({
        code: 'TENANT_SLUG_INVALID',
        message: 'Tenant name must produce a valid slug',
      });
    }
    const existing = await this.tenantModel.findOne({ slug }).exec();
    if (existing) {
      if (existing.status === 'failed' || existing.status === 'provisioning') {
        return this.provision(existing, parsed);
      }
      throw new ConflictException({
        code: 'TENANT_SLUG_TAKEN',
        message: 'A tenant with this slug already exists',
      });
    }

    const tenantId = randomUUID();
    const databaseName = this.databaseName(slug, tenantId);
    let tenant: TenantDocument;
    try {
      tenant = await this.tenantModel.create({
        _id: tenantId,
        name: parsed.name,
        slug,
        status: 'provisioning',
        databaseKey: `mongo:${databaseName}`,
        databaseName,
        clusterKey: 'primary',
        schemaVersion: 0,
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        const raced = await this.tenantModel.findOne({ slug }).exec();
        if (raced && (raced.status === 'failed' || raced.status === 'provisioning')) {
          return this.provision(raced, parsed);
        }
        throw new ConflictException({
          code: 'TENANT_SLUG_TAKEN',
          message: 'A tenant with this slug already exists',
        });
      }
      throw error;
    }

    return this.provision(tenant, parsed);
  }

  async retry(tenantId: string, input: CreateTenantRequest): Promise<Tenant> {
    if (!EntityIdSchema.safeParse(tenantId).success) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'The tenant was not found',
      });
    }
    const tenant = await this.tenantModel.findById(tenantId).exec();
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'The tenant was not found',
      });
    }
    if (tenant.status === 'active') return this.toContract(tenant);
    if (tenant.status !== 'failed' && tenant.status !== 'provisioning') {
      throw new ConflictException({
        code: 'TENANT_NOT_RETRYABLE',
        message: 'Only failed or provisioning tenants can be retried',
      });
    }
    return this.provision(tenant, CreateTenantRequestSchema.parse(input));
  }

  private provision(tenant: TenantDocument, input: CreateTenantRequest): Promise<Tenant> {
    const existing = this.provisioning.get(tenant._id.toString());
    if (existing) return existing;
    const operation = this.provisionInternal(tenant, input).finally(() => {
      if (this.provisioning.get(tenant._id.toString()) === operation) {
        this.provisioning.delete(tenant._id.toString());
      }
    });
    this.provisioning.set(tenant._id.toString(), operation);
    return operation;
  }

  private async provisionInternal(
    tenant: TenantDocument,
    input: CreateTenantRequest,
  ): Promise<Tenant> {
    const tenantId = tenant._id.toString();
    await this.tenantModel
      .updateOne(
        { _id: tenantId },
        {
          $set: {
            status: 'provisioning',
            ownerUserId: input.ownerEmail.toLowerCase(),
          },
          $unset: { provisioningError: 1 },
        },
      )
      .exec();
    const current = await this.tenantModel.findById(tenantId).exec();
    if (!current) throw new Error('Tenant disappeared during provisioning');

    const scope = this.resolver.toScope(current);
    try {
      await this.connections.get(scope);
      await this.context.run(scope, async () => {
        await this.runMigrations();
        await this.seedTenant(input);
      });
      await this.subscriptions.ensureDefaultForTenant(
        tenantId,
        env.BILLING_DEFAULT_PLAN_KEY,
      );
      const updated = await this.tenantModel
        .findOneAndUpdate(
          { _id: current._id },
          {
            $set: {
              status: 'active',
              schemaVersion: 1,
              ownerUserId: input.ownerEmail.toLowerCase(),
            },
          },
          { new: true },
        )
        .exec();
      if (!updated) throw new Error('Tenant disappeared during provisioning');
      return this.toContract(updated);
    } catch (error) {
      await this.tenantModel
        .updateOne(
          { _id: current._id },
          { $set: { status: 'failed', provisioningError: safeProvisioningError(error) } },
        )
        .exec();
      throw new InternalServerErrorException({
        code: 'TENANT_PROVISIONING_FAILED',
        message: 'The tenant could not be provisioned',
      });
    }
  }

  private async runMigrations(): Promise<void> {
    for (const [record, schema] of tenantMigrations) {
      const model = this.models.proxy(record.name, schema as unknown as Schema<unknown>);
      await model.init();
    }
  }

  private async seedTenant(input: CreateTenantRequest): Promise<void> {
    const workspaceModel = this.models.proxy(WorkspaceRecord.name, WorkspaceSchema);
    const userModel = this.models.proxy(TenantUserRecord.name, TenantUserSchema);
    const hasWorkspace = await workspaceModel.exists({});
    if (!hasWorkspace) {
      await workspaceModel.create({
        _id: randomUUID(),
        name: input.workspaceName ?? input.name,
      });
    }
    const email = input.ownerEmail.toLowerCase();
    const existingUser = await userModel.findOne({ email }).exec();
    if (!existingUser) {
      await userModel.create({
        _id: randomUUID(),
        email,
        passwordHash: await hashPassword(input.ownerPassword),
        status: 'active',
      });
    }
    const membershipModel = this.models.proxy(
      TenantMembershipRecord.name,
      TenantMembershipSchema,
    );
    const roleModel = this.models.proxy(RoleRecord.name, RoleSchema);
    const assignmentModel = this.models.proxy(
      RoleAssignmentRecord.name,
      RoleAssignmentSchema,
    );
    const tenantId = this.context.require().id;
    const membership = await membershipModel.findOne({ tenantId, userId: email }).exec();
    if (!membership) {
      await membershipModel.create({
        _id: randomUUID(),
        tenantId,
        userId: email,
        role: 'owner',
      });
    }
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

  private toContract(record: TenantDocument): Tenant {
    return TenantSchema.parse({
      id: record._id.toString(),
      name: record.name,
      slug: record.slug,
      status: record.status,
      databaseKey: record.databaseKey,
      databaseName: record.databaseName,
      clusterKey: record.clusterKey,
      schemaVersion: record.schemaVersion,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private databaseName(slug: string, tenantId: string): string {
    const prefix = env.NODE_ENV === 'test' ? 'payload_test_tenant' : 'payload_tenant';
    return `${prefix}_${slug.slice(0, 40)}_${tenantId.replaceAll('-', '').slice(0, 8)}`;
  }
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
  );
}

function safeProvisioningError(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 500)
    : 'Unknown provisioning error';
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
