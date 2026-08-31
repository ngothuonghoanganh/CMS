import { describe, expect, it } from 'vitest';
import type { Model } from 'mongoose';
import { PagePayloadV3Schema } from '@payload/contracts';

import type { PageRecord } from '../persistence/schemas/page.schema';
import type { PageExtensionInstanceRecord } from '../persistence/schemas/page-extension-instance.schema';
import type { TenantExtensionRecord } from '../persistence/schemas/tenant-extension.schema';
import { CapabilityRegistry } from './capability-registry';
import { demoBuilderExtension } from './demo-extensions';
import { EventBus } from './event-bus';
import { ExtensionRegistry } from './extension-registry';
import { PageExtensionService } from './page-extension.service';
import { TenantContext } from '../tenancy/tenant-context';

const pageId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';

type StoredInstance = PageExtensionInstanceRecord & {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
};

class PageExtensionStore {
  readonly records = new Map<string, StoredInstance>();

  find(filter: Record<string, unknown>) {
    const values = [...this.records.values()].filter((record) =>
      Object.entries(filter).every(
        ([key, value]) => record[key as keyof StoredInstance] === value,
      ),
    );
    const chain = {
      sort: () => chain,
      exec: async () => values,
    };
    return chain;
  }

  findOne(filter: { pageId: string; workspaceId: string; extensionId: string }) {
    return {
      exec: async () =>
        [...this.records.values()].find(
          (record) =>
            record.pageId === filter.pageId &&
            record.workspaceId === filter.workspaceId &&
            record.extensionId === filter.extensionId,
        ),
    };
  }

  findOneAndUpdate(
    filter: { pageId: string; workspaceId: string; extensionId: string },
    update: { $set?: Partial<StoredInstance>; $setOnInsert?: Partial<StoredInstance> },
  ) {
    return {
      exec: async () => {
        const now = new Date();
        const key = `${filter.pageId}:${filter.extensionId}`;
        const record =
          this.records.get(key) ??
          ({
            _id: `instance-${key}`,
            ...filter,
            enabled: true,
            configuration: {},
            capabilities: [],
            runtimeIds: [],
            createdAt: now,
            updatedAt: now,
            ...update.$setOnInsert,
          } as StoredInstance);
        Object.assign(record, update.$set, { updatedAt: now });
        this.records.set(key, record);
        return record;
      },
    };
  }

  deleteOne(filter: { pageId: string; workspaceId: string; extensionId: string }) {
    return {
      exec: async () => {
        this.records.delete(`${filter.pageId}:${filter.extensionId}`);
      },
    };
  }

  deleteMany(filter: { pageId: string; workspaceId: string }) {
    return {
      exec: async () => {
        for (const [key, record] of this.records) {
          if (
            record.pageId === filter.pageId &&
            record.workspaceId === filter.workspaceId
          ) {
            this.records.delete(key);
          }
        }
      },
    };
  }
}

class PageStore {
  findOne() {
    return {
      exec: async () => ({ _id: pageId, workspaceId, siteId: 'site' }),
    };
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
});
