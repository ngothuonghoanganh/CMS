import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { platformLogger } from '../../common/logging/platform-logger';
import { TenantContext } from '../../tenancy/tenant-context';
import {
  type CoreEventMap,
  type CoreEventName,
  type CoreEventPublisher,
} from './core-event-publisher';

type CoreEventHandler<K extends CoreEventName> = (
  event: CoreEventMap[K],
) => void | Promise<void>;

type CoreEventSubscription = {
  handler: CoreEventHandler<CoreEventName>;
};

/**
 * Minimal in-process event publisher owned by Core. Optional capabilities may
 * subscribe to it, but they do not provide the core publisher itself.
 */
@Injectable()
export class CoreEventBus implements CoreEventPublisher {
  private readonly subscribers = new Map<CoreEventName, Set<CoreEventSubscription>>();

  constructor(@Inject(TenantContext) private readonly tenantContext: TenantContext) {}

  subscribe<K extends CoreEventName>(
    eventName: K,
    handler: CoreEventHandler<K>,
  ): () => void {
    const subscribers = this.subscribers.get(eventName) ?? new Set();
    const subscription = {
      handler: handler as CoreEventHandler<CoreEventName>,
    } satisfies CoreEventSubscription;
    subscribers.add(subscription);
    this.subscribers.set(eventName, subscribers);
    return () => subscribers.delete(subscription);
  }

  async publish<K extends CoreEventName>(
    eventName: K,
    event: CoreEventMap[K],
  ): Promise<void> {
    const currentTenantId = this.tenantContext.get()?.id;
    if (currentTenantId && currentTenantId !== event.tenantId) {
      throw new Error('EVENT_TENANT_CONTEXT_MISMATCH');
    }

    const enrichedEvent = {
      ...event,
      eventId: event.eventId ?? randomUUID(),
    } as CoreEventMap[K];
    const subscribers = [...(this.subscribers.get(eventName) ?? [])];
    await Promise.all(
      subscribers.map(async (subscription) => {
        try {
          await subscription.handler(enrichedEvent as CoreEventMap[CoreEventName]);
        } catch (error) {
          platformLogger.warn(
            {
              err: error,
              eventName,
              tenantId: enrichedEvent.tenantId,
            },
            'core event subscriber failed',
          );
          // Core persistence must not depend on optional event subscribers.
        }
      }),
    );
  }

  clear(): void {
    this.subscribers.clear();
  }
}
