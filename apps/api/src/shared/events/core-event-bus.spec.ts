import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { TenantContext } from '../../tenancy/tenant-context';
import { CORE_EVENT_PUBLISHER, type CoreEventPublisher } from './core-event-publisher';
import { CoreEventBus } from './core-event-bus';
import { CoreEventsModule } from './core-events.module';

const tenantId = 'tenant-a';

function createTenantContext(): TenantContext {
  const tenantContext = new TenantContext();
  tenantContext.enter({
    id: tenantId,
    slug: tenantId,
    name: 'Tenant A',
    status: 'active',
    databaseKey: `mongo:${tenantId}`,
    databaseName: tenantId,
    schemaVersion: 1,
  });
  return tenantContext;
}

describe('CoreEventsModule', () => {
  it('resolves the core publisher without ExtensionModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CoreEventsModule],
    }).compile();

    const publisher = moduleRef.get<CoreEventPublisher>(CORE_EVENT_PUBLISHER);

    expect(publisher).toBeInstanceOf(CoreEventBus);
    await expect(
      publisher.publish('workspace.created', {
        tenantId,
        workspaceId: 'workspace-1',
        occurredAt: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();

    await moduleRef.close();
  });

  it('publishes workspace and page events through core-owned infrastructure', async () => {
    const coreEvents = new CoreEventBus(createTenantContext());
    const received: string[] = [];

    coreEvents.subscribe('workspace.created', (event) => {
      received.push(`${event.workspaceId}:workspace`);
    });
    coreEvents.subscribe('page.created', (event) => {
      received.push(`${event.pageId}:created:${event.siteId}`);
    });
    coreEvents.subscribe('page.updated', (event) => {
      received.push(`${event.pageId}:updated:${event.versionNumber}`);
    });
    coreEvents.subscribe('page.published', (event) => {
      received.push(`${event.pageId}:published:${event.versionNumber}`);
    });

    await coreEvents.publish('workspace.created', {
      tenantId,
      workspaceId: 'workspace-1',
      occurredAt: new Date().toISOString(),
    });
    await coreEvents.publish('page.created', {
      tenantId,
      pageId: 'page-1',
      workspaceId: 'workspace-1',
      siteId: 'site-1',
      occurredAt: new Date().toISOString(),
    });
    await coreEvents.publish('page.updated', {
      tenantId,
      pageId: 'page-1',
      workspaceId: 'workspace-1',
      versionNumber: 2,
      occurredAt: new Date().toISOString(),
    });
    await coreEvents.publish('page.published', {
      tenantId,
      pageId: 'page-1',
      workspaceId: 'workspace-1',
      versionNumber: 2,
      occurredAt: new Date().toISOString(),
    });

    expect(received).toEqual([
      'workspace-1:workspace',
      'page-1:created:site-1',
      'page-1:updated:2',
      'page-1:published:2',
    ]);
  });

  it('isolates an optional subscriber failure from core publishing', async () => {
    const coreEvents = new CoreEventBus(createTenantContext());
    let received = 0;
    coreEvents.subscribe('page.created', () => {
      throw new Error('optional subscriber failed');
    });
    coreEvents.subscribe('page.created', () => {
      received += 1;
    });

    await expect(
      coreEvents.publish('page.created', {
        tenantId,
        pageId: 'page-1',
        workspaceId: 'workspace-1',
        siteId: 'site-1',
        occurredAt: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();
    expect(received).toBe(1);
  });

  it('rejects events whose tenant does not match the authoritative context', async () => {
    const coreEvents = new CoreEventBus(createTenantContext());

    await expect(
      coreEvents.publish('workspace.created', {
        tenantId: 'tenant-b',
        workspaceId: 'workspace-1',
        occurredAt: new Date().toISOString(),
      }),
    ).rejects.toThrow('EVENT_TENANT_CONTEXT_MISMATCH');
  });
});
