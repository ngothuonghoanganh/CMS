import {
  createDefaultSiteDesignSystem,
  type DesignTokenUsageResponse,
} from '@payload/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { ReusableService } from './reusable.service';
import { SiteReusableAdapter } from './site-reusable.adapter';

describe('SiteReusableAdapter', () => {
  it('forwards only reusable capabilities required by SiteService', async () => {
    const usage: DesignTokenUsageResponse = {
      tokenId: 'color-brand',
      referenceCount: 0,
      references: [],
    };
    const reusables = {
      assertDesignTokenDependenciesAvailable: vi.fn().mockResolvedValue(undefined),
      assertDesignTokenRemovalSafe: vi.fn().mockResolvedValue(undefined),
      getDesignTokenUsage: vi.fn().mockResolvedValue(usage),
      publishReferencedForSite: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReusableService;
    const adapter = new SiteReusableAdapter(reusables);
    const designSystem = createDefaultSiteDesignSystem();

    await adapter.assertDesignTokenDependenciesAvailable(
      'workspace-1',
      'site-1',
      designSystem,
    );
    await adapter.assertDesignTokenRemovalSafe('workspace-1', 'site-1', designSystem);
    await expect(
      adapter.getDesignTokenUsage('workspace-1', 'site-1', 'color-brand'),
    ).resolves.toEqual(usage);
    await adapter.publishReferencedForSite('workspace-1', 'site-1');

    expect(reusables.assertDesignTokenDependenciesAvailable).toHaveBeenCalledWith(
      'workspace-1',
      'site-1',
      designSystem,
    );
    expect(reusables.assertDesignTokenRemovalSafe).toHaveBeenCalledWith(
      'workspace-1',
      'site-1',
      designSystem,
    );
    expect(reusables.getDesignTokenUsage).toHaveBeenCalledWith(
      'workspace-1',
      'site-1',
      'color-brand',
    );
    expect(reusables.publishReferencedForSite).toHaveBeenCalledWith(
      'workspace-1',
      'site-1',
    );
  });
});
