import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { RenewalMethod } from '@plp/contracts';
import type { Model } from 'mongoose';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import {
  BILLING_LOG_MODEL,
  type BillingLogAction,
  type BillingLogRecord,
  type PlanChoice,
} from './billing-log.schema.js';

export interface BillingLogEntry {
  at: Date;
  actorId: ObjectId | null;
  action: BillingLogAction;
  from?: PlanChoice | null;
  to?: PlanChoice | null;
  invoiceId?: ObjectId | null;
  amount?: number | null;
  itemId?: string | null;
  renewalMethod?: RenewalMethod | null;
}

/** `billing_log` of the master DB (ADR-035): written in the transaction of the change it records. */
@Injectable()
export class BillingLogRepository {
  constructor(@InjectModel(BILLING_LOG_MODEL) private readonly log: Model<BillingLogRecord>) {}

  async record(ref: WorkspaceRef, entry: BillingLogEntry, tx: Tx): Promise<void> {
    await this.log.create(
      [
        {
          workspaceId: ref.workspaceId,
          at: entry.at,
          actorId: entry.actorId,
          action: entry.action,
          from: entry.from ?? null,
          to: entry.to ?? null,
          invoiceId: entry.invoiceId ?? null,
          amount: entry.amount ?? null,
          itemId: entry.itemId ?? null,
          renewalMethod: entry.renewalMethod ?? null,
        },
      ],
      { session: tx },
    );
  }
}
