import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  PASSWORD_RESET_MODEL,
  PASSWORD_RESETS_USER_INDEX,
  type PasswordResetRecord,
} from './account.schema.js';

/** Password reset links, one per user, in the master DB (ADR-026). */
@Injectable()
export class PasswordResetsRepository {
  constructor(
    @InjectModel(PASSWORD_RESET_MODEL) private readonly resets: Model<PasswordResetRecord>,
  ) {}

  /** The user's link from now on; an earlier one stops working. */
  async replace(userId: ObjectId, tokenHash: string, expiresAt: Date, now: Date): Promise<void> {
    const write = () =>
      this.resets
        .updateOne({ userId }, { $set: { tokenHash, expiresAt, createdAt: now } }, { upsert: true })
        .exec();
    try {
      await write();
    } catch (error) {
      // Two requests for one user raced to insert; the loser now replaces the winner's link.
      if (isDuplicateKeyError(error, PASSWORD_RESETS_USER_INDEX)) {
        await write();
        return;
      }
      throw error;
    }
  }

  /** The reset whose link carries `tokenHash`, while that link works. */
  findActiveByTokenHash(tokenHash: string, now: Date): Promise<PasswordResetRecord | null> {
    return this.resets
      .findOne({ tokenHash, expiresAt: { $gt: now } })
      .lean<PasswordResetRecord>()
      .exec();
  }

  /**
   * Removes the reset while its link is still the one used; false when it was used or replaced
   * meanwhile. In the transaction that changes the password, so a link works once.
   */
  async claim(id: ObjectId, tokenHash: string, tx: Tx): Promise<boolean> {
    const result = await this.resets.deleteOne({ _id: id, tokenHash }, { session: tx }).exec();
    return result.deletedCount === 1;
  }
}
