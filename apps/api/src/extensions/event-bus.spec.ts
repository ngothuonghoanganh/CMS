import { describe, expect, it } from 'vitest';

import { TenantContext } from '../tenancy/tenant-context';
import { EventBus } from './event-bus';

describe('EventBus', () => {
  it('preserves tenant context, fans out subscribers, and isolates failures', async () => {
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
    const bus = new EventBus(tenantContext);
    const received: string[] = [];
    bus.subscribe('page.published', () => {
      throw new Error('optional extension failed');
    });
    bus.subscribe('page.published', (event) => {
      received.push(`${event.tenantId}:${event.pageId}`);
    });
    const unsubscribe = bus.subscribe('page.published', (event) => {
      received.push(event.workspaceId);
    });

    await expect(
      bus.publish('page.published', {
        tenantId: 'tenant-a',
        pageId: 'page-1',
        workspaceId: 'workspace-1',
        versionNumber: 3,
        occurredAt: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();
    expect(received).toEqual(['tenant-a:page-1', 'workspace-1']);

    unsubscribe();
    await bus.publish('page.published', {
      tenantId: 'tenant-a',
      pageId: 'page-2',
      workspaceId: 'workspace-1',
      versionNumber: 4,
      occurredAt: new Date().toISOString(),
    });
    expect(received).toEqual(['tenant-a:page-1', 'workspace-1', 'tenant-a:page-2']);
  });

  it('rejects a tenant mismatch before invoking subscribers', async () => {
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
    const bus = new EventBus(tenantContext);

    await expect(
      bus.publish('lead.created', {
        tenantId: 'tenant-b',
        submissionId: 'submission-1',
        workspaceId: 'workspace-1',
        occurredAt: new Date().toISOString(),
      }),
    ).rejects.toThrow('EVENT_TENANT_CONTEXT_MISMATCH');
  });

  it('does not invoke a tenant-disabled extension subscriber', async () => {
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
    const extensionModel = {
      findOne: () => ({
        select: () => ({ exec: async () => null }),
      }),
    };
    const bus = new EventBus(tenantContext, extensionModel as never);
    let calls = 0;
    bus.subscribe(
      'lead.created',
      () => {
        calls += 1;
      },
      { extensionId: 'demo-analytics' },
    );

    await bus.publish('lead.created', {
      tenantId: 'tenant-a',
      submissionId: 'submission-1',
      workspaceId: 'workspace-1',
      occurredAt: new Date().toISOString(),
    });
    expect(calls).toBe(0);
  });
});
