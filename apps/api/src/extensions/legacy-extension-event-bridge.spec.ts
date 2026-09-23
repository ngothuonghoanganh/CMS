import { describe, expect, it } from 'vitest';

import { TenantContext } from '../tenancy/tenant-context';
import { CoreEventBus } from '../shared/events/core-event-bus';
import { EventBus } from './event-bus';
import { LegacyExtensionEventBridge } from './legacy-extension-event-bridge';

function createTenantContext(): TenantContext {
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
  return tenantContext;
}

describe('LegacyExtensionEventBridge', () => {
  it('forwards core events to legacy extension subscribers', async () => {
    const tenantContext = createTenantContext();
    const coreEvents = new CoreEventBus(tenantContext);
    const extensionEvents = new EventBus(tenantContext);
    const bridge = new LegacyExtensionEventBridge(coreEvents, extensionEvents);
    const received: string[] = [];

    extensionEvents.subscribe('page.created', (event) => {
      received.push(`${event.pageId}:${event.siteId}`);
    });
    bridge.onModuleInit();

    await coreEvents.publish('page.created', {
      tenantId: 'tenant-a',
      pageId: 'page-1',
      workspaceId: 'workspace-1',
      siteId: 'site-1',
      occurredAt: new Date().toISOString(),
    });

    expect(received).toEqual(['page-1:site-1']);
    bridge.onModuleDestroy();
  });

  it('keeps core publishing successful when a legacy subscriber throws', async () => {
    const tenantContext = createTenantContext();
    const coreEvents = new CoreEventBus(tenantContext);
    const extensionEvents = new EventBus(tenantContext);
    const bridge = new LegacyExtensionEventBridge(coreEvents, extensionEvents);
    let received = 0;

    extensionEvents.subscribe('page.published', () => {
      throw new Error('legacy subscriber failed');
    });
    extensionEvents.subscribe('page.published', () => {
      received += 1;
    });
    bridge.onModuleInit();

    await expect(
      coreEvents.publish('page.published', {
        tenantId: 'tenant-a',
        pageId: 'page-1',
        workspaceId: 'workspace-1',
        versionNumber: 3,
        occurredAt: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();
    expect(received).toBe(1);
    bridge.onModuleDestroy();
  });
});
