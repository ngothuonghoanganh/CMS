import { describe, expect, it, vi } from 'vitest';

import { OrganizationService } from './organization.service';

describe('OrganizationService workspace compatibility', () => {
  it('delegates legacy workspace creation to the canonical WorkspaceService operation', async () => {
    const workspace = {
      id: 'workspace-1',
      organizationId: 'tenant-1',
      name: 'Legacy workspace',
      createdAt: '2026-09-24T00:00:00.000Z',
      updatedAt: '2026-09-24T00:00:00.000Z',
    };
    const workspaceService = {
      create: vi.fn().mockResolvedValue(workspace),
    };
    const service = Object.create(OrganizationService.prototype) as OrganizationService;
    const state = service as unknown as Record<string, unknown>;
    state.requirePermission = vi.fn().mockResolvedValue(undefined);
    state.inTenant = vi.fn((_tenantId: string, work: () => Promise<unknown>) => work());
    state.workspaceService = workspaceService;

    await expect(
      service.createWorkspace('owner@example.com', 'tenant-1', {
        name: 'Legacy workspace',
      }),
    ).resolves.toEqual(workspace);

    expect(state.requirePermission).toHaveBeenCalledWith(
      'owner@example.com',
      'tenant-1',
      'workspace.create',
    );
    expect(state.inTenant).toHaveBeenCalledWith('tenant-1', expect.any(Function));
    expect(workspaceService.create).toHaveBeenCalledWith(
      { name: 'Legacy workspace' },
      'tenant-1',
    );
  });
});
