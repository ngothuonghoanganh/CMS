import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { UserRef } from '@plp/contracts';
import type { Model } from 'mongoose';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import { credentialsVersionOf, USER_MODEL, type UserRecord } from './user.schema.js';

export const USERS_EMAIL_INDEX = 'users_email_unique';

export type UserContact = Pick<UserRecord, '_id' | 'name' | 'email'>;

/** The password a change proved, as it was read: its hash and the credentials version. */
export interface ProvenCredentials {
  passwordHash: string;
  credentialsVersion: number;
}

/** Matches a credentials version; 0 is also an account from before the field. */
function credentialsVersionIs(version: number) {
  return version === 0 ? { $in: [0, null] } : version;
}

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

  /** Name and email of members, invited people and requesters (ADR-021). */
  findContacts(ids: readonly ObjectId[]): Promise<UserContact[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.users
      .find({ _id: { $in: [...ids] } }, { name: 1, email: 1 })
      .lean<UserContact[]>()
      .exec();
  }

  /** The accounts of `emails`, e.g. to tell which invited people are members already. */
  findContactsByEmail(emails: readonly string[]): Promise<UserContact[]> {
    if (emails.length === 0) {
      return Promise.resolve([]);
    }
    return this.users
      .find({ email: { $in: [...emails] } }, { name: 1, email: 1 })
      .lean<UserContact[]>()
      .exec();
  }

  findById(id: ObjectId): Promise<UserRecord | null> {
    return this.users.findById(id).lean<UserRecord>().exec();
  }

  /**
   * Sets a new password and moves the user to the next credentials version, which sessions issued
   * against an earlier one do not pass (ADR-026). With `proven`, only while the user still has
   * that hash and version: a reset or change committed since they were read wins. The new version;
   * null when the user is gone or `proven` no longer holds.
   */
  async setPassword(
    id: ObjectId,
    passwordHash: string,
    tx: Tx,
    proven?: ProvenCredentials,
  ): Promise<number | null> {
    const filter =
      proven === undefined
        ? { _id: id }
        : {
            _id: id,
            passwordHash: proven.passwordHash,
            credentialsVersion: credentialsVersionIs(proven.credentialsVersion),
          };
    const updated = await this.users
      .findOneAndUpdate(
        filter,
        { $set: { passwordHash }, $inc: { credentialsVersion: 1 } },
        { session: tx, returnDocument: 'after', projection: { credentialsVersion: 1 } },
      )
      .lean<Pick<UserRecord, '_id' | 'credentialsVersion'>>()
      .exec();
    return updated === null ? null : credentialsVersionOf(updated);
  }

  async setName(id: ObjectId, name: string): Promise<void> {
    await this.users.updateOne({ _id: id }, { $set: { name } }).exec();
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
