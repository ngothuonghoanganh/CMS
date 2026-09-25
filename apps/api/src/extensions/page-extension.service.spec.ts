import { describe, expect, it, vi } from 'vitest';
import type { Model } from 'mongoose';
import {
  ExtensionIds,
  PageCompositionSchema,
  PagePayloadV3Schema,
  type SiteGlobalPayloadV1,
} from '@payload/contracts';

import type { PageRecord } from '../persistence/schemas/page.schema';
import type { PageExtensionInstanceRecord } from '../persistence/schemas/page-extension-instance.schema';
import type { TenantExtensionRecord } from '../persistence/schemas/tenant-extension.schema';
import { CapabilityRegistry } from './capability-registry';
import { demoBuilderExtension } from './demo-extensions';
import { EventBus } from './event-bus';
import { ExtensionRegistry } from './extension-registry';
import { PageExtensionService } from './page-extension.service';
import { TenantContext } from '../tenancy/tenant-context';
import { platformLogger } from '../common/logging/platform-logger';

const pageId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';

type StoredInstance = PageExtensionInstanceRecord & {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function matchesFilter(record: StoredInstance, filter: Record<string, unknown>) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = record[key as keyof StoredInstance];
    if (!isRecord(expected)) return actual === expected;
    if ('$exists' in expected) return (actual !== undefined) === expected.$exists;
    if ('$ne' in expected) return actual !== expected.$ne;
    if ('$nin' in expected && Array.isArray(expected.$nin)) {
      return !expected.$nin.includes(actual);
    }
    return actual === expected;
  });
}

class PageExtensionStore {
  readonly records = new Map<string, StoredInstance>();
  failNextUpdate = false;
  afterUpdate?: (record: StoredInstance) => void;

  find(filter: Record<string, unknown>) {
    const values = [...this.records.values()].filter((record) =>
      matchesFilter(record, filter),
    );
    const chain = {
      sort: () => chain,
      exec: async () => values,
    };
    return chain;
  }

  findOne(filter: Record<string, unknown>) {
    return {
      exec: async () =>
        [...this.records.values()].find((record) => matchesFilter(record, filter)),
    };
  }

  findOneAndUpdate(
    filter: Record<string, unknown>,
    update: {
      $set?: Record<string, unknown>;
      $unset?: Record<string, unknown>;
      $setOnInsert?: Record<string, unknown>;
    },
    options: { upsert?: boolean } = {},
  ) {
    return {
      exec: async () => {
        if (this.failNextUpdate) {
          this.failNextUpdate = false;
          throw new Error('injected projection write failure');
        }
        const now = new Date();
        const key = `${String(filter.pageId)}:${String(filter.extensionId)}`;
        const existing = [...this.records.values()].find((record) =>
          matchesFilter(record, filter),
        );
        if (!existing && !options.upsert) return undefined;
        const record =
          existing ??
          ({
            _id: `instance-${key}`,
            pageId: String(filter.pageId),
            workspaceId: String(filter.workspaceId),
            extensionId: String(filter.extensionId),
            enabled: true,
            configuration: {},
            capabilities: [],
            runtimeIds: [],
            createdAt: now,
            updatedAt: now,
            ...update.$setOnInsert,
          } as StoredInstance);
        Object.assign(record, update.$set, { updatedAt: now });
        for (const keyToUnset of Object.keys(update.$unset ?? {})) {
          delete record[keyToUnset as keyof StoredInstance];
        }
        this.records.set(key, record);
        this.afterUpdate?.(record);
        return record;
      },
    };
  }

  deleteOne(filter: Record<string, unknown>) {
    return {
      exec: async () => {
        const record = [...this.records.values()].find((candidate) =>
          matchesFilter(candidate, filter),
        );
        if (record) this.records.delete(`${record.pageId}:${record.extensionId}`);
        return { deletedCount: record ? 1 : 0 };
      },
    };
  }

  deleteMany(filter: Record<string, unknown>) {
    return {
      exec: async () => {
        for (const [key, record] of this.records) {
          if (matchesFilter(record, filter)) {
            this.records.delete(key);
          }
        }
      },
    };
  }
}

class PageStore {
  currentDraftVersionId = 'draft-a';

  findOne(filter: Record<string, unknown>) {
    const page =
      filter.currentDraftVersionId !== undefined &&
      filter.currentDraftVersionId !== this.currentDraftVersionId
        ? undefined
        : { _id: pageId, workspaceId, siteId: 'site' };
    const chain = {
      select: () => chain,
      exec: async () => page,
    };
    return chain;
  }
}

class TenantExtensionStore {
  enabled = true;

  find(filter: { enabled: boolean }) {
    const records =
      filter.enabled && this.enabled
        ? [{ extensionId: demoBuilderExtension.manifest.id }]
        : [];
    const chain = {
      select: () => chain,
      exec: async () => records,
    };
    return chain;
  }

  findOne() {
    return { exec: async () => (this.enabled ? { enabled: true } : undefined) };
  }

  exists() {
    return Promise.resolve(this.enabled);
  }
}

class CustomTenantExtensionStore {
  private readonly definition = {
    id: 'custom-launch',
    name: 'Launch banner',
    version: '1.0.0',
    render: {
      kind: 'banner' as const,
      heading: 'Launch now',
      body: 'Ship it',
      buttonLabel: 'Learn more',
      buttonHref: '/learn',
      accentColor: '#8cf0c5',
    },
  };

  find() {
    const chain = {
      sort: () => chain,
      select: () => chain,
      exec: async () => [{ extensionId: 'custom-launch', enabled: true }],
    };
    return chain;
  }

  findOne(filter: { extensionId: string }) {
    const chain = {
      select: () => chain,
      exec: async () =>
        filter.extensionId === 'custom-launch'
          ? { extensionId: 'custom-launch', enabled: true, definition: this.definition }
          : undefined,
    };
    return chain;
  }

  exists() {
    return Promise.resolve(true);
  }
}

describe('PageExtensionService', () => {
  it('attaches a page instance, resolves its graph and enforces tenant enablement', async () => {
    const tenantContext = new TenantContext();
    const registry = new ExtensionRegistry(
      [demoBuilderExtension],
      new CapabilityRegistry(),
      new EventBus(tenantContext),
    );
    await registry.onModuleInit();
    const instances = new PageExtensionStore();
    const tenants = new TenantExtensionStore();
    const service = new PageExtensionService(
      instances as unknown as Model<PageExtensionInstanceRecord>,
      new PageStore() as unknown as Model<PageRecord>,
      tenants as unknown as Model<TenantExtensionRecord>,
      registry,
    );

    const instance = await service.upsert(
      pageId,
      demoBuilderExtension.manifest.id,
      { enabled: true },
      workspaceId,
    );
    expect(instance.runtimeIds).toEqual(['countdown.runtime']);

    const graph = await service.resolveCapabilities(pageId, workspaceId);
    expect(graph).toMatchObject({
      pageId,
      extensionIds: ['demo-builder-countdown'],
      runtimeIds: ['countdown.runtime'],
    });

    const payload = PagePayloadV3Schema.parse({
      version: 3,
      metadata: { documentTitle: 'Page' },
      root: {
        id: 'root',
        type: 'root',
        props: {},
        children: [
          {
            id: 'section',
            type: 'section',
            props: {},
            children: [
              {
                id: 'countdown',
                type: 'countdown',
                props: { label: 'Launch', targetAt: '2030-01-01T00:00:00.000Z' },
                children: [],
              },
            ],
          },
        ],
      },
    });
    await expect(
      service.validateBeforePublish(pageId, workspaceId, payload),
    ).resolves.toBeUndefined();

    tenants.enabled = false;
    await expect(
      service.upsert(
        pageId,
        demoBuilderExtension.manifest.id,
        { enabled: true },
        workspaceId,
      ),
    ).rejects.toMatchObject({ response: { code: 'TENANT_EXTENSION_DISABLED' } });
  });

  it('cascades every extension instance when a page is deleted', async () => {
    const tenantContext = new TenantContext();
    const registry = new ExtensionRegistry(
      [demoBuilderExtension],
      new CapabilityRegistry(),
      new EventBus(tenantContext),
    );
    await registry.onModuleInit();
    const instances = new PageExtensionStore();
    const service = new PageExtensionService(
      instances as unknown as Model<PageExtensionInstanceRecord>,
      new PageStore() as unknown as Model<PageRecord>,
      new TenantExtensionStore() as unknown as Model<TenantExtensionRecord>,
      registry,
    );

    await service.upsert(
      pageId,
      demoBuilderExtension.manifest.id,
      { enabled: true },
      workspaceId,
    );
    instances.records.set(`other-page:${demoBuilderExtension.manifest.id}`, {
      _id: 'other',
      pageId: 'other-page',
      workspaceId,
      extensionId: demoBuilderExtension.manifest.id,
      enabled: true,
      configuration: {},
      capabilities: [],
      runtimeIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.removeAllForPage(pageId, workspaceId);

    expect([...instances.records.values()].map((record) => record.pageId)).toEqual([
      'other-page',
    ]);
  });

  it('attaches and resolves a custom extension without invoking the code registry', async () => {
    const tenantContext = new TenantContext();
    const registry = new ExtensionRegistry(
      [demoBuilderExtension],
      new CapabilityRegistry(),
      new EventBus(tenantContext),
    );
    await registry.onModuleInit();
    const service = new PageExtensionService(
      new PageExtensionStore() as unknown as Model<PageExtensionInstanceRecord>,
      new PageStore() as unknown as Model<PageRecord>,
      new CustomTenantExtensionStore() as unknown as Model<TenantExtensionRecord>,
      registry,
    );

    const instance = await service.upsert(
      pageId,
      'custom-launch',
      { enabled: true },
      workspaceId,
    );
    expect(instance.extensionId).toBe('custom-launch');
    expect(instance.capabilities).toEqual(['custom.banner']);

    await expect(service.resolveRuntime(pageId, workspaceId)).resolves.toEqual([
      expect.objectContaining({
        extensionId: 'custom-launch',
        custom: expect.objectContaining({ id: 'custom-launch' }),
      }),
    ]);
  });

  it('validates and resolves custom extensions embedded in layout documents', async () => {
    const tenantContext = new TenantContext();
    const registry = new ExtensionRegistry(
      [demoBuilderExtension],
      new CapabilityRegistry(),
      new EventBus(tenantContext),
    );
    await registry.onModuleInit();
    const service = new PageExtensionService(
      new PageExtensionStore() as unknown as Model<PageExtensionInstanceRecord>,
      new PageStore() as unknown as Model<PageRecord>,
      new CustomTenantExtensionStore() as unknown as Model<TenantExtensionRecord>,
      registry,
    );
    const document = {
      version: 1,
      documentKind: 'site-header',
      metadata: { documentTitle: 'Header' },
      root: {
        id: 'root',
        type: 'root',
        props: {},
        children: [
          {
            id: 'header',
            type: 'global-header',
            props: { position: 'static' },
            children: [
              {
                id: 'extension',
                type: 'extension',
                props: { extensionId: 'custom-launch', values: {} },
                children: [],
              },
            ],
          },
        ],
      },
    } as unknown as SiteGlobalPayloadV1;

    await expect(
      service.validateVisualDocumentDependencies(workspaceId, document),
    ).resolves.toBeUndefined();
    await expect(
      service.resolveRuntimeForLayoutDocuments(workspaceId, [document]),
    ).resolves.toEqual([
      expect.objectContaining({
        extensionId: 'custom-launch',
        custom: expect.objectContaining({ id: 'custom-launch' }),
      }),
    ]);
  });

  it('projects saved composition attachments and removes orphaned projections', async () => {
    const tenantContext = new TenantContext();
    const registry = new ExtensionRegistry(
      [demoBuilderExtension],
      new CapabilityRegistry(),
      new EventBus(tenantContext),
    );
    await registry.onModuleInit();
    const instances = new PageExtensionStore();
    const service = new PageExtensionService(
      instances as unknown as Model<PageExtensionInstanceRecord>,
      new PageStore() as unknown as Model<PageRecord>,
      new TenantExtensionStore() as unknown as Model<TenantExtensionRecord>,
      registry,
    );
    const composition = PageCompositionSchema.parse({
      pageId,
      payload: PagePayloadV3Schema.parse({
        version: 3,
        metadata: { documentTitle: 'Composition' },
        root: { id: 'root', type: 'root', props: {}, children: [] },
      }),
      attachments: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          pageId,
          extensionId: ExtensionIds.DemoBuilder,
          enabled: false,
          configuration: {},
          resourceIds: [],
        },
      ],
      layoutAttachments: [],
      bindings: [],
      actions: [],
      resources: [],
    });

    await service.synchronizeComposition(pageId, workspaceId, composition);
    expect(instances.records.get(`${pageId}:${ExtensionIds.DemoBuilder}`)).toMatchObject({
      enabled: false,
    });

    await service.synchronizeComposition(
      pageId,
      workspaceId,
      PageCompositionSchema.parse({
        ...composition,
        attachments: [],
      }),
    );
    expect(instances.records.has(`${pageId}:${ExtensionIds.DemoBuilder}`)).toBe(false);
  });

  it('restores the legacy projection after an injected mid-sync failure', async () => {
    const tenantContext = new TenantContext();
    const registry = new ExtensionRegistry(
      [demoBuilderExtension],
      new CapabilityRegistry(),
      new EventBus(tenantContext),
    );
    await registry.onModuleInit();
    const instances = new PageExtensionStore();
    const orphan = {
      _id: 'orphan-instance',
      workspaceId,
      pageId,
      extensionId: 'orphan-extension',
      enabled: true,
      configuration: { legacy: true },
      capabilities: [],
      runtimeIds: [],
      createdAt: new Date('2026-09-24T00:00:00.000Z'),
      updatedAt: new Date('2026-09-24T00:00:00.000Z'),
    } satisfies StoredInstance;
    instances.records.set(`${pageId}:orphan-extension`, orphan);
    instances.failNextUpdate = true;
    const pages = new PageStore();
    const service = new PageExtensionService(
      instances as unknown as Model<PageExtensionInstanceRecord>,
      pages as unknown as Model<PageRecord>,
      new TenantExtensionStore() as unknown as Model<TenantExtensionRecord>,
      registry,
    );
    const composition = PageCompositionSchema.parse({
      pageId,
      payload: PagePayloadV3Schema.parse({
        version: 3,
        metadata: { documentTitle: 'Failure recovery' },
        root: { id: 'root', type: 'root', props: {}, children: [] },
      }),
      attachments: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          pageId,
          extensionId: ExtensionIds.DemoBuilder,
          enabled: true,
          configuration: {},
          resourceIds: [],
        },
      ],
      layoutAttachments: [],
      bindings: [],
      actions: [],
      resources: [],
    });

    await expect(
      service.synchronizeComposition(pageId, workspaceId, composition, 'draft-a'),
    ).rejects.toThrow('injected projection write failure');

    expect(instances.records.get(`${pageId}:orphan-extension`)).toMatchObject({
      _id: orphan._id,
      pageId,
      workspaceId,
      extensionId: orphan.extensionId,
      enabled: true,
      configuration: { legacy: true },
      capabilities: [],
      runtimeIds: [],
    });
    expect(instances.records.has(`${pageId}:${ExtensionIds.DemoBuilder}`)).toBe(false);
  });

  it('does not clean up a newer concurrent projection during recovery', async () => {
    const tenantContext = new TenantContext();
    const registry = new ExtensionRegistry(
      [demoBuilderExtension],
      new CapabilityRegistry(),
      new EventBus(tenantContext),
    );
    await registry.onModuleInit();
    const instances = new PageExtensionStore();
    const pages = new PageStore();
    instances.afterUpdate = (record) => {
      if (
        record.extensionId === ExtensionIds.DemoBuilder &&
        record.projectionVersionId === 'draft-a'
      ) {
        pages.currentDraftVersionId = 'draft-b';
        record.projectionVersionId = 'draft-b';
        record.configuration = { concurrent: true };
      }
    };
    const service = new PageExtensionService(
      instances as unknown as Model<PageExtensionInstanceRecord>,
      pages as unknown as Model<PageRecord>,
      new TenantExtensionStore() as unknown as Model<TenantExtensionRecord>,
      registry,
    );
    const composition = PageCompositionSchema.parse({
      pageId,
      payload: PagePayloadV3Schema.parse({
        version: 3,
        metadata: { documentTitle: 'Concurrent recovery' },
        root: { id: 'root', type: 'root', props: {}, children: [] },
      }),
      attachments: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          pageId,
          extensionId: ExtensionIds.DemoBuilder,
          enabled: true,
          configuration: {},
          resourceIds: [],
        },
      ],
      layoutAttachments: [],
      bindings: [],
      actions: [],
      resources: [],
    });

    await expect(
      service.synchronizeComposition(pageId, workspaceId, composition, 'draft-a'),
    ).rejects.toMatchObject({ response: { code: 'PAGE_EXTENSION_PROJECTION_CONFLICT' } });

    expect(instances.records.get(`${pageId}:${ExtensionIds.DemoBuilder}`)).toMatchObject({
      projectionVersionId: 'draft-b',
      configuration: { concurrent: true },
    });
  });

  it('keeps after-publish hooks best effort and logs only structured identifiers', async () => {
    const tenantContext = new TenantContext();
    const failingExtension = {
      ...demoBuilderExtension,
      manifest: {
        ...demoBuilderExtension.manifest,
        id: 'demo-after-publish-failure',
      },
      afterPublish: vi.fn().mockRejectedValue(new Error('optional hook failed')),
    };
    const registry = new ExtensionRegistry(
      [failingExtension],
      new CapabilityRegistry(),
      new EventBus(tenantContext),
    );
    await registry.onModuleInit();
    const instances = new PageExtensionStore();
    instances.records.set(`${pageId}:demo-after-publish-failure`, {
      _id: 'after-publish-instance',
      workspaceId,
      pageId,
      extensionId: 'demo-after-publish-failure',
      enabled: true,
      configuration: { secret: 'not logged' },
      capabilities: [],
      runtimeIds: [],
      createdAt: new Date('2026-09-24T00:00:00.000Z'),
      updatedAt: new Date('2026-09-24T00:00:00.000Z'),
    });
    const service = new PageExtensionService(
      instances as unknown as Model<PageExtensionInstanceRecord>,
      new PageStore() as unknown as Model<PageRecord>,
      new TenantExtensionStore() as unknown as Model<TenantExtensionRecord>,
      registry,
    );
    const warning = vi.spyOn(platformLogger, 'warn').mockImplementation(() => undefined);

    await expect(service.afterPublish(pageId, workspaceId, 3)).resolves.toBeUndefined();

    expect(warning).toHaveBeenCalledWith(
      expect.objectContaining({
        extensionId: 'demo-after-publish-failure',
        pageId,
        workspaceId,
        versionNumber: 3,
      }),
      'page extension after-publish hook failed',
    );
    expect(warning.mock.calls[0]?.[0]).not.toHaveProperty('configuration');
    warning.mockRestore();
  });
});
