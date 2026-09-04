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
  type PageComposition,
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
import { collectExtensionPlacements } from '../domain/page-composition';

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

  /**
   * Removes all page-scoped extension state after the page's ownership and
   * delete rules have already been checked by PageService.
   */
  async removeAllForPage(pageId: string, workspaceId: string): Promise<void> {
    await this.instanceModel.deleteMany({ pageId, workspaceId }).exec();
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

  /**
   * Projects the saved composition into the page-instance collection. The
   * composition remains authoritative; this collection is only the existing
   * page-settings/capability projection used by older CMS surfaces.
   */
  async synchronizeComposition(
    pageId: string,
    workspaceId: string,
    composition: PageComposition,
  ): Promise<void> {
    await this.requirePage(pageId, workspaceId);
    const attachmentByExtension = new Map<
      string,
      PageComposition['attachments'][number]
    >();
    for (const attachment of composition.attachments) {
      if (attachment.pageId !== pageId) {
        throw new BadRequestException({
          code: 'EXTENSION_ATTACHMENT_INVALID',
          message: `Extension attachment ${attachment.id} belongs to another page`,
        });
      }
      if (!attachmentByExtension.has(attachment.extensionId)) {
        attachmentByExtension.set(attachment.extensionId, attachment);
      }
      await this.resolveManifest(attachment.extensionId);
    }

    const existing = await this.instanceModel.find({ pageId, workspaceId }).exec();
    for (const instance of existing) {
      if (!attachmentByExtension.has(instance.extensionId)) {
        await this.instanceModel
          .deleteOne({ pageId, workspaceId, extensionId: instance.extensionId })
          .exec();
      }
    }

    for (const [extensionId, attachment] of attachmentByExtension) {
      const tenantEnabled = await this.tenantExtensionModel.exists({
        extensionId,
        enabled: true,
      });
      if (!tenantEnabled) continue;
      const manifest = await this.resolveManifest(extensionId);
      await this.instanceModel
        .findOneAndUpdate(
          { pageId, workspaceId, extensionId },
          {
            $set: {
              enabled: attachment.enabled,
              configuration: attachment.configuration,
              capabilities: manifest.capabilities,
              runtimeIds: this.runtimeIds(extensionId),
              ...(attachment.connectionId
                ? { connectionId: attachment.connectionId }
                : {}),
            },
            ...(attachment.connectionId ? {} : { $unset: { connectionId: 1 } }),
            $setOnInsert: { _id: randomUUID() },
          },
          { new: true, upsert: true, setDefaultsOnInsert: true },
        )
        .exec();
    }
  }

  async validateBeforePublish(
    pageId: string,
    workspaceId: string,
    payload: PagePayload,
    composition?: PageComposition,
  ): Promise<void> {
    if (composition) {
      await this.validateCompositionBeforePublish(
        pageId,
        workspaceId,
        payload,
        composition,
      );
      return;
    }
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
    return this.resolveRuntimeForExtensionIds(
      instances.map((instance) => instance.extensionId),
    );
  }

  async resolveRuntimeForComposition(
    pageId: string,
    workspaceId: string,
    composition: PageComposition,
  ) {
    await this.requirePage(pageId, workspaceId);
    const enabledTenantExtensions = new Set(
      (
        await this.tenantExtensionModel
          .find({ enabled: true })
          .select({ extensionId: 1 })
          .exec()
      ).map((record) => record.extensionId),
    );
    const extensionIds = [
      ...new Set(
        composition.attachments
          .filter((attachment) => attachment.enabled)
          .map((attachment) => attachment.extensionId)
          .filter((extensionId) => enabledTenantExtensions.has(extensionId)),
      ),
    ];
    return this.resolveRuntimeForExtensionIds(extensionIds);
  }

  async compilePublishedBundle(
    pageId: string,
    workspaceId: string,
    versionNumber: number,
    payload: PagePayload,
    composition?: PageComposition,
    legacyLayoutAttachments: PageComposition['layoutAttachments'] = [],
  ): Promise<PublishedPageBundle> {
    if (composition) {
      const extensions = await this.resolveRuntimeForComposition(
        pageId,
        workspaceId,
        composition,
      );
      const graph = await this.resolveCapabilitiesForComposition(
        pageId,
        workspaceId,
        composition,
      );
      const extensionVersions = Object.fromEntries(
        await Promise.all(
          [
            ...new Set(
              composition.attachments.map((attachment) => attachment.extensionId),
            ),
          ].map(async (extensionId) => {
            const manifest = await this.resolveManifest(extensionId);
            return [extensionId, manifest.version] as const;
          }),
        ),
      );
      return PublishedPageBundleSchema.parse({
        bundleVersion: 1,
        pageId,
        versionNumber,
        payload,
        attachments: composition.attachments,
        layoutAttachments: composition.layoutAttachments,
        bindings: composition.bindings,
        actions: composition.actions,
        resources: composition.resources,
        extensions,
        extensionVersions,
        capabilities: graph.capabilities,
        runtimeIds: graph.runtimeIds,
        styleAssetIds: extensions.flatMap((extension) => extension.styleAssetIds),
        compiledAt: new Date().toISOString(),
      });
    }
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
      layoutAttachments: legacyLayoutAttachments,
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

  async resolveCapabilitiesForComposition(
    pageId: string,
    workspaceId: string,
    composition: PageComposition,
  ): Promise<PageCapabilityGraph> {
    await this.requirePage(pageId, workspaceId);
    const extensionIds = [
      ...new Set(
        composition.attachments
          .filter((attachment) => attachment.enabled)
          .map((attachment) => attachment.extensionId),
      ),
    ];
    const capabilities = new Set<string>();
    const runtimeIds = new Set<string>();
    const dataBindings = new Set<string>();
    const slots = new Set<ExtensionSlot>();
    for (const extensionId of extensionIds) {
      const manifest = await this.resolveManifest(extensionId);
      manifest.capabilities.forEach((capability) => capabilities.add(capability));
      this.runtimeIds(extensionId).forEach((runtimeId) => runtimeIds.add(runtimeId));
      manifest.contributions?.builder?.dataBindings.forEach((binding) =>
        dataBindings.add(binding.id),
      );
      manifest.contributions?.page?.slots.forEach((slot) => slots.add(slot));
      manifest.contributions?.renderer?.slots.forEach((slot) => slots.add(slot));
    }
    return PageCapabilityGraphSchema.parse({
      pageId,
      extensionIds,
      capabilities: [...capabilities].sort(),
      runtimeIds: [...runtimeIds].sort(),
      dataBindings: [...dataBindings].sort(),
      slots: [...slots].sort(),
    });
  }

  private async validateCompositionBeforePublish(
    pageId: string,
    workspaceId: string,
    payload: PagePayload,
    composition: PageComposition,
  ): Promise<void> {
    if (composition.pageId !== pageId) {
      throw new BadRequestException({
        code: 'EXTENSION_ATTACHMENT_INVALID',
        message: 'The page composition belongs to another page',
      });
    }
    const attachmentById = new Map<string, PageComposition['attachments'][number]>();
    for (const attachment of composition.attachments) {
      if (attachment.pageId !== pageId) {
        throw new BadRequestException({
          code: 'EXTENSION_ATTACHMENT_INVALID',
          message: `Extension attachment ${attachment.id} belongs to another page`,
        });
      }
      if (attachmentById.has(attachment.id)) {
        throw new BadRequestException({
          code: 'EXTENSION_ATTACHMENT_INVALID',
          message: `Extension attachment ${attachment.id} is duplicated`,
        });
      }
      attachmentById.set(attachment.id, attachment);
      await this.resolveManifest(attachment.extensionId);
      for (const resourceId of attachment.resourceIds) {
        if (!composition.resources.some((resource) => resource.id === resourceId)) {
          throw new BadRequestException({
            code: 'EXTENSION_RESOURCE_MISSING',
            message: `Extension attachment ${attachment.id} references missing resource ${resourceId}`,
          });
        }
      }
      if (attachment.connectionId) {
        if (!this.connectionModel) {
          throw new ConflictException({
            code: 'EXTENSION_CONNECTION_UNAVAILABLE',
            message: 'Extension connections are not configured',
          });
        }
        const connection = await this.connectionModel
          .findOne({ _id: attachment.connectionId, extensionId: attachment.extensionId })
          .exec();
        if (!connection) {
          throw new BadRequestException({
            code: 'EXTENSION_CONNECTION_NOT_FOUND',
            message: `Connection ${attachment.connectionId} does not belong to ${attachment.extensionId}`,
          });
        }
      }
    }

    const usedAttachments = new Set<string>();
    const usedExtensions = new Set<string>();
    for (const placement of collectExtensionPlacements(payload.root)) {
      const attachment = placement.attachmentId
        ? attachmentById.get(placement.attachmentId)
        : composition.attachments.find(
            (candidate) =>
              !usedAttachments.has(candidate.id) &&
              candidate.extensionId === placement.extensionId,
          );
      if (!attachment || attachment.extensionId !== placement.extensionId) {
        throw new BadRequestException({
          code: 'EXTENSION_NODE_ATTACHMENT_MISMATCH',
          message: `Visual extension node ${placement.extensionId} has no matching attachment`,
        });
      }
      if (usedAttachments.has(attachment.id)) {
        throw new BadRequestException({
          code: 'EXTENSION_NODE_ATTACHMENT_MISMATCH',
          message: `Attachment ${attachment.id} is shared by multiple visual nodes`,
        });
      }
      usedAttachments.add(attachment.id);
      if (!attachment.enabled) {
        throw new BadRequestException({
          code: 'EXTENSION_ATTACHMENT_INVALID',
          message: `Extension ${attachment.extensionId} is disabled for this page`,
        });
      }
      usedExtensions.add(attachment.extensionId);
      if (this.registry.has(attachment.extensionId)) {
        const runtime = this.registry.runtime(attachment.extensionId);
        if (
          runtime.runtimeIds.length === 0 &&
          runtime.styleAssetIds.length === 0 &&
          runtime.slots.length === 0
        ) {
          throw new BadRequestException({
            code: 'EXTENSION_RUNTIME_UNAVAILABLE',
            message: `Extension ${attachment.extensionId} has no renderer runtime contribution`,
          });
        }
      }
      await this.requireTenantExtensionEnabled(attachment.extensionId);
      this.validatePageConfiguration(attachment.extensionId, attachment.configuration);
    }

    for (const attachment of composition.attachments) {
      if (!attachment.enabled || usedExtensions.has(attachment.extensionId)) continue;
      await this.requireTenantExtensionEnabled(attachment.extensionId);
      this.validatePageConfiguration(attachment.extensionId, attachment.configuration);
    }

    for (const extensionId of usedExtensions) {
      if (!this.registry.has(extensionId)) continue;
      const attachment = composition.attachments.find(
        (candidate) => candidate.extensionId === extensionId && candidate.enabled,
      );
      if (!attachment) continue;
      await this.registry.beforePublish({
        extensionId,
        pageId,
        workspaceId,
        payload,
        configuration: this.validatePageConfiguration(
          extensionId,
          attachment.configuration,
        ),
      });
    }
  }

  private async resolveRuntimeForExtensionIds(extensionIds: readonly string[]) {
    return Promise.all(
      [...new Set(extensionIds)].sort().map(async (extensionId) => {
        if (this.registry.has(extensionId)) return this.registry.runtime(extensionId);
        const custom = await this.customDefinition(extensionId);
        if (custom) {
          return {
            extensionId,
            runtimeIds: [],
            styleAssetIds: [],
            slots: [],
            custom,
          };
        }
        return { extensionId, runtimeIds: [], styleAssetIds: [], slots: [] };
      }),
    );
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
