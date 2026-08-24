import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  CreateIntegrationRequestSchema,
  IntegrationConfigSchema,
  IntegrationListResponseSchema,
  IntegrationSchema,
  PaginationQuerySchema,
  UpdateIntegrationRequestSchema,
  WebhookIntegrationConfigInputSchema,
  type CreateIntegrationRequest,
  type Integration,
  type IntegrationListResponse,
  type PaginationQuery,
  type UpdateIntegrationRequest,
} from '@payload/contracts';

import { env } from '../config/env';
import { QuotaService } from '../billing/quota.service';
import { FormIntegrationBindingRecord } from '../persistence/schemas/form-integration-binding.schema';
import {
  IntegrationRecord,
  type IntegrationDocument,
} from '../persistence/schemas/integration.schema';
import { WorkspaceRecord } from '../persistence/schemas/workspace.schema';
import { IntegrationSecretVault } from './integration-secret-vault';
import { resolveSafeWebhookTarget } from './integrations/webhook-security';

@Injectable()
export class IntegrationService {
  constructor(
    @InjectModel(IntegrationRecord.name)
    private readonly integrationModel: Model<IntegrationRecord>,
    @InjectModel(FormIntegrationBindingRecord.name)
    private readonly bindingModel: Model<FormIntegrationBindingRecord>,
    @InjectModel(WorkspaceRecord.name)
    private readonly workspaceModel: Model<WorkspaceRecord>,
    @Inject(QuotaService) private readonly quotas: QuotaService,
  ) {}

  async create(
    workspaceId: string,
    input: CreateIntegrationRequest,
  ): Promise<Integration> {
    await this.requireWorkspace(workspaceId);
    const parsed = CreateIntegrationRequestSchema.parse(input);
    await this.validateConfig(parsed.type, parsed.config);
    return this.quotas.withHardQuota('integrations', async () => {
      const record = await this.integrationModel.create({
        _id: randomUUID(),
        workspaceId,
        type: parsed.type,
        name: parsed.name,
        enabled: parsed.enabled,
        config: parsed.config,
        ...(parsed.secret ? { secretCiphertext: this.encryptSecret(parsed.secret) } : {}),
      });
      return this.toContract(record);
    });
  }

  async list(
    workspaceId: string,
    input: PaginationQuery,
  ): Promise<IntegrationListResponse> {
    await this.requireWorkspace(workspaceId);
    const query = PaginationQuerySchema.parse(input);
    const [records, total] = await Promise.all([
      this.integrationModel
        .find({ workspaceId })
        .select('+secretCiphertext')
        .sort({ createdAt: -1, _id: -1 })
        .skip(query.offset)
        .limit(query.limit)
        .exec(),
      this.integrationModel.countDocuments({ workspaceId }).exec(),
    ]);
    return IntegrationListResponseSchema.parse({
      items: records.map((record) => this.toContract(record)),
      pagination: {
        ...query,
        total,
        hasNextPage: query.offset + records.length < total,
      },
    });
  }

  async getById(workspaceId: string, integrationId: string): Promise<Integration> {
    const record = await this.findRecord(workspaceId, integrationId, true);
    return this.toContract(record);
  }

  async update(
    workspaceId: string,
    integrationId: string,
    input: UpdateIntegrationRequest,
  ): Promise<Integration> {
    const parsed = UpdateIntegrationRequestSchema.parse(input);
    const record = await this.findRecord(workspaceId, integrationId, true);
    const nextConfig = parsed.config ?? record.config;
    await this.validateConfig(record.type, nextConfig);
    if (parsed.config && !this.matchesType(record.type, parsed.config)) {
      throw this.configError('Integration type cannot be changed through config updates');
    }
    if (record.type === 'email' && (parsed.secret !== undefined || parsed.clearSecret)) {
      throw this.configError('Email integrations do not accept a workspace secret');
    }

    if (parsed.name !== undefined) record.name = parsed.name;
    if (parsed.enabled !== undefined) record.enabled = parsed.enabled;
    if (parsed.config !== undefined) record.config = parsed.config;
    if (parsed.secret !== undefined)
      record.secretCiphertext = this.encryptSecret(parsed.secret);
    if (parsed.clearSecret) record.set('secretCiphertext', undefined);
    await record.save();
    return this.toContract(record);
  }

  async remove(workspaceId: string, integrationId: string): Promise<void> {
    await this.findRecord(workspaceId, integrationId);
    const used = await this.bindingModel.exists({
      workspaceId,
      integrationIds: integrationId,
    });
    if (used) {
      throw new ConflictException({
        code: 'INTEGRATION_IN_USE',
        message: 'Remove this integration from form notifications before deleting it',
      });
    }
    await this.integrationModel.deleteOne({ _id: integrationId, workspaceId }).exec();
  }

  private async findRecord(
    workspaceId: string,
    integrationId: string,
    includeSecret = false,
  ): Promise<IntegrationDocument> {
    const query = this.integrationModel.findOne({ _id: integrationId, workspaceId });
    if (includeSecret) query.select('+secretCiphertext');
    const record = await query.exec();
    if (!record) {
      throw new NotFoundException({
        code: 'INTEGRATION_NOT_FOUND',
        message: `Integration ${integrationId} was not found`,
      });
    }
    return record;
  }

  private async validateConfig(
    type: IntegrationRecord['type'],
    config: unknown,
  ): Promise<void> {
    if (!this.matchesType(type, config)) {
      throw this.configError('Integration type does not match its configuration');
    }
    if (type === 'webhook') {
      const parsed = WebhookIntegrationConfigInputSchema.parse(config);
      try {
        await resolveSafeWebhookTarget(parsed.url, {
          allowHttp: env.INTEGRATION_ALLOW_HTTP_WEBHOOKS,
          allowLocalNetwork: env.INTEGRATION_ALLOW_LOCAL_WEBHOOKS,
        });
      } catch {
        throw this.configError('Webhook URL was rejected by security policy');
      }
    }
  }

  private matchesType(
    type: IntegrationRecord['type'],
    config: unknown,
  ): config is CreateIntegrationRequest['config'] {
    return (
      (type === 'email' &&
        typeof config === 'object' &&
        config !== null &&
        'recipients' in config) ||
      (type === 'webhook' &&
        typeof config === 'object' &&
        config !== null &&
        'url' in config)
    );
  }

  private encryptSecret(secret: string): string {
    try {
      return new IntegrationSecretVault(env.INTEGRATION_SECRET_ENCRYPTION_KEY).encrypt(
        secret,
      );
    } catch {
      throw this.configError('Integration secret storage is not configured');
    }
  }

  private toContract(record: IntegrationDocument): Integration {
    const config = IntegrationConfigSchema.parse({
      type: record.type,
      ...record.config,
      ...(record.type === 'webhook'
        ? { secretConfigured: Boolean(record.secretCiphertext) }
        : {}),
    });
    return IntegrationSchema.parse({
      id: record._id.toString(),
      workspaceId: record.workspaceId,
      name: record.name,
      type: record.type,
      enabled: record.enabled,
      config,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private async requireWorkspace(workspaceId: string): Promise<void> {
    if (!(await this.workspaceModel.exists({ _id: workspaceId }))) {
      throw new NotFoundException({
        code: 'WORKSPACE_NOT_FOUND',
        message: `Workspace ${workspaceId} was not found`,
      });
    }
  }

  private configError(message: string): BadRequestException {
    return new BadRequestException({ code: 'INTEGRATION_CONFIG_INVALID', message });
  }
}
