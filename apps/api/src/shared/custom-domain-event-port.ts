import type { PlatformEventMap } from '@payload/contracts';

export const CUSTOM_DOMAIN_EVENT_PORT = Symbol('CUSTOM_DOMAIN_EVENT_PORT');
export const CUSTOM_DOMAIN_EVENT_IMPLEMENTATION = Symbol(
  'CUSTOM_DOMAIN_EVENT_IMPLEMENTATION',
);

/** Optional platform event capability used after a domain is verified. */
export interface CustomDomainEventPort {
  publishDomainVerified(event: PlatformEventMap['domain.verified']): Promise<void>;
}
