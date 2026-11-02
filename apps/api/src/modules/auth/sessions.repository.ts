import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import { SESSION_MODEL, type SessionRecord } from './user.schema.js';

@Injectable()
export class SessionsRepository {
  constructor(@InjectModel(SESSION_MODEL) private readonly sessions: Model<SessionRecord>) {}

  /**
   * A session of the user, issued against `credentialsVersion`: the version read together with the
   * password it was proven with (ADR-026).
   */
  async create(
    userId: ObjectId,
    tokenHash: string,
    expiresAt: Date,
    cookieDomain: string | null,
    credentialsVersion: number,
  ): Promise<void> {
    await this.sessions.create({
      userId,
      tokenHash,
      expiresAt,
      cookieDomain,
      credentialsVersion,
      createdAt: new Date(),
    });
  }

  /**
   * The first of `tokenHashes` (in their order) that is a session not expired yet, whose cookie
   * was set with `cookieDomain`; one query. The TTL index removes expired records later.
   */
  async findActive(
    tokenHashes: readonly string[],
    now: Date,
    cookieDomain: string | null,
  ): Promise<SessionRecord | null> {
    if (tokenHashes.length === 0) {
      return null;
    }
    const found = await this.sessions
      .find({
        tokenHash: { $in: [...tokenHashes] },
        expiresAt: { $gt: now },
        // `null` also matches sessions from before the field existed: host-only cookies.
        cookieDomain,
      })
      .lean<SessionRecord[]>()
      .exec();
    for (const tokenHash of tokenHashes) {
      const session = found.find((item) => item.tokenHash === tokenHash);
      if (session !== undefined) {
        return session;
      }
    }
    return null;
  }

  /** Ends every session of the user, but the one of `keep` when given (ADR-026). */
  async deleteForUser(userId: ObjectId, tx: Tx, keep?: ObjectId): Promise<void> {
    await this.sessions
      .deleteMany(keep === undefined ? { userId } : { userId, _id: { $ne: keep } }, { session: tx })
      .exec();
  }

  /** The session that changed the password goes on under the new credentials version. */
  async setCredentialsVersion(id: ObjectId, credentialsVersion: number, tx: Tx): Promise<void> {
    await this.sessions
      .updateOne({ _id: id }, { $set: { credentialsVersion } }, { session: tx })
      .exec();
  }

  async deleteAll(tokenHashes: readonly string[]): Promise<void> {
    if (tokenHashes.length > 0) {
      await this.sessions.deleteMany({ tokenHash: { $in: [...tokenHashes] } }).exec();
    }
  }
}
