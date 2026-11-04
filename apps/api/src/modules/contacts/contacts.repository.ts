import { Injectable } from '@nestjs/common';
import type { RetentionMonths } from '@plp/contracts';
import { type Model, type PipelineStage, type QueryFilter, Types } from 'mongoose';
import { decodeCursor, encodeCursor } from '../../shared/cursor.js';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { KeysetPage } from '../../shared/persistence/keyset.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  WorkspaceDatabases,
  type WorkspaceRef,
} from '../../shared/persistence/workspace-databases.js';
import type { LeadQuery } from '../leads/domain/lead-search.js';
import type { LeadPerson } from '../leads/leads.repository.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import {
  CONTACT_COLLECTION,
  type ContactRecord,
  CONTACTS_PHONE_INDEX,
  type ContactMarketing,
  type ContactOrigin,
} from './contact.schema.js';
import { contactSearchKeys, type MergedContact } from './domain/contact-rules.js';

/** What a lead brings to its profile (ADR-033). */
export interface LeadForContact {
  name: string;
  /** E.164. */
  phone: string;
  email: string | null;
  marketing: boolean;
  pageId: ObjectId;
  source: string;
  medium: string;
  at: Date;
}

/** A profile added by hand ("Thêm khách hàng"). */
export interface NewManualContact {
  name: string;
  phone: string;
  origin: Extract<ContactOrigin, { kind: 'manual' }>;
  marketing: ContactMarketing;
  at: Date;
  expiresAt: Date | null;
}

/** The filters of board 22; `ownerId: null` is "Chưa giao". */
export interface ContactCriteria {
  ownerId?: ObjectId | null;
  tag?: string;
  search: LeadQuery | null;
}

/** Another profile of the site already has this phone number. */
export class ContactPhoneTakenError extends Error {
  constructor(options: { cause: unknown }) {
    super('A contact with this phone number already exists in the site', options);
    this.name = 'ContactPhoneTakenError';
  }
}

/** Sort of every view: the most recent interaction first. */
const RECENT_FIRST = { lastActivityAt: -1, _id: -1 } as const;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function searchFilter(search: LeadQuery): QueryFilter<ContactRecord> {
  switch (search.kind) {
    case 'phone':
      return {
        'search.phone': {
          $in: search.prefixes.map((prefix) => new RegExp(`^${escapeRegExp(prefix)}`)),
        },
      };
    case 'email':
      return { 'search.email': new RegExp(`^${escapeRegExp(search.prefix)}`) };
    case 'name':
      return { 'search.name': new RegExp(escapeRegExp(search.text)) };
  }
}

/** The expiry from the last interaction (`contactExpiry`), written by the database. */
function expiryExpression(months: RetentionMonths): unknown {
  return months === null
    ? null
    : { $dateAdd: { startDate: '$lastActivityAt', unit: 'month', amount: months } };
}

@Injectable()
export class ContactsRepository {
  constructor(private readonly databases: WorkspaceDatabases) {}

  /**
   * Joins a lead to the profile with its phone number, or creates one, in the caller's
   * transaction (ADR-033). The first lead names the profile; a later one fills an empty email and
   * an agreement to offers, never takes them back. One update, so two leads of the same person at
   * once both count.
   */
  async upsertFromLead(
    ref: WorkspaceRef,
    siteId: ObjectId,
    lead: LeadForContact,
    months: RetentionMonths,
    tx: Tx,
  ): Promise<ContactRecord> {
    const keys = contactSearchKeys(lead);
    const agreed = lead.marketing
      ? { consented: true, at: lead.at, recordedBy: null }
      : { consented: false, at: null, recordedBy: null };
    const stages: PipelineStage.Set[] = [
      {
        $set: {
          workspaceId: ref.workspaceId,
          name: { $ifNull: ['$name', lead.name] },
          email: { $ifNull: ['$email', lead.email] },
          'search.phone': keys.phone,
          'search.name': { $ifNull: ['$search.name', keys.name] },
          'search.email': { $ifNull: ['$search.email', keys.email] },
          ownerId: { $ifNull: ['$ownerId', null] },
          tags: { $ifNull: ['$tags', []] },
          origin: { $ifNull: ['$origin', { kind: 'lead' }] },
          marketing: {
            $cond: [{ $eq: ['$marketing.consented', true] }, '$marketing', agreed],
          },
          leadCount: { $add: [{ $ifNull: ['$leadCount', 0] }, 1] },
          lastLead: { pageId: lead.pageId, source: lead.source, medium: lead.medium, at: lead.at },
          lastActivityAt: { $max: ['$lastActivityAt', lead.at] },
          createdAt: { $ifNull: ['$createdAt', lead.at] },
        },
      },
      { $set: { expiresAt: expiryExpression(months) } },
    ];
    const contact = await this.contacts(ref)
      .findOneAndUpdate({ siteId, phone: lead.phone }, stages, {
        upsert: true,
        returnDocument: 'after',
        updatePipeline: true,
        session: tx,
      })
      .lean<ContactRecord>()
      .exec();
    return contact;
  }

  /**
   * Takes back a lead the public intake removed again (its page or site went meanwhile): the
   * profile it created goes too, one it joined counts one lead less.
   */
  async dropLead(ref: WorkspaceRef, siteId: ObjectId, id: ObjectId): Promise<void> {
    const filter = { _id: id, workspaceId: ref.workspaceId, siteId };
    await this.contacts(ref)
      .deleteOne({ ...filter, leadCount: { $lte: 1 }, 'origin.kind': 'lead' })
      .exec();
    await this.contacts(ref)
      .updateOne({ ...filter, leadCount: { $gt: 0 } }, { $inc: { leadCount: -1 } })
      .exec();
  }

  /** "Thêm khách hàng"; a number already in the site is a `ContactPhoneTakenError`. */
  async insertManual(
    scope: WorkspaceScope,
    siteId: ObjectId,
    contact: NewManualContact,
    tx: Tx,
  ): Promise<ContactRecord> {
    try {
      const [created] = await this.contacts(scope).create(
        [
          {
            workspaceId: scope.workspaceId,
            siteId,
            name: contact.name,
            phone: contact.phone,
            email: null,
            search: contactSearchKeys({ name: contact.name, phone: contact.phone, email: null }),
            ownerId: null,
            tags: [],
            origin: contact.origin,
            marketing: contact.marketing,
            leadCount: 0,
            lastLead: null,
            lastActivityAt: contact.at,
            createdAt: contact.at,
            expiresAt: contact.expiresAt,
          },
        ],
        { session: tx },
      );
      if (!created) {
        throw new Error('Creating a contact returned no document');
      }
      return created.toObject();
    } catch (error) {
      if (isDuplicateKeyError(error, CONTACTS_PHONE_INDEX)) {
        throw new ContactPhoneTakenError({ cause: error });
      }
      throw error;
    }
  }

  findById(scope: WorkspaceRef, siteId: ObjectId, id: ObjectId): Promise<ContactRecord | null> {
    return this.contacts(scope)
      .findOne({ _id: id, workspaceId: scope.workspaceId, siteId })
      .lean<ContactRecord>()
      .exec();
  }

  findByIds(
    ref: WorkspaceRef,
    siteId: ObjectId,
    ids: readonly ObjectId[],
    tx?: Tx,
  ): Promise<ContactRecord[]> {
    return this.contacts(ref)
      .find({ _id: { $in: ids }, workspaceId: ref.workspaceId, siteId })
      .session(tx ?? null)
      .lean<ContactRecord[]>()
      .exec();
  }

  findByPhone(
    scope: WorkspaceScope,
    siteId: ObjectId,
    phone: string,
  ): Promise<Pick<ContactRecord, '_id' | 'name'> | null> {
    return this.contacts(scope)
      .findOne({ workspaceId: scope.workspaceId, siteId, phone })
      .select({ name: 1 })
      .lean<Pick<ContactRecord, '_id' | 'name'>>()
      .exec();
  }

  /** One keyset page of a view, the most recent interaction first. */
  async list(
    scope: WorkspaceScope,
    siteId: ObjectId,
    criteria: ContactCriteria,
    cursor: string | undefined,
    limit: number,
  ): Promise<KeysetPage<ContactRecord>> {
    const position = cursor === undefined ? null : decodeCursor(cursor);
    const records = await this.contacts(scope)
      .find({
        ...this.criteriaFilter(scope, siteId, criteria),
        ...(position === null
          ? {}
          : {
              $or: [
                { lastActivityAt: { $lt: position.createdAt } },
                {
                  lastActivityAt: position.createdAt,
                  _id: { $lt: new Types.ObjectId(position.id) },
                },
              ],
            }),
      })
      .sort(RECENT_FIRST)
      .limit(limit + 1)
      .lean<ContactRecord[]>()
      .exec();
    const items = records.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        records.length > limit && last
          ? encodeCursor({ createdAt: last.lastActivityAt, id: last._id.toHexString() })
          : null,
    };
  }

  /** How many profiles match, counting at most `limit` ("9.999+"). */
  count(
    scope: WorkspaceScope,
    siteId: ObjectId,
    criteria: ContactCriteria,
    limit: number,
  ): Promise<number> {
    return this.contacts(scope)
      .countDocuments(this.criteriaFilter(scope, siteId, criteria), { limit })
      .exec();
  }

  /** The tags the site uses, at most `SITE_CONTACT_TAGS_MAX` by construction. */
  async tags(scope: WorkspaceScope, siteId: ObjectId): Promise<string[]> {
    const tags = await this.contacts(scope)
      .distinct('tags', { workspaceId: scope.workspaceId, siteId })
      .exec();
    return tags.filter((tag): tag is string => typeof tag === 'string');
  }

  async hasTag(scope: WorkspaceScope, siteId: ObjectId, tag: string): Promise<boolean> {
    return (
      (await this.contacts(scope)
        .exists({ workspaceId: scope.workspaceId, siteId, tags: tag })
        .exec()) !== null
    );
  }

  /** "Giao cho…" / "Bỏ giao"; returns how many profiles were found. */
  async assign(
    scope: WorkspaceScope,
    siteId: ObjectId,
    ids: readonly ObjectId[],
    ownerId: ObjectId | null,
  ): Promise<number> {
    const result = await this.contacts(scope)
      .updateMany(
        { _id: { $in: ids }, workspaceId: scope.workspaceId, siteId },
        { $set: { ownerId } },
      )
      .exec();
    return result.matchedCount;
  }

  /**
   * "Gắn nhãn…": adds the tag to the profiles with room for it (`CONTACT_TAGS_MAX`); returns how
   * many have it now.
   */
  async addTag(
    scope: WorkspaceScope,
    siteId: ObjectId,
    ids: readonly ObjectId[],
    tag: string,
    maxTags: number,
  ): Promise<number> {
    const owned = { _id: { $in: ids }, workspaceId: scope.workspaceId, siteId };
    await this.contacts(scope)
      .updateMany(
        { ...owned, tags: { $ne: tag }, [`tags.${maxTags - 1}`]: { $exists: false } },
        { $push: { tags: tag } },
      )
      .exec();
    return this.contacts(scope)
      .countDocuments({ ...owned, tags: tag })
      .exec();
  }

  /** Other profiles of the site with this email, for "Có thể trùng" (ADR-033). */
  findByEmail(
    ref: WorkspaceRef,
    siteId: ObjectId,
    email: string,
    except: ObjectId,
    limit: number,
  ): Promise<ContactRecord[]> {
    return this.contacts(ref)
      .find({
        workspaceId: ref.workspaceId,
        siteId,
        'search.email': email,
        _id: { $ne: except },
      })
      .limit(limit)
      .lean<ContactRecord[]>()
      .exec();
  }

  /** Other profiles of the site with this normalized name. */
  findByName(
    ref: WorkspaceRef,
    siteId: ObjectId,
    name: string,
    except: ObjectId,
    limit: number,
  ): Promise<Pick<ContactRecord, '_id' | 'expiresAt'>[]> {
    return this.contacts(ref)
      .find({ workspaceId: ref.workspaceId, siteId, 'search.name': name, _id: { $ne: except } })
      .select({ expiresAt: 1 })
      .limit(limit)
      .lean<Pick<ContactRecord, '_id' | 'expiresAt'>[]>()
      .exec();
  }

  /**
   * "Gộp hai hồ sơ": deletes the profile merged away, then writes the merged fields on the one
   * kept, so the phone number may move between them. False when either was gone.
   */
  async merge(
    scope: WorkspaceScope,
    siteId: ObjectId,
    keep: ObjectId,
    drop: ObjectId,
    merged: MergedContact,
    months: RetentionMonths,
    tx: Tx,
  ): Promise<ContactRecord | null> {
    const owned = { workspaceId: scope.workspaceId, siteId };
    const removed = await this.contacts(scope)
      .deleteOne({ _id: drop, ...owned })
      .session(tx)
      .exec();
    if (removed.deletedCount !== 1) {
      return null;
    }
    return this.contacts(scope)
      .findOneAndUpdate(
        { _id: keep, ...owned },
        [{ $set: merged }, { $set: { expiresAt: expiryExpression(months) } }],
        { returnDocument: 'after', updatePipeline: true, session: tx },
      )
      .lean<ContactRecord>()
      .exec();
  }

  /** Recomputes every profile's expiry after the site's retention changed (ADR-017, ADR-033). */
  async recomputeExpiry(
    scope: WorkspaceScope,
    siteId: ObjectId,
    months: RetentionMonths,
  ): Promise<void> {
    await this.contacts(scope)
      .updateMany(
        { workspaceId: scope.workspaceId, siteId },
        [{ $set: { expiresAt: expiryExpression(months) } }],
        { updatePipeline: true },
      )
      .exec();
  }

  /** The intake's correction when the retention changed while it stored a lead. */
  async setPublicExpiry(ref: WorkspaceRef, id: ObjectId, months: RetentionMonths): Promise<void> {
    await this.contacts(ref)
      .updateOne(
        { _id: id, workspaceId: ref.workspaceId },
        [{ $set: { expiresAt: expiryExpression(months) } }],
        { updatePipeline: true },
      )
      .exec();
  }

  /**
   * Deletes the person's profiles: those their leads joined, and those with their phone number or
   * email (ADR-017, ADR-033). Returns the ids deleted, for their pairs.
   */
  async deletePerson(
    scope: WorkspaceScope,
    siteId: ObjectId,
    person: LeadPerson,
    linked: readonly ObjectId[],
    tx: Tx,
  ): Promise<ObjectId[]> {
    const filter = {
      workspaceId: scope.workspaceId,
      siteId,
      $or: [
        { _id: { $in: linked } },
        ...(person.phone === null ? [] : [{ 'search.phone': person.phone }]),
        ...(person.email === null ? [] : [{ 'search.email': person.email }]),
      ],
    };
    const found = await this.contacts(scope)
      .find(filter)
      .select({ _id: 1 })
      .session(tx)
      .lean<Pick<ContactRecord, '_id'>[]>()
      .exec();
    const ids = found.map((contact) => contact._id);
    if (ids.length > 0) {
      await this.contacts(scope)
        .deleteMany({ _id: { $in: ids }, workspaceId: scope.workspaceId })
        .session(tx)
        .exec();
    }
    return ids;
  }

  /** The person withdrew their agreement to offers (ADR-017): their profiles follow. */
  async withdrawMarketing(
    scope: WorkspaceScope,
    siteId: ObjectId,
    person: LeadPerson,
    tx: Tx,
  ): Promise<void> {
    const clauses = [
      ...(person.phone === null ? [] : [{ 'search.phone': person.phone }]),
      ...(person.email === null ? [] : [{ 'search.email': person.email }]),
    ];
    if (clauses.length === 0) {
      return;
    }
    await this.contacts(scope)
      .updateMany(
        { workspaceId: scope.workspaceId, siteId, $or: clauses },
        { $set: { marketing: { consented: false, at: null, recordedBy: null } } },
      )
      .session(tx)
      .exec();
  }

  private criteriaFilter(
    scope: WorkspaceScope,
    siteId: ObjectId,
    criteria: ContactCriteria,
  ): QueryFilter<ContactRecord> {
    return {
      workspaceId: scope.workspaceId,
      siteId,
      ...(criteria.ownerId === undefined ? {} : { ownerId: criteria.ownerId }),
      ...(criteria.tag === undefined ? {} : { tags: criteria.tag }),
      ...(criteria.search === null ? {} : searchFilter(criteria.search)),
    };
  }

  private contacts(ref: WorkspaceRef): Model<ContactRecord> {
    return this.databases.model(ref, CONTACT_COLLECTION);
  }
}
