import { Inject, Injectable } from '@nestjs/common';

import {
  PAGE_NAVIGATION_PORT,
  type NavigationResolutionOptions,
  type PageNavigationPort,
  type ResolvedSiteNavigation,
} from '../shared/page-navigation-port';
import { NavigationService } from '../modules/navigation/navigation.service';

/** Composition-root adapter from the navigation platform service to the page port. */
@Injectable()
export class PageNavigationAdapter implements PageNavigationPort {
  constructor(
    @Inject(NavigationService) private readonly navigation: NavigationService,
  ) {}

  validateInlineNavigationDocument(
    document: unknown,
    workspaceId: string,
    siteId?: string,
  ): Promise<void> {
    return this.navigation.validateInlineNavigationDocument(
      document,
      workspaceId,
      siteId,
    );
  }

  assertPageCanBeDeleted(
    siteId: string,
    pageId: string,
    workspaceId: string,
  ): Promise<void> {
    return this.navigation.assertPageCanBeDeleted(siteId, pageId, workspaceId);
  }

  resolveForSite(
    siteId: string,
    workspaceId: string,
    options?: NavigationResolutionOptions,
  ): Promise<ResolvedSiteNavigation | undefined> {
    return this.navigation.resolveForSite(siteId, workspaceId, options);
  }

  resolvePagePaths(
    siteId: string,
    workspaceId: string,
    pageIds: readonly string[],
    homePageId: string | undefined,
    mode?: 'draft' | 'published',
  ): Promise<Record<string, string>> {
    return this.navigation.resolvePagePaths(
      siteId,
      workspaceId,
      pageIds,
      homePageId,
      mode,
    );
  }
}

export const PAGE_NAVIGATION_PORT_PROVIDER = {
  provide: PAGE_NAVIGATION_PORT,
  useExisting: PageNavigationAdapter,
} as const;
