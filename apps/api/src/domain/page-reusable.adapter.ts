import { Inject, Injectable } from '@nestjs/common';
import type { PagePayload, ReusableRuntime, SiteDesignSystem } from '@payload/contracts';

import { PAGE_REUSABLE_PORT, type PageReusablePort } from '../shared/page-reusable-port';
import { ReusableService } from './reusable.service';

/** Composition-root adapter from the reusable platform service to the core port. */
@Injectable()
export class PageReusableAdapter implements PageReusablePort {
  constructor(@Inject(ReusableService) private readonly reusables: ReusableService) {}

  assertDependenciesAvailable(
    workspaceId: string,
    siteId: string,
    payload: PagePayload,
  ): Promise<void> {
    return this.reusables.assertDependenciesAvailable(workspaceId, siteId, payload);
  }

  assertDesignTokenDependenciesAvailable(
    workspaceId: string,
    siteId: string,
    designSystem: SiteDesignSystem,
    additionalValues: readonly unknown[] = [],
  ): Promise<void> {
    return this.reusables.assertDesignTokenDependenciesAvailable(
      workspaceId,
      siteId,
      designSystem,
      additionalValues,
    );
  }

  resolveForPayload(
    workspaceId: string,
    siteId: string,
    payload: PagePayload,
    published: boolean,
  ): Promise<ReusableRuntime[]> {
    return this.reusables.resolveForPayload(workspaceId, siteId, payload, published);
  }
}

export const PAGE_REUSABLE_PORT_PROVIDER = {
  provide: PAGE_REUSABLE_PORT,
  useExisting: PageReusableAdapter,
} as const;
