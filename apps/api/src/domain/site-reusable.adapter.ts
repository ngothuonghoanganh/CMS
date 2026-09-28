import { Inject, Injectable } from '@nestjs/common';
import type { DesignTokenUsageResponse, SiteDesignSystem } from '@payload/contracts';

import { SITE_REUSABLE_PORT, type SiteReusablePort } from '../shared/site-reusable-port';
import { ReusableService } from './reusable.service';

/** Composition-root adapter from the reusable platform service to the site port. */
@Injectable()
export class SiteReusableAdapter implements SiteReusablePort {
  constructor(@Inject(ReusableService) private readonly reusables: ReusableService) {}

  assertDesignTokenDependenciesAvailable(
    workspaceId: string,
    siteId: string,
    designSystem: SiteDesignSystem,
  ): Promise<void> {
    return this.reusables.assertDesignTokenDependenciesAvailable(
      workspaceId,
      siteId,
      designSystem,
    );
  }

  assertDesignTokenRemovalSafe(
    workspaceId: string,
    siteId: string,
    nextDesignSystem: SiteDesignSystem,
  ): Promise<void> {
    return this.reusables.assertDesignTokenRemovalSafe(
      workspaceId,
      siteId,
      nextDesignSystem,
    );
  }

  getDesignTokenUsage(
    workspaceId: string,
    siteId: string,
    tokenId: string,
  ): Promise<DesignTokenUsageResponse> {
    return this.reusables.getDesignTokenUsage(workspaceId, siteId, tokenId);
  }

  publishReferencedForSite(workspaceId: string, siteId: string): Promise<void> {
    return this.reusables.publishReferencedForSite(workspaceId, siteId);
  }
}

export const SITE_REUSABLE_PORT_PROVIDER = {
  provide: SITE_REUSABLE_PORT,
  useExisting: SiteReusableAdapter,
} as const;
