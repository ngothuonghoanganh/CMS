import { describe, expect, it } from 'vitest';

import { TenantContext } from '../tenancy/tenant-context';
import { EventBus } from './event-bus';
import { LegacyExtensionEventPublisherAdapter } from './legacy-extension-event-publisher.adapter';

describe('LegacyExtensionEventPublisherAdapter', () => {
  it('keeps optional subscriber failures isolated behind the core event port', async () => {
    const tenantContext = new TenantContext();
    tenantContext.enter({
      id: 'tenant-a',
      slug: 'tenant-a',
      name: 'Tenant A',
      status: 'active',
      databaseKey: 'mongo:tenant-a',
      databaseName: 'tenant-a',
      schemaVersion: 1,
    });
    const eventBus = new EventBus(tenantContext);
    let received = 0;
    eventBus.subscribe('workspace.created', () => {
      throw new Error('optional extension failed');
    });
    eventBus.subscribe('workspace.created', () => {
      received += 1;
    });

    const publisher = new LegacyExtensionEventPublisherAdapter(eventBus);

    await expect(
      publisher.publish('workspace.created', {
        tenantId: 'tenant-a',
        workspaceId: 'workspace-1',
        occurredAt: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();
    expect(received).toBe(1);
  });
});
