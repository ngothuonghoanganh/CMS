import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { Collection, PlatformEventMap } from '@payload/contracts';

import {
  CORE_EVENT_PUBLISHER,
  type CoreEventPublisher,
} from '../../shared/events/core-event-publisher';
import type { CustomDomainEventPort } from '../../shared/custom-domain-event-port';
import type { CustomDomainQuotaPort } from '../../shared/custom-domain-quota-port';
import type { SeoCollectionPort } from '../../shared/seo-collection-port';

@Injectable()
export class CoreCustomDomainQuotaAdapter implements CustomDomainQuotaPort {
  withHardQuota<T>(operation: () => Promise<T>): Promise<T> {
    return operation();
  }
}

@Injectable()
export class CoreCustomDomainEventAdapter implements CustomDomainEventPort {
  constructor(
    @Inject(CORE_EVENT_PUBLISHER) private readonly events: CoreEventPublisher,
  ) {}

  publishDomainVerified(event: PlatformEventMap['domain.verified']): Promise<void> {
    return this.events.publish('domain.verified', event);
  }
}

@Injectable()
export class CoreSeoCollectionAdapter implements SeoCollectionPort {
  get(
    workspaceId: string,
    siteId: string | undefined,
    collectionId: string,
  ): Promise<Collection> {
    void workspaceId;
    void siteId;
    void collectionId;
    return Promise.reject(
      new ConflictException({
        code: 'COLLECTION_PLATFORM_REQUIRED',
        message:
          'Collection-backed SEO bindings require the deferred collection platform',
      }),
    );
  }
}
