import {
  Inject,
  Injectable,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  EXTENSION_API_VERSION,
  ExtensionConfigurationSchema,
  ExtensionDefinitionSchema,
  ExtensionHealthSchema,
  ExtensionManifestSchema,
  ExtensionPermissionKeys,
  TenantPermissionSchema,
  type ExtensionConfiguration,
  type ExtensionContributionEntry,
  type ExtensionHealth,
  type ExtensionManifest,
  type ExtensionLifecycle,
  type ExtensionContribution,
  type ExtensionDefinition,
  type PageRuntimeExtension,
} from '@payload/contracts';
import { platformLogger } from '../common/logging/platform-logger';
import { CapabilityRegistry } from './capability-registry';
import { ContributionRegistry } from './contribution-registry';
import { EventBus } from './event-bus';

export type ExtensionRegistrationContext = {
  capabilities: CapabilityRegistry;
  contributions: ContributionRegistry;
  events: EventBus;
};

export type PlatformExtension = {
  manifest: ExtensionManifest;
  /** Optional normalized package definition for new extensions. */
  definition?: ExtensionDefinition;
  register?: (context: ExtensionRegistrationContext) => void | Promise<void>;
  initialize?: () => void | Promise<void>;
  dispose?: () => void | Promise<void>;
  health?: () => ExtensionHealth | Promise<ExtensionHealth>;
  beforePublish?: (context: {
    extensionId: string;
    pageId: string;
    workspaceId: string;
    payload: unknown;
    configuration?: ExtensionConfiguration;
  }) => void | Promise<void>;
  afterPublish?: (context: {
    extensionId: string;
    pageId: string;
    workspaceId: string;
    versionNumber: number;
  }) => void | Promise<void>;
};

export const PLATFORM_EXTENSIONS = Symbol('PLATFORM_EXTENSIONS');

export type ExtensionState = {
  extension: PlatformExtension;
  lifecycle: ExtensionLifecycle;
  error?: string;
};

@Injectable()
export class ExtensionRegistry implements OnModuleInit, OnModuleDestroy {
  private readonly states = new Map<string, ExtensionState>();

  constructor(
    @Inject(PLATFORM_EXTENSIONS) extensions: readonly PlatformExtension[],
    @Inject(CapabilityRegistry) private readonly capabilities: CapabilityRegistry,
    @Inject(EventBus) private readonly events: EventBus,
    @Optional()
    @Inject(ContributionRegistry)
    private readonly contributionRegistry?: ContributionRegistry,
  ) {
    for (const extension of extensions) this.register(extension);
  }

  register(extension: PlatformExtension): void {
    const manifest = ExtensionManifestSchema.parse(extension.manifest);
    const definition = extension.definition
      ? ExtensionDefinitionSchema.parse(extension.definition)
      : undefined;
    if (
      definition &&
      (definition.manifest.id !== manifest.id ||
        definition.manifest.version !== manifest.version)
    ) {
      throw new Error(`EXTENSION_DEFINITION_MANIFEST_MISMATCH:${manifest.id}`);
    }
    if (manifest.apiVersion !== EXTENSION_API_VERSION) {
      throw new Error(`EXTENSION_API_VERSION_UNSUPPORTED:${manifest.id}`);
    }
    if (this.states.has(manifest.id)) {
      throw new Error(`EXTENSION_ID_DUPLICATE:${manifest.id}`);
    }
    const capabilities = new Set(manifest.capabilities);
    if (capabilities.size !== manifest.capabilities.length) {
      throw new Error(`EXTENSION_CAPABILITY_DUPLICATE:${manifest.id}`);
    }
    for (const permission of manifest.permissions) {
      if (
        !TenantPermissionSchema.safeParse(permission).success &&
        permission !== ExtensionPermissionKeys.Read &&
        permission !== ExtensionPermissionKeys.Manage
      ) {
        throw new Error(`EXTENSION_PERMISSION_INVALID:${manifest.id}:${permission}`);
      }
    }
    this.states.set(manifest.id, {
      extension: { ...extension, manifest, ...(definition ? { definition } : {}) },
      lifecycle: 'registered',
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      this.validate();
    } catch (error) {
      platformLogger.error({ err: error }, 'extension registry validation failed');
      for (const state of this.states.values()) {
        state.lifecycle = 'error';
        state.error = error instanceof Error ? error.message : String(error);
      }
      return;
    }

    for (const state of this.dependencyOrder()) {
      try {
        state.lifecycle = 'validated';
        for (const capability of state.extension.manifest.capabilities) {
          this.capabilities.register(capability, state.extension.manifest.id);
        }
        this.contributionRegistry?.registerMany(
          state.extension.manifest.id,
          this.entriesForExtension(state.extension),
        );
        await state.extension.register?.({
          capabilities: this.capabilities,
          contributions: this.contributionRegistry ?? new ContributionRegistry(),
          events: this.events,
        });
        state.lifecycle = 'enabled';
        await state.extension.initialize?.();
        state.lifecycle = 'initialized';
        state.lifecycle = 'active';
        platformLogger.info(
          {
            extensionId: state.extension.manifest.id,
            version: state.extension.manifest.version,
          },
          'extension active',
        );
      } catch (error) {
        state.lifecycle = 'error';
        state.error = error instanceof Error ? error.message : String(error);
        platformLogger.error(
          { err: error, extensionId: state.extension.manifest.id },
          'extension initialization failed',
        );
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const state of this.states.values()) {
      try {
        await state.extension.dispose?.();
      } catch (error) {
        platformLogger.warn(
          { err: error, extensionId: state.extension.manifest.id },
          'extension disposal failed',
        );
      }
    }
  }

  get(extensionId: string): PlatformExtension | undefined {
    return this.states.get(extensionId)?.extension;
  }

  has(extensionId: string): boolean {
    return this.states.has(extensionId);
  }

  list(): readonly ExtensionState[] {
    return [...this.states.values()];
  }

  loadOrder(): readonly string[] {
    return this.dependencyOrder().map((state) => state.extension.manifest.id);
  }

  lifecycle(extensionId: string): ExtensionLifecycle {
    return this.requireState(extensionId).lifecycle;
  }

  async health(extensionId: string): Promise<ExtensionHealth> {
    const state = this.requireState(extensionId);
    if (state.lifecycle === 'error') return 'error';
    try {
      return ExtensionHealthSchema.parse((await state.extension.health?.()) ?? 'healthy');
    } catch (error) {
      platformLogger.warn({ err: error, extensionId }, 'extension health check failed');
      return 'error';
    }
  }

  validate(): void {
    const states = [...this.states.values()];
    const byId = new Map(states.map((state) => [state.extension.manifest.id, state]));
    for (const state of states) {
      for (const dependency of state.extension.manifest.dependencies) {
        const target = byId.get(dependency.extensionId);
        if (!target)
          throw new Error(`EXTENSION_DEPENDENCY_MISSING:${state.extension.manifest.id}`);
        if (!satisfiesVersion(target.extension.manifest.version, dependency.version)) {
          throw new Error(`EXTENSION_DEPENDENCY_VERSION:${state.extension.manifest.id}`);
        }
      }
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visiting.has(id)) throw new Error(`EXTENSION_DEPENDENCY_CYCLE:${id}`);
      if (visited.has(id)) return;
      visiting.add(id);
      for (const dependency of byId.get(id)?.extension.manifest.dependencies ?? []) {
        visit(dependency.extensionId);
      }
      visiting.delete(id);
      visited.add(id);
    };
    for (const state of states) visit(state.extension.manifest.id);
  }

  private dependencyOrder(): readonly ExtensionState[] {
    this.validate();
    const states = [...this.states.values()];
    const byId = new Map(states.map((state) => [state.extension.manifest.id, state]));
    const visited = new Set<string>();
    const ordered: ExtensionState[] = [];
    const visit = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      for (const dependency of byId.get(id)?.extension.manifest.dependencies ?? []) {
        visit(dependency.extensionId);
      }
      const state = byId.get(id);
      if (state) ordered.push(state);
    };
    for (const state of states) visit(state.extension.manifest.id);
    return ordered;
  }

  private entriesForExtension(
    extension: PlatformExtension,
  ): readonly ExtensionContributionEntry[] {
    if (extension.definition) return extension.definition.contributions;
    return manifestContributionEntries(extension.manifest);
  }

  validateConfiguration(extensionId: string, input: unknown): ExtensionConfiguration {
    return this.validateConfigurationDefinition(
      extensionId,
      input,
      this.requireState(extensionId).extension.manifest.configuration?.fields ?? [],
    );
  }

  validatePageConfiguration(extensionId: string, input: unknown): ExtensionConfiguration {
    const extension = this.requireState(extensionId).extension;
    return this.validateConfigurationDefinition(
      extensionId,
      input,
      extension.manifest.pageConfiguration?.fields ?? [],
    );
  }

  contribution(extensionId: string): ExtensionContribution | undefined {
    return this.requireState(extensionId).extension.manifest.contributions;
  }

  contributionEntries(extensionId: string): readonly ExtensionContributionEntry[] {
    return this.entriesForExtension(this.requireState(extensionId).extension);
  }

  runtime(extensionId: string): PageRuntimeExtension {
    const extension = this.requireState(extensionId).extension;
    const renderer = extension.manifest.contributions?.renderer;
    return {
      extensionId,
      runtimeIds: renderer?.runtimeIds ?? [],
      styleAssetIds: renderer?.styleAssetIds ?? [],
      slots: renderer?.slots ?? [],
    };
  }

  async beforePublish(context: {
    extensionId: string;
    pageId: string;
    workspaceId: string;
    payload: unknown;
    configuration?: ExtensionConfiguration;
  }): Promise<void> {
    await this.requireState(context.extensionId).extension.beforePublish?.(context);
  }

  async afterPublish(context: {
    extensionId: string;
    pageId: string;
    workspaceId: string;
    versionNumber: number;
  }): Promise<void> {
    await this.requireState(context.extensionId).extension.afterPublish?.(context);
  }

  private validateConfigurationDefinition(
    extensionId: string,
    input: unknown,
    fields: readonly {
      key: string;
      type: 'text' | 'url' | 'secret' | 'boolean' | 'number';
      required: boolean;
    }[],
  ): ExtensionConfiguration {
    const configuration = ExtensionConfigurationSchema.parse(input);
    const fieldKeys = new Set(fields.map((field) => field.key));
    for (const key of Object.keys(configuration)) {
      if (!fieldKeys.has(key)) throw new Error(`EXTENSION_CONFIG_FIELD_UNKNOWN:${key}`);
    }
    for (const field of fields) {
      const value = configuration[field.key];
      if (field.required && (value === undefined || value === '')) {
        throw new Error(`EXTENSION_CONFIG_FIELD_REQUIRED:${field.key}`);
      }
      if (value !== undefined && field.type === 'url') {
        try {
          const url = new URL(String(value));
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsafe');
        } catch {
          throw new Error(`EXTENSION_CONFIG_FIELD_URL:${field.key}`);
        }
      }
    }
    return configuration;
  }

  validateTenantDependencies(
    extensionId: string,
    enabled: (id: string) => boolean,
  ): void {
    const state = this.requireState(extensionId);
    for (const dependency of state.extension.manifest.dependencies) {
      if (!enabled(dependency.extensionId)) {
        throw new Error(`EXTENSION_DEPENDENCY_DISABLED:${dependency.extensionId}`);
      }
    }
  }

  private requireState(extensionId: string): ExtensionState {
    const state = this.states.get(extensionId);
    if (!state) throw new Error(`EXTENSION_NOT_FOUND:${extensionId}`);
    return state;
  }
}

function manifestContributionEntries(
  manifest: ExtensionManifest,
): readonly ExtensionContributionEntry[] {
  const contributions: ExtensionContributionEntry[] = [];
  const grouped = manifest.contributions;

  for (const element of grouped?.builder?.elements ?? []) {
    contributions.push({
      type: 'builder.element',
      id: element.id,
      label: element.label,
      capability: element.capability,
      nodeType: element.nodeType,
      propertyKeys: element.propertyKeys,
      allowedParents: [],
      permissions: [],
    });
  }
  for (const block of grouped?.builder?.blocks ?? []) {
    contributions.push({
      type: 'builder.block',
      id: block.id,
      label: block.label,
      elementIds: block.elementIds,
      permissions: [],
    });
  }
  for (const action of grouped?.builder?.actions ?? []) {
    contributions.push({
      type: 'builder.action',
      id: action.id,
      label: action.label,
      capability: action.capability,
      inputKeys: [],
      permissions: [],
    });
  }
  for (const binding of [
    ...(grouped?.builder?.dataBindings ?? []),
    ...(grouped?.data?.variables ?? []),
  ]) {
    contributions.push({
      type: 'data.variable',
      id: binding.id,
      label: binding.label,
      path: binding.path,
      valueType: 'object',
      permissions: [],
    });
  }
  for (const processor of grouped?.forms?.processors ?? []) {
    contributions.push({
      type: 'form.processor',
      id: processor,
      label: processor,
      inputKeys: [],
      permissions: [],
    });
  }
  for (const runtimeId of grouped?.renderer?.runtimeIds ?? []) {
    contributions.push({
      type: 'renderer.component',
      id: runtimeId,
      label: runtimeId,
      runtimeId,
      styleAssetIds: grouped?.renderer?.styleAssetIds ?? [],
      permissions: [],
    });
  }
  for (const assetId of grouped?.renderer?.styleAssetIds ?? []) {
    contributions.push({
      type: 'runtime.asset',
      id: assetId,
      label: assetId,
      assetId,
      kind: 'style',
      permissions: [],
    });
  }
  for (const validator of grouped?.publishing?.validations ?? []) {
    contributions.push({
      type: 'publish.validator',
      id: validator,
      label: validator,
      errorCode: validator,
      permissions: [],
    });
  }
  for (const trigger of grouped?.automation?.triggers ?? []) {
    contributions.push({
      type: 'trigger',
      id: trigger,
      label: trigger,
      permissions: [],
    });
  }
  for (const condition of grouped?.automation?.conditions ?? []) {
    contributions.push({
      type: 'condition',
      id: condition,
      label: condition,
      permissions: [],
    });
  }
  for (const action of grouped?.automation?.actions ?? []) {
    contributions.push({
      type: 'action',
      id: action,
      label: action,
      permissions: [],
    });
  }
  for (const panel of grouped?.cms?.panels ?? []) {
    contributions.push({
      type: 'cms.panel',
      id: panel,
      label: panel,
      permissions: [],
    });
  }
  return contributions;
}

function satisfiesVersion(version: string, range: string): boolean {
  const parsed = parseVersion(version);
  if (!parsed) return false;
  const normalized = range.trim();
  if (normalized === '*' || normalized === '') return true;
  const match = /^(\^|>=|=)?(\d+)\.(\d+)\.(\d+)/.exec(normalized);
  if (!match) return false;
  const minimum = [Number(match[2]), Number(match[3]), Number(match[4])] as const;
  const comparison = compareVersion(parsed, minimum);
  if (match[1] === '>=') return comparison >= 0;
  if (match[1] === '^') return parsed[0] === minimum[0] && comparison >= 0;
  return comparison === 0;
}

function parseVersion(value: string): readonly [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

function compareVersion(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}
