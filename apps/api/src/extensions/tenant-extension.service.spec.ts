import { describe, expect, it } from 'vitest';
import type { Model } from 'mongoose';

import type { TenantExtensionRecord } from '../persistence/schemas/tenant-extension.schema';
import type { CustomExtensionDefinition } from '@payload/contracts';
import { TenantContext, type TenantScope } from '../tenancy/tenant-context';
import { CapabilityRegistry } from './capability-registry';
import {
  DemoAnalyticsExtension,
  DemoWebhookExtension,
  demoBuilderExtension,
} from './demo-extensions';
import { EventBus } from './event-bus';
import { ExtensionRegistry } from './extension-registry';
import { TenantExtensionService } from './tenant-extension.service';

type StoredExtension = {
  _id: string;
  extensionId: string;
  enabled: boolean;
  status: 'enabled' | 'disabled' | 'misconfigured';
  configuration: Record<string, string | boolean | number>;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
};

class TenantExtensionStore {
  private readonly records = new Map<string, Map<string, StoredExtension>>();

  constructor(private readonly tenantContext: TenantContext) {}

  find(filter: Record<string, unknown> = {}) {
    const values = [...this.current().values()].filter((record) =>
      Object.entries(filter).every(
        ([key, value]) => record[key as keyof StoredExtension] === value,
      ),
    );
    const chain = {
      sort: () => chain,
      select: () => chain,
      exec: async () => values,
    };
    return chain;
  }

  findOne(filter: { extensionId: string }) {
    return { exec: async () => this.current().get(filter.extensionId) };
  }

  findOneAndUpdate(
    filter: { extensionId: string },
    update: {
      $set?: Partial<StoredExtension>;
      $setOnInsert?: Partial<StoredExtension>;
    },
    options: { upsert?: boolean },
  ) {
    return {
      exec: async () => {
        const map = this.current();
        let record = map.get(filter.extensionId);
        if (!record && !options.upsert) return undefined;
        if (!record) {
          const now = new Date();
          record = {
            _id: `${this.tenantContext.require().id}:${filter.extensionId}`,
            extensionId: filter.extensionId,
            enabled: false,
            status: 'disabled',
            configuration: {},
            createdAt: now,
            updatedAt: now,
            ...update.$setOnInsert,
          };
          map.set(filter.extensionId, record);
        }
        Object.assign(record, update.$set, { updatedAt: new Date() });
        return record;
      },
    };
  }

  snapshot(tenantId: string): StoredExtension | undefined {
    return this.records.get(tenantId)?.get('demo-webhook');
  }

  private current(): Map<string, StoredExtension> {
    const tenantId = this.tenantContext.require().id;
    let records = this.records.get(tenantId);
    if (!records) {
      records = new Map();
      this.records.set(tenantId, records);
    }
    return records;
  }
}

function scope(id: string): TenantScope {
  return {
    id,
    slug: id,
    name: id,
    status: 'active',
    databaseKey: `mongo:${id}`,
    databaseName: id,
    schemaVersion: 1,
  };
}

describe('TenantExtensionService', () => {
  it('keeps enablement and configuration isolated by tenant context', async () => {
    const tenantContext = new TenantContext();
    const events = new EventBus(tenantContext);
    const registry = new ExtensionRegistry(
      [demoBuilderExtension, new DemoAnalyticsExtension(), new DemoWebhookExtension()],
      new CapabilityRegistry(),
      events,
    );
    await registry.onModuleInit();
    const store = new TenantExtensionStore(tenantContext);
    const service = new TenantExtensionService(
      store as unknown as Model<TenantExtensionRecord>,
      registry,
      tenantContext,
      events,
    );

    await tenantContext.run(scope('tenant-a'), async () => {
      const descriptor = await service.enable('demo-webhook', {
        endpoint: 'https://tenant-a.example/webhook',
      });
      expect(descriptor.tenantEnabled).toBe(true);
      expect(descriptor.configuredFields).toEqual(['endpoint']);
    });

    await tenantContext.run(scope('tenant-b'), async () => {
      const descriptor = await service.get('demo-webhook');
      expect(descriptor.tenantEnabled).toBe(false);
      expect(descriptor.configuredFields).toEqual([]);
    });

    await tenantContext.run(scope('tenant-a'), async () => {
      expect(store.snapshot('tenant-a')?.configuration.endpoint).toBe(
        'https://tenant-a.example/webhook',
      );
    });
    expect(store.snapshot('tenant-b')).toBeUndefined();
  });

  it('supports tenant-scoped CRUD for declarative custom extensions', async () => {
    type CustomRecord = {
      _id: string;
      extensionId: string;
      enabled: boolean;
      status: 'enabled' | 'disabled' | 'misconfigured';
      configuration: Record<string, string | boolean | number>;
      definition?: CustomExtensionDefinition;
      createdAt: Date;
      updatedAt: Date;
      set: (key: string, value: unknown) => void;
      save: () => Promise<CustomRecord>;
    };

    class CustomExtensionStore {
      private readonly records = new Map<string, CustomRecord>();

      find() {
        const chain = {
          sort: () => chain,
          select: () => chain,
          exec: async () => [...this.records.values()],
        };
        return chain;
      }

      findOne(filter: { extensionId: string }) {
        return { exec: async () => this.records.get(filter.extensionId) };
      }

      findOneAndUpdate(
        filter: { extensionId: string },
        update: {
          $set?: Partial<CustomRecord>;
          $setOnInsert?: Partial<CustomRecord>;
        },
      ) {
        return {
          exec: async () => {
            let record = this.records.get(filter.extensionId);
            if (!record) {
              const now = new Date();
              record = {
                _id: `custom-${filter.extensionId}`,
                extensionId: filter.extensionId,
                enabled: false,
                status: 'disabled',
                configuration: {},
                createdAt: now,
                updatedAt: now,
                set(key: string, value: unknown) {
                  (this as unknown as Record<string, unknown>)[key] = value;
                },
                async save() {
                  this.updatedAt = new Date();
                  return this;
                },
                ...update.$setOnInsert,
              } as CustomRecord;
              this.records.set(filter.extensionId, record);
            }
            Object.assign(record, update.$set, { updatedAt: new Date() });
            return record;
          },
        };
      }

      async create(
        input: Omit<CustomRecord, 'createdAt' | 'updatedAt' | 'set' | 'save'>,
      ) {
        const now = new Date();
        const record = {
          ...input,
          createdAt: now,
          updatedAt: now,
          set(key: string, value: unknown) {
            (this as unknown as Record<string, unknown>)[key] = value;
          },
          async save() {
            this.updatedAt = new Date();
            return this;
          },
        } as CustomRecord;
        this.records.set(record.extensionId, record);
        return record;
      }

      deleteOne(filter: { extensionId: string }) {
        return {
          exec: async () => {
            this.records.delete(filter.extensionId);
          },
        };
      }
    }

    const tenantContext = new TenantContext();
    const events = new EventBus(tenantContext);
    const registry = new ExtensionRegistry(
      [demoBuilderExtension],
      new CapabilityRegistry(),
      events,
    );
    await registry.onModuleInit();
    const store = new CustomExtensionStore();
    const service = new TenantExtensionService(
      store as unknown as Model<TenantExtensionRecord>,
      registry,
      tenantContext,
      events,
    );

    await tenantContext.run(scope('custom-tenant'), async () => {
      const created = await service.createCustom({
        id: 'custom-launch',
        name: 'Launch banner',
        description: 'Reusable campaign banner',
        render: {
          kind: 'banner',
          heading: 'Launch now',
          body: 'Ship it',
          buttonLabel: 'Learn more',
          buttonHref: '/learn',
          accentColor: '#8cf0c5',
        },
      });
      expect(created.custom?.id).toBe('custom-launch');
      expect(created.tenantEnabled).toBe(false);

      const updated = await service.updateCustom('custom-launch', {
        name: 'Updated launch banner',
        render: {
          kind: 'banner',
          heading: 'Updated launch',
          body: '',
          buttonLabel: '',
          buttonHref: '',
          accentColor: '#ffcc66',
        },
      });
      expect(updated.custom?.name).toBe('Updated launch banner');
      expect(updated.custom?.render.accentColor).toBe('#ffcc66');

      const enabled = await service.enable('custom-launch');
      expect(enabled.tenantEnabled).toBe(true);
      expect((await service.list()).items.map((item) => item.manifest.id)).toContain(
        'custom-launch',
      );

      await service.removeCustom('custom-launch');
      await expect(service.get('custom-launch')).rejects.toMatchObject({
        response: { code: 'EXTENSION_NOT_FOUND' },
      });
    });
  });
});
