import type {
  Collection,
  CollectionEntryResponse,
  PageComposition,
  ResolvedDataContext,
  ResolvedDataRecord,
} from '@payload/contracts';

export const PAGE_COLLECTION_PORT = Symbol('PAGE_COLLECTION_PORT');
export const PAGE_COLLECTION_IMPLEMENTATION = Symbol('PAGE_COLLECTION_IMPLEMENTATION');

export type CollectionCompositionValidationOptions = {
  currentEntryCollectionId?: string;
};

export type CollectionDataContextOptions = {
  mode: 'draft' | 'published';
  currentEntry?: ResolvedDataRecord;
};

/** Narrow collection capabilities required by page lifecycle and delivery. */
export interface PageCollectionPort {
  get(
    workspaceId: string,
    siteId: string | undefined,
    collectionId: string,
  ): Promise<Collection>;

  getEntry(
    workspaceId: string,
    siteId: string | undefined,
    collectionId: string,
    entryId: string,
    mode?: 'draft' | 'published',
  ): Promise<CollectionEntryResponse>;

  validateComposition(
    workspaceId: string,
    siteId: string | undefined,
    composition: PageComposition,
    options?: CollectionCompositionValidationOptions,
  ): Promise<void>;

  resolveDataContext(
    workspaceId: string,
    siteId: string | undefined,
    composition: PageComposition,
    options: CollectionDataContextOptions,
  ): Promise<ResolvedDataContext>;

  resolvePublishedEntryByValue(
    workspaceId: string,
    siteId: string | undefined,
    collectionId: string,
    field: string,
    value: string,
  ): Promise<ResolvedDataRecord | null>;
}
