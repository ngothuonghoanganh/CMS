import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  PENDING_SIGNUP_MODEL,
  PENDING_SIGNUPS_EMAIL_INDEX,
  type PendingSignupRecord,
} from './account.schema.js';

export type PendingSignupInput = Omit<PendingSignupRecord, '_id' | 'createdAt'>;

/** Sign-ups waiting for their email to be confirmed, in the master DB (ADR-026). */
@Injectable()
export class PendingSignupsRepository {
  constructor(
    @InjectModel(PENDING_SIGNUP_MODEL) private readonly pending: Model<PendingSignupRecord>,
  ) {}

  /**
   * The sign-up of `input.email`, replacing an earlier one: its link stops working. Resolves with
   * its id, which keys its email (ADR-029).
   */
  async replace(input: PendingSignupInput, now: Date): Promise<ObjectId> {
    const write = async () => {
      const stored = await this.pending
        .findOneAndUpdate(
          { email: input.email },
          // A sign-up stored before passwords moved to the link's page still had one (ADR-026).
          { $set: { ...input, createdAt: now }, $unset: { passwordHash: '' } },
          // Not strict: the schema no longer has the field, and strict mode would drop the $unset.
          { upsert: true, strict: false, returnDocument: 'after', projection: { _id: 1 } },
        )
        .lean<Pick<PendingSignupRecord, '_id'>>()
        .exec();
      if (stored === null) {
        throw new Error('An upserted sign-up was not returned');
      }
      return stored._id;
    };
    try {
      return await write();
    } catch (error) {
      // Two sign-ups of one email raced to insert; the loser now replaces the winner's.
      if (isDuplicateKeyError(error, PENDING_SIGNUPS_EMAIL_INDEX)) {
        return write();
      }
      throw error;
    }
  }

  /** The sign-up whose link carries `tokenHash`, while that link works. */
  findActiveByTokenHash(tokenHash: string, now: Date): Promise<PendingSignupRecord | null> {
    return this.pending
      .findOne({ tokenHash, expiresAt: { $gt: now } })
      .lean<PendingSignupRecord>()
      .exec();
  }

  /**
   * A new link for the sign-up of `email` still waiting, valid from now on: the old link stops
   * working. Null when there is none.
   */
  renew(
    email: string,
    tokenHash: string,
    expiresAt: Date,
    now: Date,
  ): Promise<PendingSignupRecord | null> {
    return this.pending
      .findOneAndUpdate(
        { email, expiresAt: { $gt: now } },
        { $set: { tokenHash, expiresAt }, $unset: { passwordHash: '' } },
        { returnDocument: 'after', strict: false },
      )
      .lean<PendingSignupRecord>()
      .exec();
  }

  /**
   * Removes the sign-up while its link is still the one confirmed; false when it was used, sent
   * again or replaced meanwhile. In the transaction that creates the account, so a link creates
   * one account at most.
   */
  async claim(id: ObjectId, tokenHash: string, tx: Tx): Promise<boolean> {
    const result = await this.pending.deleteOne({ _id: id, tokenHash }, { session: tx }).exec();
    return result.deletedCount === 1;
  }

  async delete(id: ObjectId): Promise<void> {
    await this.pending.deleteOne({ _id: id }).exec();
  }
}
