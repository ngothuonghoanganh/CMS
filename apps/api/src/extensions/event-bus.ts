import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import type { PlatformEventMap, PlatformEventName } from '@payload/contracts';

import { platformLogger } from '../common/logging/platform-logger';
import { TenantExtensionRecord } from '../persistence/schemas/tenant-extension.schema';
import { TenantContext } from '../tenancy/tenant-context';

type EventHandler<K extends PlatformEventName> = (
  event: PlatformEventMap[K],
) => void | Promise<void>;

type Subscription<K extends PlatformEventName> = {
  handler: EventHandler<K>;
  critical: boolean;
  extensionId?: string;
};

@Injectable()
export class EventBus {
  private readonly subscribers = new Map<
    PlatformEventName,
    Set<Subscription<PlatformEventName>>
  >();

  constructor(
    @Inject(TenantContext) private readonly tenantContext: TenantContext,
    @Optional()
    @InjectModel(TenantExtensionRecord.name)
    private readonly extensionModel?: Model<TenantExtensionRecord>,
  ) {}

  subscribe<K extends PlatformEventName>(
    eventName: K,
    handler: EventHandler<K>,
    options: { critical?: boolean; extensionId?: string } = {},
  ): () => void {
    const subscribers = this.subscribers.get(eventName) ?? new Set();
    const subscription = {
      handler: handler as EventHandler<PlatformEventName>,
      critical: options.critical ?? false,
      ...(options.extensionId ? { extensionId: options.extensionId } : {}),
    } satisfies Subscription<PlatformEventName>;
    subscribers.add(subscription);
    this.subscribers.set(eventName, subscribers);
    return () => subscribers.delete(subscription);
  }

  async publish<K extends PlatformEventName>(
    eventName: K,
    event: PlatformEventMap[K],
  ): Promise<void> {
    const currentTenantId = this.tenantContext.get()?.id;
    if (currentTenantId && currentTenantId !== event.tenantId) {
      throw new Error('EVENT_TENANT_CONTEXT_MISMATCH');
    }

    const enrichedEvent = {
      ...event,
      eventId: event.eventId ?? randomUUID(),
    } as PlatformEventMap[K];
    const subscribers = [...(this.subscribers.get(eventName) ?? [])];
    await Promise.all(
      subscribers.map(async (subscription) => {
        try {
          if (
            subscription.extensionId &&
            !(await this.isTenantExtensionEnabled(subscription.extensionId))
          ) {
            return;
          }
          await subscription.handler(
            enrichedEvent as PlatformEventMap[PlatformEventName],
          );
        } catch (error) {
          platformLogger.warn(
            {
              err: error,
              eventName,
              tenantId: enrichedEvent.tenantId,
              critical: subscription.critical,
            },
            'platform event subscriber failed',
          );
          // Optional extension subscribers are isolated from the core flow.
          // Critical is retained as observability metadata for a future queue boundary.
        }
      }),
    );
  }

  clear(): void {
    this.subscribers.clear();
  }

  private async isTenantExtensionEnabled(extensionId: string): Promise<boolean> {
    // Unit-level consumers can use the bus without a database model. The Nest
    // application always supplies the tenant model through TenantModelsModule.
    if (!this.extensionModel) return true;
    try {
      const record = await this.extensionModel
        .findOne({ extensionId, enabled: true })
        .select({ extensionId: 1 })
        .exec();
      return Boolean(record);
    } catch (error) {
      platformLogger.warn(
        { err: error, extensionId, tenantId: this.tenantContext.get()?.id },
        'tenant extension state lookup failed',
      );
      return false;
    }
  }
}
