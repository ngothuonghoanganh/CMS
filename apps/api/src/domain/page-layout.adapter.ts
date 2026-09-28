import { Inject, Injectable } from '@nestjs/common';
import type {
  LayoutExtensionKind,
  LayoutExtensionResource,
  PageLayoutAttachment,
} from '@payload/contracts';

import {
  PAGE_LAYOUT_PORT,
  type PageLayoutComposition,
  type PageLayoutPort,
} from '../shared/page-layout-port';
import { LayoutExtensionService } from './layout-extension.service';

/** Composition-root adapter from the layout platform service to the page port. */
@Injectable()
export class PageLayoutAdapter implements PageLayoutPort {
  constructor(
    @Inject(LayoutExtensionService)
    private readonly layouts: LayoutExtensionService,
  ) {}

  get(
    siteId: string | undefined,
    workspaceId: string,
    kind: LayoutExtensionKind,
    resourceId: string,
  ): Promise<LayoutExtensionResource> {
    return this.layouts.get(siteId, workspaceId, kind, resourceId);
  }

  resolveComposition(
    attachments: readonly PageLayoutAttachment[],
    mode: 'draft' | 'published',
    scope?: { workspaceId: string; siteId?: string },
  ): Promise<PageLayoutComposition> {
    return this.layouts.resolveComposition(attachments, mode, scope);
  }
}

export const PAGE_LAYOUT_PORT_PROVIDER = {
  provide: PAGE_LAYOUT_PORT,
  useExisting: PageLayoutAdapter,
} as const;
