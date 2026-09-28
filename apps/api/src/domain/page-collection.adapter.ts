import { Inject, Injectable } from '@nestjs/common';
import type {
  Collection,
  CollectionEntryResponse,
  PageComposition,
  ResolvedDataContext,
  ResolvedDataRecord,
} from '@payload/contracts';

import {
  PAGE_COLLECTION_PORT,
  type CollectionCompositionValidationOptions,
  type CollectionDataContextOptions,
  type PageCollectionPort,
} from '../shared/page-collection-port';
import { CollectionService } from './collection.service';

/** Composition-root adapter from the collection platform service to the page port. */
@Injectable()
export class PageCollectionAdapter implements PageCollectionPort {
  constructor(
    @Inject(CollectionService) private readonly collections: CollectionService,
  ) {}

  get(
    workspaceId: string,
    siteId: string | undefined,
    collectionId: string,
  ): Promise<Collection> {
    return this.collections.get(workspaceId, siteId, collectionId);
  }

  getEntry(
    workspaceId: string,
    siteId: string | undefined,
    collectionId: string,
    entryId: string,
    mode?: 'draft' | 'published',
  ): Promise<CollectionEntryResponse> {
    return this.collections.getEntry(workspaceId, siteId, collectionId, entryId, mode);
  }

  validateComposition(
    workspaceId: string,
    siteId: string | undefined,
    composition: PageComposition,
    options?: CollectionCompositionValidationOptions,
  ): Promise<void> {
    return this.collections.validateComposition(
      workspaceId,
      siteId,
      composition,
      options,
    );
  }

  resolveDataContext(
    workspaceId: string,
    siteId: string | undefined,
    composition: PageComposition,
    options: CollectionDataContextOptions,
  ): Promise<ResolvedDataContext> {
    return this.collections.resolveDataContext(workspaceId, siteId, composition, options);
  }

  resolvePublishedEntryByValue(
    workspaceId: string,
    siteId: string | undefined,
    collectionId: string,
    field: string,
    value: string,
  ): Promise<ResolvedDataRecord | null> {
    return this.collections.resolvePublishedEntryByValue(
      workspaceId,
      siteId,
      collectionId,
      field,
      value,
    );
  }
}

export const PAGE_COLLECTION_PORT_PROVIDER = {
  provide: PAGE_COLLECTION_PORT,
  useExisting: PageCollectionAdapter,
} as const;
