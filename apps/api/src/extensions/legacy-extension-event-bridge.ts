import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { PlatformEventMap } from '@payload/contracts';

import { CoreEventBus } from '../shared/events/core-event-bus';
import type { CoreEventName } from '../shared/events/core-event-publisher';
import { EventBus } from './event-bus';

const bridgedEventNames = [
  'workspace.created',
  'page.created',
  'page.updated',
  'page.published',
] as const satisfies readonly CoreEventName[];

/**
 * Compatibility-only bridge. Core events remain usable when Extensions are
 * absent; loading Extensions merely forwards the migrated events to the
 * existing subscriber bus.
 */
@Injectable()
export class LegacyExtensionEventBridge implements OnModuleDestroy, OnModuleInit {
  private unsubscribers: Array<() => void> = [];

  constructor(
    @Inject(CoreEventBus) private readonly coreEvents: CoreEventBus,
    @Inject(EventBus) private readonly extensionEvents: EventBus,
  ) {}

  onModuleInit(): void {
    if (this.unsubscribers.length > 0) return;
    this.unsubscribers = bridgedEventNames.map((eventName) =>
      this.subscribeToCoreEvent(eventName),
    );
  }

  onModuleDestroy(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
  }

  private subscribeToCoreEvent<K extends CoreEventName>(eventName: K): () => void {
    return this.coreEvents.subscribe(eventName, (event) =>
      this.extensionEvents.publish(eventName, event as unknown as PlatformEventMap[K]),
    );
  }
}
