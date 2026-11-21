import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import {
  BILLING_NOTICE_MODEL,
  BILLING_NOTICE_RETENTION_DAYS,
  type BillingNoticeRecord,
} from './billing-notice.schema.js';

const DAY_MS = 86_400_000;

/** `billing_notices` of the master DB (ADR-035, T3): each email of the plan, sent once. */
@Injectable()
export class BillingNoticesRepository {
  constructor(
    @InjectModel(BILLING_NOTICE_MODEL) private readonly notices: Model<BillingNoticeRecord>,
  ) {}

  /**
   * Takes the email of `key` for sending; false when it was taken before (sent, or being sent).
   * Retention runs on real time, whatever the billing clock says.
   */
  async claim(ref: WorkspaceRef, notice: { key: string; template: string }): Promise<boolean> {
    const now = new Date();
    try {
      await this.notices.create([
        {
          _id: notice.key,
          workspaceId: ref.workspaceId,
          template: notice.template,
          sentAt: now,
          expiresAt: new Date(now.getTime() + BILLING_NOTICE_RETENTION_DAYS * DAY_MS),
        },
      ]);
      return true;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return false;
      }
      throw error;
    }
  }

  /** Gives back an email that was not sent, so a later try may send it. */
  async release(key: string): Promise<void> {
    await this.notices.deleteOne({ _id: key }).exec();
  }
}
