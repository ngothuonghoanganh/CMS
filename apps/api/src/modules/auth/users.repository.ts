import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { UserRef } from '@plp/contracts';
import type { Model } from 'mongoose';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import { USER_MODEL, type UserRecord } from './user.schema.js';

export const USERS_EMAIL_INDEX = 'users_email_unique';

@Injectable()
export class UsersRepository {
  constructor(@InjectModel(USER_MODEL) private readonly users: Model<UserRecord>) {}

  async create(
    input: { email: string; name: string; passwordHash: string },
    tx: Tx,
  ): Promise<UserRecord> {
    const [user] = await this.users.create([{ ...input, createdAt: new Date() }], { session: tx });
    if (!user) {
      throw new Error('User insert returned no document');
    }
    return user.toObject();
  }

  findByEmail(email: string): Promise<UserRecord | null> {
    return this.users.findOne({ email }).lean<UserRecord>().exec();
  }

  findById(id: ObjectId): Promise<UserRecord | null> {
    return this.users.findById(id).lean<UserRecord>().exec();
  }

  /** Display references (id + name) for authors shown in lists; unknown ids are omitted. */
  async findRefs(ids: readonly ObjectId[]): Promise<Map<string, UserRef>> {
    const unique = [...new Map(ids.map((id) => [id.toHexString(), id])).values()];
    if (unique.length === 0) {
      return new Map();
    }
    const users = await this.users
      .find({ _id: { $in: unique } }, { name: 1 })
      .lean<Pick<UserRecord, '_id' | 'name'>[]>()
      .exec();
    return new Map(
      users.map((user) => [
        user._id.toHexString(),
        { id: user._id.toHexString(), name: user.name },
      ]),
    );
  }
}
