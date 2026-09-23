import { Inject, Injectable } from '@nestjs/common';

import {
  CORE_EVENT_PUBLISHER,
  type CoreEventMap,
  type CoreEventName,
  type CoreEventPublisher,
} from '../shared/events/core-event-publisher';
import { EventBus } from './event-bus';

/**
 * Compatibility bridge while the extension event bus remains the installed
 * subscriber implementation. Core services depend on the shared port; only
 * this optional-capability adapter knows about the legacy bus.
 */
@Injectable()
export class LegacyExtensionEventPublisherAdapter implements CoreEventPublisher {
  constructor(@Inject(EventBus) private readonly eventBus: EventBus) {}

  publish<K extends CoreEventName>(eventName: K, event: CoreEventMap[K]): Promise<void> {
    return this.eventBus.publish(eventName, event);
  }
}

export const CORE_EVENT_PUBLISHER_PROVIDER = {
  provide: CORE_EVENT_PUBLISHER,
  useExisting: LegacyExtensionEventPublisherAdapter,
} as const;
