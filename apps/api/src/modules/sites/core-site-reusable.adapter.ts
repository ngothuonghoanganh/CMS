import { ConflictException, Injectable } from '@nestjs/common';
import type { DesignTokenUsageResponse, SiteDesignSystem } from '@payload/contracts';

import type { SiteReusablePort } from '../../shared/site-reusable-port';

/** Core site policy when the deferred reusable platform is not composed. */
@Injectable()
export class CoreSiteReusableAdapter implements SiteReusablePort {
  async assertDesignTokenDependenciesAvailable(
    workspaceId: string,
    siteId: string,
    designSystem: SiteDesignSystem,
  ): Promise<void> {
    void workspaceId;
    void siteId;
    void designSystem;
  }

  async assertDesignTokenRemovalSafe(
    workspaceId: string,
    siteId: string,
    nextDesignSystem: SiteDesignSystem,
  ): Promise<void> {
    void workspaceId;
    void siteId;
    void nextDesignSystem;
  }

  async getDesignTokenUsage(
    workspaceId: string,
    siteId: string,
    tokenId: string,
  ): Promise<DesignTokenUsageResponse> {
    void workspaceId;
    void siteId;
    void tokenId;
    throw new ConflictException({
      code: 'REUSABLE_PLATFORM_REQUIRED',
      message: 'Design-token usage requires the deferred reusable platform',
    });
  }

  async publishReferencedForSite(workspaceId: string, siteId: string): Promise<void> {
    void workspaceId;
    void siteId;
  }
}
