import { Inject, Injectable } from '@nestjs/common';

import { CollectionService } from '../../domain/collection.service';
import {
  SEO_COLLECTION_PORT,
  type SeoCollectionPort,
} from '../../shared/seo-collection-port';

@Injectable()
export class SeoCollectionAdapter implements SeoCollectionPort {
  constructor(
    @Inject(CollectionService) private readonly collections: CollectionService,
  ) {}

  get(workspaceId: string, siteId: string | undefined, collectionId: string) {
    return this.collections.get(workspaceId, siteId, collectionId);
  }
}

export const SEO_COLLECTION_PORT_PROVIDER = {
  provide: SEO_COLLECTION_PORT,
  useExisting: SeoCollectionAdapter,
} as const;
