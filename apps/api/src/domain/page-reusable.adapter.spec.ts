import { createDefaultSiteDesignSystem, PagePayloadSchema } from '@payload/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { ReusableService } from '../modules/reusables/reusable.service';
import { PageReusableAdapter } from './page-reusable.adapter';

describe('PageReusableAdapter', () => {
  it('forwards only the reusable capabilities required by PageService', async () => {
    const reusables = {
      assertDependenciesAvailable: vi.fn().mockResolvedValue(undefined),
      assertDesignTokenDependenciesAvailable: vi.fn().mockResolvedValue(undefined),
      resolveForPayload: vi.fn().mockResolvedValue([]),
    } as unknown as ReusableService;
    const adapter = new PageReusableAdapter(reusables);
    const payload = PagePayloadSchema.parse({
      version: 7,
      metadata: { documentTitle: 'Adapter test' },
      root: { id: 'root', type: 'root', props: {}, children: [] },
    });
    const designSystem = createDefaultSiteDesignSystem();

    await adapter.assertDependenciesAvailable('workspace-1', 'site-1', payload);
    await adapter.assertDesignTokenDependenciesAvailable(
      'workspace-1',
      'site-1',
      designSystem,
      ['value'],
    );
    await expect(
      adapter.resolveForPayload('workspace-1', 'site-1', payload, false),
    ).resolves.toEqual([]);

    expect(reusables.assertDependenciesAvailable).toHaveBeenCalledWith(
      'workspace-1',
      'site-1',
      payload,
    );
    expect(reusables.assertDesignTokenDependenciesAvailable).toHaveBeenCalledWith(
      'workspace-1',
      'site-1',
      designSystem,
      ['value'],
    );
    expect(reusables.resolveForPayload).toHaveBeenCalledWith(
      'workspace-1',
      'site-1',
      payload,
      false,
    );
  });
});
