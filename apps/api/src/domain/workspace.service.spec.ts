import { describe, expect, it, vi } from 'vitest';
import type { Model } from 'mongoose';

import { TenantContext } from '../tenancy/tenant-context';
import type { CoreEventPublisher } from '../shared/events/core-event-publisher';
import { WorkspaceService } from './workspace.service';
import type { WorkspaceRecord } from '../persistence/schemas/workspace.schema';

const tenantId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';

function createTenantContext(): TenantContext {
  const context = new TenantContext();
  context.enter({
    id: tenantId,
    slug: 'tenant-a',
    name: 'Tenant A',
    status: 'active',
    databaseKey: 'mongo:tenant-a',
    databaseName: 'tenant-a',
    schemaVersion: 1,
  });
  return context;
}

describe('WorkspaceService core boundary', () => {
  it('persists a workspace and publishes its core event without quota services', async () => {
    const now = new Date('2026-09-23T00:00:00.000Z');
    const record = {
      _id: { toString: () => workspaceId },
      name: 'Workspace A',
      createdAt: now,
      updatedAt: now,
    };
    const workspaceModel = {
      create: vi.fn().mockResolvedValue(record),
    } as unknown as Model<WorkspaceRecord>;
    const events: CoreEventPublisher = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    const service = new WorkspaceService(workspaceModel, createTenantContext(), events);

    const result = await service.create({ name: 'Workspace A' }, tenantId);

    expect(result).toMatchObject({
      id: workspaceId,
      organizationId: tenantId,
      name: 'Workspace A',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(workspaceModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ _id: expect.any(String), name: 'Workspace A' }),
    );
    expect(events.publish).toHaveBeenCalledWith('workspace.created', {
      tenantId,
      workspaceId,
      occurredAt: expect.any(String),
    });
  });
});
