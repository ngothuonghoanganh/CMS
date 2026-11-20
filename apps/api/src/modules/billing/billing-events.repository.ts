import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { GatewayEventKind } from '@plp/contracts';
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  BILLING_EVENT_MODEL,
  BILLING_EVENT_RETENTION_DAYS,
  BILLING_EVENTS_UNIQUE_INDEX,
  type BillingEventRecord,
} from './billing-event.schema.js';

const DAY_MS = 86_400_000;

/** The gateway's event came before: the transaction that applied it already committed. */
export class GatewayEventSeenError extends Error {
  constructor(options: { cause: unknown }) {
    super('This gateway event was applied before', options);
    this.name = 'GatewayEventSeenError';
  }
}

/** `billing_events` of the master DB (ADR-035): one row per gateway event applied. */
@Injectable()
export class BillingEventsRepository {
  constructor(
    @InjectModel(BILLING_EVENT_MODEL) private readonly events: Model<BillingEventRecord>,
  ) {}

  /**
   * Records the event in the transaction that applies it; throws `GatewayEventSeenError` when it
   * was recorded before, which aborts `tx` so nothing is applied twice.
   */
  async record(
    event: { provider: string; eventId: string; kind: GatewayEventKind },
    receivedAt: Date,
    tx: Tx,
  ): Promise<void> {
    try {
      await this.events.create(
        [
          {
            ...event,
            receivedAt,
            expiresAt: new Date(receivedAt.getTime() + BILLING_EVENT_RETENTION_DAYS * DAY_MS),
          },
        ],
        { session: tx },
      );
    } catch (error) {
      if (isDuplicateKeyError(error, BILLING_EVENTS_UNIQUE_INDEX)) {
        throw new GatewayEventSeenError({ cause: error });
      }
      throw error;
    }
  }
}
