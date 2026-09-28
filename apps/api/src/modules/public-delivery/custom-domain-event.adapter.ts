import { Inject, Injectable } from '@nestjs/common';
import type { PlatformEventMap } from '@payload/contracts';

import { EventBus } from '../../extensions/event-bus';
import {
  CUSTOM_DOMAIN_EVENT_PORT,
  type CustomDomainEventPort,
} from '../../shared/custom-domain-event-port';

@Injectable()
export class CustomDomainEventAdapter implements CustomDomainEventPort {
  constructor(@Inject(EventBus) private readonly events: EventBus) {}

  publishDomainVerified(event: PlatformEventMap['domain.verified']): Promise<void> {
    return this.events.publish('domain.verified', event);
  }
}

export const CUSTOM_DOMAIN_EVENT_PORT_PROVIDER = {
  provide: CUSTOM_DOMAIN_EVENT_PORT,
  useExisting: CustomDomainEventAdapter,
} as const;
