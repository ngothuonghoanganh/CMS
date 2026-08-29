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
  ExtensionConfigurationSchema,
  PageExtensionInstanceSchema,
  PageExtensionListResponseSchema,
  PageExtensionMutationRequestSchema,
  PageCapabilityGraphSchema,
  type ExtensionConfiguration,
  type CustomExtensionDefinition,
  type ExtensionManifest,
  type PageExtensionInstance,
  type PageExtensionListResponse,
  type PageExtensionMutationRequest,
  type PageCapabilityGraph,
  type PagePayload,
  type ExtensionSlot,
  type PublishedPageBundle,
  PublishedPageBundleSchema,
} from '@payload/contracts';
import { randomUUID } from 'node:crypto';

import { env } from '../config/env';
import { IntegrationSecretVault } from '../domain/integration-secret-vault';
import { PageRecord, type PageDocument } from '../persistence/schemas/page.schema';
import {
  PageExtensionInstanceRecord,
  type PageExtensionInstanceDocument,
} from '../persistence/schemas/page-extension-instance.schema';
import { ExtensionConnectionRecord } from '../persistence/schemas/extension-connection.schema';
import { TenantExtensionRecord } from '../persistence/schemas/tenant-extension.schema';
import { ExtensionRegistry } from './extension-registry';
import { customExtensionManifest } from './custom-extension';

@Injectable()
export class PageExtensionService {
  constructor(
    @InjectModel(PageExtensionInstanceRecord.name)
    private readonly instanceModel: Model<PageExtensionInstanceRecord>,
    @InjectModel(PageRecord.name)
    private readonly pageModel: Model<PageRecord>,
    @InjectModel(TenantExtensionRecord.name)
    private readonly tenantExtensionModel: Model<TenantExtensionRecord>,
    @Inject(ExtensionRegistry) private readonly registry: ExtensionRegistry,
    @Optional()
    @InjectModel(ExtensionConnectionRecord.name)
    private readonly connectionModel?: Model<ExtensionConnectionRecord>,
  ) {}

  async list(pageId: string, workspaceId: string): Promise<PageExtensionListResponse> {
    await this.requirePage(pageId, workspaceId);
    const records = await this.instanceModel
      .find({ pageId, workspaceId })
      .sort({ extensionId: 1 })
      .exec();
    return PageExtensionListResponseSchema.parse({
      items: records.map((record) => this.toContract(record)),
    });
  }

  async upsert(
    pageId: string,
    extensionId: string,
    input: PageExtensionMutationRequest,
    workspaceId: string,
  ): Promise<PageExtensionInstance> {
    const parsed = PageExtensionMutationRequestSchema.parse(input);
    await this.requirePage(pageId, workspaceId);
    const extension = this.registry.get(extensionId);
    const custom = extension ? undefined : await this.customDefinition(extensionId);
    if (!extension && !custom) {
      throw new NotFoundException({
        code: 'EXTENSION_NOT_FOUND',
        message: `Extension ${extensionId} was not found`,
      });
    }
    const manifest = extension?.manifest ?? customExtensionManifest(custom!);

    const existing = await this.instanceModel
      .findOne({ pageId, workspaceId, extensionId })
      .exec();
    const enabled = parsed.enabled ?? existing?.enabled ?? true;
    if (enabled) {
      await this.requireTenantExtensionEnabled(extensionId);
      await this.validateTenantDependencies(extensionId);
    }

    const nextConnectionId =
      parsed.connectionId === null
        ? undefined
        : (parsed.connectionId ?? existing?.connectionId);
    if (nextConnectionId) {
      if (!this.connectionModel) {
        throw new ConflictException({
          code: 'EXTENSION_CONNECTION_UNAVAILABLE',
          message: 'Extension connections are not configured',
        });
      }
      const connection = await this.connectionModel
        .findOne({ _id: nextConnectionId, extensionId })
        .exec();
      if (!connection) {
        throw new ConflictException({
          code: 'EXTENSION_CONNECTION_NOT_FOUND',
          message: `Connection ${nextConnectionId} does not belong to extension ${extensionId}`,
        });
      }
    }

    const configuration = this.validatePageConfiguration(extensionId, {
      ...(existing?.configuration ?? {}),
      ...(parsed.configuration ?? {}),
    });
    const record = await this.instanceModel
      .findOneAndUpdate(
        { pageId, workspaceId, extensionId },
        {
          $set: {
            enabled,
            configuration: this.persistConfiguration(extensionId, configuration),
            capabilities: manifest.capabilities,
            runtimeIds: extension ? this.registry.runtime(extensionId).runtimeIds : [],
            ...(nextConnectionId ? { connectionId: nextConnectionId } : {}),
          },
          ...(parsed.connectionId === null ? { $unset: { connectionId: 1 } } : {}),
          $setOnInsert: { _id: randomUUID() },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
    if (!record) throw new Error('PAGE_EXTENSION_INSTANCE_WRITE_FAILED');
    return this.toContract(record);
  }

  async remove(pageId: string, extensionId: string, workspaceId: string): Promise<void> {
    await this.requirePage(pageId, workspaceId);
    await this.instanceModel.deleteOne({ pageId, workspaceId, extensionId }).exec();
  }

  async synchronizePayload(
    pageId: string,
    workspaceId: string,
    payload: PagePayload,
  ): Promise<void> {
    for (const extensionId of await this.usedExtensionIds(payload)) {
      const manifest = await this.resolveManifest(extensionId);
      const tenantEnabled = await this.tenantExtensionModel.exists({
        extensionId,
        enabled: true,
      });
      if (!tenantEnabled) continue;
      const existing = await this.instanceModel
        .findOne({ pageId, workspaceId, extensionId })
        .exec();
      if (existing) continue;
      await this.instanceModel.create({
        _id: randomUUID(),
        workspaceId,
        pageId,
        extensionId,
        enabled: true,
        configuration: {},
        capabilities: manifest.capabilities,
        runtimeIds: this.runtimeIds(extensionId),
      });
    }
  }

  async validateBeforePublish(
    pageId: string,
    workspaceId: string,
    payload: PagePayload,
  ): Promise<void> {
    const pageExtensions = await this.instanceModel
      .find({ pageId, workspaceId, enabled: true })
      .exec();
    const usedExtensionIds = await this.usedExtensionIds(payload);
    for (const extensionId of usedExtensionIds) {
      const instance = pageExtensions.find((item) => item.extensionId === extensionId);
      if (!instance) {
        throw new BadRequestException({
          code: 'PAGE_EXTENSION_INSTANCE_REQUIRED',
          message: `Extension ${extensionId} must be enabled for this page before publishing`,
        });
      }
      await this.requireTenantExtensionEnabled(extensionId);
    }

    for (const instance of pageExtensions) {
      if (this.registry.has(instance.extensionId)) {
        const configuration = this.validatePageConfiguration(
          instance.extensionId,
          instance.configuration,
        );
        await this.registry.beforePublish({
          extensionId: instance.extensionId,
          pageId,
          workspaceId,
          payload,
          configuration,
        });
      }
    }
  }

  async afterPublish(
    pageId: string,
    workspaceId: string,
    versionNumber: number,
  ): Promise<void> {
    const pageExtensions = await this.instanceModel
      .find({ pageId, workspaceId, enabled: true })
      .exec();
    await Promise.all(
      pageExtensions.map(async (instance) => {
        try {
          if (this.registry.has(instance.extensionId)) {
            await this.registry.afterPublish({
              extensionId: instance.extensionId,
              pageId,
              workspaceId,
              versionNumber,
            });
          }
        } catch {
          // After-publish work is best effort; publication is already durable.
        }
      }),
    );
  }

  async resolveRuntime(pageId: string, workspaceId: string) {
    const instances = await this.activeInstances(pageId, workspaceId);
    return Promise.all(
      instances.map(async (instance) => {
        if (this.registry.has(instance.extensionId)) {
          return this.registry.runtime(instance.extensionId);
        }
        const custom = await this.customDefinition(instance.extensionId);
        if (custom) {
          return {
            extensionId: instance.extensionId,
            runtimeIds: [],
            styleAssetIds: [],
            slots: [],
            custom,
          };
        }
        return {
          extensionId: instance.extensionId,
          runtimeIds: [],
          styleAssetIds: [],
          slots: [],
        };
      }),
    );
  }

  async compilePublishedBundle(
    pageId: string,
    workspaceId: string,
    versionNumber: number,
    payload: PagePayload,
  ): Promise<PublishedPageBundle> {
    const active = await this.activeInstances(pageId, workspaceId);
    const extensions = await this.resolveRuntime(pageId, workspaceId);
    const graph = await this.resolveCapabilities(pageId, workspaceId);
    const extensionVersions = Object.fromEntries(
      await Promise.all(
        active.map(async (instance) => {
          const manifest = await this.resolveManifest(instance.extensionId);
          return [instance.extensionId, manifest.version] as const;
        }),
      ),
    );
    const attachments = active.map((instance) => {
      const contract = this.toContract(instance);
      return {
        id: contract.id,
        pageId,
        extensionId: contract.extensionId,
        ...(contract.connectionId ? { connectionId: contract.connectionId } : {}),
        enabled: contract.enabled,
        configuration: contract.configuration,
        resourceIds: [],
      };
    });
    return PublishedPageBundleSchema.parse({
      bundleVersion: 1,
      pageId,
      versionNumber,
      payload,
      attachments,
      bindings: [],
      actions: [],
      resources: [],
      extensions,
      extensionVersions,
      capabilities: graph.capabilities,
      runtimeIds: graph.runtimeIds,
      styleAssetIds: extensions.flatMap((extension) => extension.styleAssetIds),
      compiledAt: new Date().toISOString(),
    });
  }

  async resolveCapabilities(
    pageId: string,
    workspaceId: string,
  ): Promise<PageCapabilityGraph> {
    const active = await this.activeInstances(pageId, workspaceId);
    const capabilities = new Set<string>();
    const runtimeIds = new Set<string>();
    const dataBindings = new Set<string>();
    const slots = new Set<ExtensionSlot>();
    for (const instance of active) {
      const manifest = await this.resolveManifest(instance.extensionId);
      manifest.capabilities.forEach((capability) => capabilities.add(capability));
      this.runtimeIds(instance.extensionId).forEach((runtimeId) =>
        runtimeIds.add(runtimeId),
      );
      manifest.contributions?.builder?.dataBindings.forEach((binding) =>
        dataBindings.add(binding.id),
      );
      manifest.contributions?.page?.slots.forEach((slot) => slots.add(slot));
      manifest.contributions?.renderer?.slots.forEach((slot) => slots.add(slot));
    }
    return PageCapabilityGraphSchema.parse({
      pageId,
      extensionIds: active.map((instance) => instance.extensionId),
      capabilities: [...capabilities].sort(),
      runtimeIds: [...runtimeIds].sort(),
      dataBindings: [...dataBindings].sort(),
      slots: [...slots].sort(),
    });
  }

  private async activeInstances(
    pageId: string,
    workspaceId: string,
  ): Promise<PageExtensionInstanceDocument[]> {
    await this.requirePage(pageId, workspaceId);
    const instances = await this.instanceModel
      .find({ pageId, workspaceId, enabled: true })
      .sort({ extensionId: 1 })
      .exec();
    const enabledTenantExtensions = new Set(
      (
        await this.tenantExtensionModel
          .find({ enabled: true })
          .select({ extensionId: 1 })
          .exec()
      ).map((record) => record.extensionId),
    );
    return instances.filter((instance) =>
      enabledTenantExtensions.has(instance.extensionId),
    );
  }

  private async usedExtensionIds(payload: PagePayload): Promise<Set<string>> {
    const nodeTypes = collectNodeTypes(payload.root);
    const ids = new Set(
      this.registry
        .list()
        .filter((state) =>
          (state.extension.manifest.contributions?.builder?.elements ?? []).some(
            (element) => nodeTypes.has(element.nodeType),
          ),
        )
        .map((state) => state.extension.manifest.id),
    );
    for (const extensionId of collectCustomExtensionIds(payload.root)) {
      if (await this.customDefinition(extensionId)) ids.add(extensionId);
    }
    return ids;
  }

  private async resolveManifest(extensionId: string): Promise<ExtensionManifest> {
    const extension = this.registry.get(extensionId);
    if (extension) return extension.manifest;
    const custom = await this.customDefinition(extensionId);
    if (custom) return customExtensionManifest(custom);
    throw new NotFoundException({
      code: 'EXTENSION_NOT_FOUND',
      message: `Extension ${extensionId} was not found`,
    });
  }

  private async customDefinition(
    extensionId: string,
  ): Promise<CustomExtensionDefinition | undefined> {
    const record = await this.tenantExtensionModel
      .findOne({ extensionId })
      .select({ definition: 1 })
      .exec();
    return record?.definition;
  }

  private runtimeIds(extensionId: string): string[] {
    return this.registry.has(extensionId)
      ? this.registry.runtime(extensionId).runtimeIds
      : [];
  }

  private async requirePage(pageId: string, workspaceId: string): Promise<PageDocument> {
    const page = await this.pageModel.findOne({ _id: pageId, workspaceId }).exec();
    if (!page) {
      throw new NotFoundException({
        code: 'PAGE_NOT_FOUND',
        message: `Page ${pageId} was not found`,
      });
    }
    return page;
  }

  private async requireTenantExtensionEnabled(extensionId: string): Promise<void> {
    const record = await this.tenantExtensionModel.findOne({ extensionId }).exec();
    if (!record?.enabled) {
      throw new ConflictException({
        code: 'TENANT_EXTENSION_DISABLED',
        message: `Extension ${extensionId} is not enabled for this tenant`,
      });
    }
  }

  private async validateTenantDependencies(extensionId: string): Promise<void> {
    if (!this.registry.has(extensionId)) return;
    const enabled = new Set(
      (
        await this.tenantExtensionModel
          .find({ enabled: true })
          .select({ extensionId: 1 })
          .exec()
      ).map((record) => record.extensionId),
    );
    try {
      this.registry.validateTenantDependencies(extensionId, (dependencyId) =>
        enabled.has(dependencyId),
      );
    } catch (error) {
      throw new ConflictException({
        code: 'PAGE_EXTENSION_DEPENDENCY_UNAVAILABLE',
        message:
          error instanceof Error ? error.message : 'A required extension is unavailable',
      });
    }
  }

  private validatePageConfiguration(
    extensionId: string,
    configuration: unknown,
  ): ExtensionConfiguration {
    try {
      if (!this.registry.has(extensionId)) {
        const parsed = ExtensionConfigurationSchema.parse(configuration);
        if (Object.keys(parsed).length > 0) {
          throw new Error('Custom extensions do not accept page configuration');
        }
        return parsed;
      }
      return this.registry.validatePageConfiguration(
        extensionId,
        ExtensionConfigurationSchema.parse(configuration),
      );
    } catch (error) {
      throw new BadRequestException({
        code: 'PAGE_EXTENSION_CONFIGURATION_INVALID',
        message:
          error instanceof Error
            ? error.message
            : 'Page extension configuration is invalid',
      });
    }
  }

  private persistConfiguration(
    extensionId: string,
    configuration: ExtensionConfiguration,
  ): ExtensionConfiguration {
    const fields =
      this.registry.get(extensionId)?.manifest.pageConfiguration?.fields ?? [];
    const secretFields = new Set(
      fields.filter((field) => field.type === 'secret').map((field) => field.key),
    );
    if (secretFields.size === 0) return configuration;
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

  private toContract(record: PageExtensionInstanceDocument): PageExtensionInstance {
    const fields =
      this.registry.get(record.extensionId)?.manifest.pageConfiguration?.fields ?? [];
    const secretFields = new Set(
      fields.filter((field) => field.type === 'secret').map((field) => field.key),
    );
    const configuration = Object.fromEntries(
      Object.entries(record.configuration ?? {}).filter(
        ([key]) => !secretFields.has(key),
      ),
    );
    return PageExtensionInstanceSchema.parse({
      id: record._id.toString(),
      pageId: record.pageId,
      extensionId: record.extensionId,
      ...(record.connectionId ? { connectionId: record.connectionId } : {}),
      enabled: record.enabled,
      configuration,
      capabilities: record.capabilities,
      runtimeIds: record.runtimeIds,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }
}

function collectNodeTypes(root: {
  type: string;
  children?: readonly { type: string; children?: unknown }[];
}): Set<string> {
  const types = new Set<string>();
  const pending: Array<{
    type: string;
    children?: readonly { type: string; children?: unknown }[];
  }> = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    types.add(current.type);
    for (const child of current.children ?? []) {
      if (child && typeof child.type === 'string') {
        pending.push(
          child as {
            type: string;
            children?: readonly { type: string; children?: unknown }[];
          },
        );
      }
    }
  }
  return types;
}

type ExtensionScanNode = {
  type: string;
  props?: unknown;
  children?: readonly ExtensionScanNode[];
};

function collectCustomExtensionIds(root: ExtensionScanNode): Set<string> {
  const ids = new Set<string>();
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    if (current.type === 'extension' && isRecord(current.props)) {
      const extensionId = current.props.extensionId;
      if (typeof extensionId === 'string') ids.add(extensionId);
    }
    for (const child of current.children ?? []) {
      if (child && typeof child.type === 'string') {
        pending.push(child);
      }
    }
  }
  return ids;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSecretCiphertext(value: string): boolean {
  return /^v1:[^:]+:[^:]+:[^:]+$/.test(value);
}
