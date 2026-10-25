import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import { SESSION_MODEL, type SessionRecord } from './user.schema.js';

@Injectable()
export class SessionsRepository {
  constructor(@InjectModel(SESSION_MODEL) private readonly sessions: Model<SessionRecord>) {}

  async create(userId: ObjectId, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.sessions.create({ userId, tokenHash, expiresAt, createdAt: new Date() });
  }

  /** The session for a token hash if it has not expired (the TTL index removes it later). */
  findActive(tokenHash: string, now: Date): Promise<SessionRecord | null> {
    return this.sessions
      .findOne({ tokenHash, expiresAt: { $gt: now } })
      .lean<SessionRecord>()
      .exec();
  }

  async delete(tokenHash: string): Promise<void> {
    await this.sessions.deleteOne({ tokenHash }).exec();
  }
}
