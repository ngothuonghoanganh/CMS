import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  CreateCustomExtensionRequestSchema,
  CustomExtensionDefinitionSchema,
  ExtensionConfigurationSchema,
  ExtensionDescriptorSchema,
  ExtensionListResponseSchema,
  UpdateCustomExtensionRequestSchema,
  type ExtensionConfiguration,
  type ExtensionDescriptor,
  type ExtensionManifest,
  type ExtensionListResponse,
} from '@payload/contracts';
import { randomUUID } from 'node:crypto';

import { IntegrationSecretVault } from '../domain/integration-secret-vault';
import { env } from '../config/env';
import { TenantContext } from '../tenancy/tenant-context';
import {
  TenantExtensionRecord,
  type TenantExtensionDocument,
} from '../persistence/schemas/tenant-extension.schema';
import { PageExtensionInstanceRecord } from '../persistence/schemas/page-extension-instance.schema';
import { ExtensionConnectionRecord } from '../persistence/schemas/extension-connection.schema';
import { PageRecord } from '../persistence/schemas/page.schema';
import { ExtensionRegistry } from './extension-registry';
import { EventBus } from './event-bus';
import { customExtensionManifest } from './custom-extension';

@Injectable()
export class TenantExtensionService {
  constructor(
    @InjectModel(TenantExtensionRecord.name)
    private readonly extensionModel: Model<TenantExtensionRecord>,
    @Inject(ExtensionRegistry) private readonly registry: ExtensionRegistry,
    @Inject(TenantContext) private readonly tenantContext: TenantContext,
    @Inject(EventBus) private readonly events: EventBus,
    @Optional()
    @InjectModel(PageExtensionInstanceRecord.name)
    private readonly pageInstances?: Model<PageExtensionInstanceRecord>,
    @Optional()
    @InjectModel(ExtensionConnectionRecord.name)
    private readonly connections?: Model<ExtensionConnectionRecord>,
    @Optional()
    @InjectModel(PageRecord.name)
    private readonly pages?: Model<PageRecord>,
  ) {}

  async list(): Promise<ExtensionListResponse> {
    const records = await this.extensionModel.find().sort({ extensionId: 1 }).exec();
    const byId = new Map(records.map((record) => [record.extensionId, record]));
    const items = await Promise.all(
      this.registry
        .list()
        .map((state) =>
          this.toDescriptor(
            state.extension.manifest.id,
            byId.get(state.extension.manifest.id),
            state.extension.manifest,
          ),
        ),
    );
    const customItems = await Promise.all(
      records
        .filter((record) => record.definition && !this.registry.has(record.extensionId))
        .map((record) =>
          this.toDescriptor(
            record.extensionId,
            record,
            customExtensionManifest(record.definition!),
            record.definition,
          ),
        ),
    );
    return ExtensionListResponseSchema.parse({ items: [...items, ...customItems] });
  }

  async get(extensionId: string): Promise<ExtensionDescriptor> {
    const record = await this.extensionModel.findOne({ extensionId }).exec();
    const extension = this.registry.get(extensionId);
    if (!extension && !record?.definition) {
      throw this.extensionNotFound(extensionId);
    }
    return this.toDescriptor(
      extensionId,
      record ?? undefined,
      extension?.manifest ?? customExtensionManifest(record!.definition!),
      extension ? undefined : record?.definition,
    );
  }

  async createCustom(input: unknown): Promise<ExtensionDescriptor> {
    const parsed = CreateCustomExtensionRequestSchema.parse(input);
    if (this.registry.has(parsed.id)) {
      throw new ConflictException({
        code: 'EXTENSION_ID_ALREADY_REGISTERED',
        message: `Extension ${parsed.id} is already registered`,
      });
    }
    const existing = await this.extensionModel.findOne({ extensionId: parsed.id }).exec();
    if (existing) {
      throw new ConflictException({
        code: 'CUSTOM_EXTENSION_ALREADY_EXISTS',
        message: `Custom extension ${parsed.id} already exists`,
      });
    }
    const definition = CustomExtensionDefinitionSchema.parse(parsed);
    const record = await this.extensionModel.create({
      _id: randomUUID(),
      extensionId: definition.id,
      enabled: false,
      status: 'disabled',
      configuration: {},
      definition,
    });
    return this.toDescriptor(
      definition.id,
      record,
      customExtensionManifest(definition),
      definition,
    );
  }

  async updateCustom(extensionId: string, input: unknown): Promise<ExtensionDescriptor> {
    const record = await this.extensionModel.findOne({ extensionId }).exec();
    if (!record?.definition || this.registry.has(extensionId)) {
      throw this.customExtensionNotFound(extensionId);
    }
    const parsed = UpdateCustomExtensionRequestSchema.parse(input);
    const nextInput: Record<string, unknown> = {
      ...record.definition,
      ...parsed,
    };
    if (parsed.description === null) delete nextInput.description;
    const definition = CustomExtensionDefinitionSchema.parse(nextInput);
    record.set('definition', definition);
    await record.save();
    return this.toDescriptor(
      extensionId,
      record,
      customExtensionManifest(definition),
      definition,
    );
  }

  async removeCustom(extensionId: string): Promise<void> {
    if (this.registry.has(extensionId)) {
      throw new BadRequestException({
        code: 'BUILT_IN_EXTENSION_IMMUTABLE',
        message: 'Built-in extensions cannot be removed',
      });
    }
    const record = await this.extensionModel.findOne({ extensionId }).exec();
    if (!record?.definition) throw this.customExtensionNotFound(extensionId);
    if (this.pageInstances && (await this.pageInstances.exists({ extensionId }))) {
      throw new ConflictException({
        code: 'CUSTOM_EXTENSION_IN_USE',
        message: 'Remove this extension from pages before deleting it',
      });
    }
    if (this.connections && (await this.connections.exists({ extensionId }))) {
      throw new ConflictException({
        code: 'CUSTOM_EXTENSION_CONNECTIONS_IN_USE',
        message: 'Delete extension connections before deleting the extension',
      });
    }
    await this.extensionModel.deleteOne({ extensionId }).exec();
  }

  async enable(
    extensionId: string,
    configuration?: ExtensionConfiguration,
  ): Promise<ExtensionDescriptor> {
    const existing = await this.extensionModel.findOne({ extensionId }).exec();
    const manifest = this.resolveManifest(extensionId, existing);
    const nextConfiguration = this.validateConfiguration(extensionId, {
      ...(existing?.configuration ?? {}),
      ...(configuration ?? {}),
    });
    const enabled = new Set(
      (
        await this.extensionModel
          .find({ enabled: true })
          .select({ extensionId: 1 })
          .exec()
      ).map((record) => record.extensionId),
    );
    enabled.add(extensionId);
    if (this.registry.has(extensionId)) {
      try {
        this.registry.validateTenantDependencies(extensionId, (dependencyId) =>
          enabled.has(dependencyId),
        );
      } catch (error) {
        throw new ConflictException({
          code: 'EXTENSION_DEPENDENCY_UNAVAILABLE',
          message:
            error instanceof Error
              ? error.message
              : 'A required extension is unavailable',
        });
      }
    }

    const record = await this.extensionModel
      .findOneAndUpdate(
        { extensionId },
        {
          $set: {
            enabled: true,
            status: 'enabled',
            installedVersion: manifest.version,
            configuration: this.persistConfiguration(extensionId, nextConfiguration),
            lastError: undefined,
          },
          $setOnInsert: { _id: randomUUID(), connectionIds: [] },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
    if (!record) throw new Error('EXTENSION_CONFIG_WRITE_FAILED');
    await this.events.publish('extension.enabled', {
      tenantId: this.tenantContext.require().id,
      extensionId,
      occurredAt: new Date().toISOString(),
    });
    return this.toDescriptor(
      extensionId,
      record,
      manifest,
      this.customDefinitionForDescriptor(extensionId, record),
    );
  }

  async disable(extensionId: string): Promise<ExtensionDescriptor> {
    const existing = await this.extensionModel.findOne({ extensionId }).exec();
    const manifest = this.resolveManifest(extensionId, existing);
    await this.assertNoPublishedUsage(extensionId);
    const record = await this.extensionModel
      .findOneAndUpdate(
        { extensionId },
        {
          $set: { enabled: false, status: 'disabled', lastError: undefined },
          $setOnInsert: { _id: randomUUID(), configuration: {}, connectionIds: [] },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
    if (!record) throw new Error('EXTENSION_CONFIG_WRITE_FAILED');
    await this.events.publish('extension.disabled', {
      tenantId: this.tenantContext.require().id,
      extensionId,
      occurredAt: new Date().toISOString(),
    });
    return this.toDescriptor(
      extensionId,
      record,
      manifest,
      this.customDefinitionForDescriptor(extensionId, record),
    );
  }

  async updateConfiguration(
    extensionId: string,
    configuration: ExtensionConfiguration,
  ): Promise<ExtensionDescriptor> {
    const record = await this.extensionModel.findOne({ extensionId }).exec();
    const manifest = this.resolveManifest(extensionId, record);
    const nextConfiguration = this.validateConfiguration(extensionId, {
      ...(record?.configuration ?? {}),
      ...configuration,
    });
    const updated = await this.extensionModel
      .findOneAndUpdate(
        { extensionId },
        {
          $set: {
            configuration: this.persistConfiguration(extensionId, nextConfiguration),
            status: record?.enabled ? 'enabled' : 'disabled',
            lastError: undefined,
          },
          $setOnInsert: { _id: randomUUID(), enabled: false, connectionIds: [] },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
    if (!updated) throw new Error('EXTENSION_CONFIG_WRITE_FAILED');
    return this.toDescriptor(
      extensionId,
      updated,
      manifest,
      this.customDefinitionForDescriptor(extensionId, updated),
    );
  }

  private resolveManifest(
    extensionId: string,
    record: TenantExtensionDocument | null,
  ): ExtensionManifest {
    const extension = this.registry.get(extensionId);
    if (extension) return extension.manifest;
    if (record?.definition) return customExtensionManifest(record.definition);
    throw this.extensionNotFound(extensionId);
  }

  private extensionNotFound(extensionId: string): NotFoundException {
    return new NotFoundException({
      code: 'EXTENSION_NOT_FOUND',
      message: `Extension ${extensionId} was not found`,
    });
  }

  private customExtensionNotFound(extensionId: string): NotFoundException {
    return new NotFoundException({
      code: 'CUSTOM_EXTENSION_NOT_FOUND',
      message: `Custom extension ${extensionId} was not found`,
    });
  }

  private customDefinitionForDescriptor(
    extensionId: string,
    record: TenantExtensionDocument,
  ): TenantExtensionDocument['definition'] {
    return this.registry.has(extensionId) ? undefined : record.definition;
  }

  private validateConfiguration(
    extensionId: string,
    configuration: unknown,
  ): ExtensionConfiguration {
    try {
      if (!this.registry.has(extensionId)) {
        const parsed = ExtensionConfigurationSchema.parse(configuration);
        if (Object.keys(parsed).length > 0) {
          throw new Error('Custom extensions do not accept runtime configuration');
        }
        return parsed;
      }
      return this.registry.validateConfiguration(
        extensionId,
        ExtensionConfigurationSchema.parse(configuration),
      );
    } catch (error) {
      throw new BadRequestException({
        code: 'EXTENSION_CONFIGURATION_INVALID',
        message:
          error instanceof Error ? error.message : 'Extension configuration is invalid',
      });
    }
  }

  private persistConfiguration(
    extensionId: string,
    configuration: ExtensionConfiguration,
  ): ExtensionConfiguration {
    const fields = this.registry.get(extensionId)?.manifest.configuration?.fields ?? [];
    const secretFields = new Set(
      fields.filter((field) => field.type === 'secret').map((field) => field.key),
    );
    const hasPlainSecretValue = Object.entries(configuration).some(
      ([key, value]) =>
        secretFields.has(key) &&
        typeof value === 'string' &&
        value !== '' &&
        !isSecretCiphertext(value),
    );
    if (secretFields.size === 0 || !hasPlainSecretValue) return configuration;
    const vault = new IntegrationSecretVault(env.INTEGRATION_SECRET_ENCRYPTION_KEY);
    return Object.fromEntries(
      Object.entries(configuration).map(([key, value]) => [
        key,
        secretFields.has(key) && typeof value === 'string' && !isSecretCiphertext(value)
          ? vault.encrypt(value)
          : value,
      ]),
    );
  }

  private async toDescriptor(
    extensionId: string,
    record: TenantExtensionDocument | undefined,
    manifest: ExtensionManifest,
    custom?: TenantExtensionDocument['definition'],
  ): Promise<ExtensionDescriptor> {
    const tenantEnabled = record?.enabled === true;
    const health = this.registry.has(extensionId)
      ? tenantEnabled
        ? await this.registry.health(extensionId)
        : 'disabled'
      : tenantEnabled
        ? 'healthy'
        : 'disabled';
    const configuration = record?.configuration ?? {};
    const secretFields = new Set(
      (manifest.configuration?.fields ?? [])
        .filter((field) => field.type === 'secret')
        .map((field) => field.key),
    );
    const configuredFields = Object.entries(configuration)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key]) => key)
      .filter((key) => !secretFields.has(key) || configuration[key] !== undefined);
    return ExtensionDescriptorSchema.parse({
      manifest,
      lifecycle: this.registry.has(extensionId)
        ? tenantEnabled
          ? this.registry.lifecycle(extensionId)
          : 'disabled'
        : tenantEnabled
          ? 'active'
          : 'disabled',
      tenantEnabled,
      health,
      configuredFields,
      capabilities: manifest.capabilities,
      dependencies: manifest.dependencies,
      contributionEntries: this.registry.has(extensionId)
        ? this.registry.contributionEntries(extensionId)
        : [],
      ...(custom ? { custom } : {}),
      ...(record?.lastError ? { error: record.lastError } : {}),
    });
  }

  private async assertNoPublishedUsage(extensionId: string): Promise<void> {
    if (!this.pageInstances || !this.pages) return;
    const instances = await this.pageInstances
      .find({ extensionId, enabled: true })
      .select({ pageId: 1 })
      .exec();
    const pageIds = instances.map((instance) => instance.pageId);
    if (pageIds.length === 0) return;
    const published = await this.pages.exists({
      _id: { $in: pageIds },
      publishedVersionId: { $exists: true, $ne: null },
    });
    if (published) {
      throw new ConflictException({
        code: 'EXTENSION_PUBLISHED_DEPENDENCY',
        message:
          'Unpublish or remove this extension from published pages before disabling it',
      });
    }
  }
}

function isSecretCiphertext(value: string): boolean {
  return /^v1:[^:]+:[^:]+:[^:]+$/.test(value);
}
