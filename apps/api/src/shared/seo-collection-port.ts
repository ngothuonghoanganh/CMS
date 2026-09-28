import type { Collection } from '@payload/contracts';

export const SEO_COLLECTION_PORT = Symbol('SEO_COLLECTION_PORT');

/** Narrow collection lookup required by basic SEO bindings. */
export interface SeoCollectionPort {
  get(
    workspaceId: string,
    siteId: string | undefined,
    collectionId: string,
  ): Promise<Collection>;
}
