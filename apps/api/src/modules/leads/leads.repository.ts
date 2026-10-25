import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { LeadNotificationErrorCode, LeadStatus, RetentionMonths } from '@plp/contracts';
import type { QueryFilter, Model } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import {
  afterCursor,
  type KeysetPage,
  NEWEST_FIRST,
  toKeysetPage,
} from '../../shared/persistence/keyset.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import type { LeadCriteria } from './domain/lead-filters.js';
import { type LeadQuery, type LeadSearchKeys, leadSearchKeys } from './domain/lead-search.js';
import {
  LEAD_MODEL,
  type LeadNotificationRecord,
  type LeadRecord,
  LEADS_SUBMISSION_INDEX,
} from './lead.schema.js';

export type NewLead = Omit<
  LeadRecord,
  '_id' | 'workspaceId' | 'siteId' | 'status' | 'note' | 'search' | 'notification'
> & { notification: LeadNotificationRecord };

/** How one notification attempt ended. */
export interface NotificationOutcome {
  status: 'sent' | 'pending' | 'failed';
  lastErrorCode: LeadNotificationErrorCode | null;
  sentAt: Date | null;
  recipients: number | null;
  at: Date;
}

/** A lead whose notification is waiting for an attempt. */
export type NotificationBacklogRow = Pick<LeadRecord, '_id' | 'notification'>;

/** Another request with the same `submissionId` stored the lead first. */
export class SubmissionTakenError extends Error {
  constructor(options: { cause: unknown }) {
    super('A lead with this submission id already exists', options);
    this.name = 'SubmissionTakenError';
  }
}

/** The minimum needed to check access to a lead through its site. */
export interface LeadAccessRef {
  id: ObjectId;
  workspaceId: ObjectId;
  siteId: ObjectId;
}

/** What a row of the inbox shows; the message, note and consent stay in the database. */
export type LeadListRow = Pick<LeadRecord, '_id' | 'pageId' | 'source' | 'status' | 'createdAt'> & {
  fields: Pick<LeadRecord['fields'], 'name' | 'phone'>;
  notification?: Pick<LeadNotificationRecord, 'status'>;
};

const LIST_PROJECTION = {
  pageId: 1,
  source: 1,
  status: 1,
  createdAt: 1,
  'fields.name': 1,
  'fields.phone': 1,
  'notification.status': 1,
} as const;

/**
 * A person, as the leads of a site know them (ADR-017): every lead with their phone number or
 * email (`LeadSearchKeys` form), and the lead the owner started from, which always belongs to them.
 */
export interface LeadPerson extends Pick<LeadSearchKeys, 'phone' | 'email'> {
  leadId: ObjectId | null;
}

/** Changes from the inbox; absent fields stay as they are. */
export interface LeadChanges {
  status?: LeadStatus | undefined;
  note?: string | undefined;
  spam?: boolean | undefined;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function searchFilter(search: LeadQuery): QueryFilter<LeadRecord> {
  switch (search.kind) {
    case 'phone':
      // Anchored literal prefixes, so each one is a range of the phone index.
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

function personFilter(person: LeadPerson): QueryFilter<LeadRecord> {
  return {
    $or: [
      ...(person.leadId === null ? [] : [{ _id: person.leadId }]),
      { 'search.phone': person.phone },
      ...(person.email === null ? [] : [{ 'search.email': person.email }]),
    ],
  };
}

@Injectable()
export class LeadsRepository {
  constructor(@InjectModel(LEAD_MODEL) private readonly leads: Model<LeadRecord>) {}

  /**
   * Stores a visitor's lead. Public intake has no member scope: the workspace comes from the site
   * record the subdomain resolved to, never from the request (ADR-003).
   */
  async insertPublic(
    site: { _id: ObjectId; workspaceId: ObjectId },
    lead: NewLead,
  ): Promise<LeadRecord> {
    try {
      const created = await this.leads.create({
        ...lead,
        workspaceId: site.workspaceId,
        siteId: site._id,
        status: 'new',
        note: '',
        search: leadSearchKeys(lead.fields),
      });
      return created.toObject();
    } catch (error) {
      if (isDuplicateKeyError(error, LEADS_SUBMISSION_INDEX)) {
        throw new SubmissionTakenError({ cause: error });
      }
      throw error;
    }
  }

  /** Whether the site already received this submission (a retry of the same form). */
  async existsPublicSubmission(siteId: ObjectId, submissionId: string): Promise<boolean> {
    return (await this.leads.exists({ siteId, submissionId }).exec()) !== null;
  }

  /**
   * Recomputes every lead's expiry after the site's retention changed (ADR-017), in one update:
   * `createdAt` plus the new period, or no expiry.
   */
  async recomputeExpiry(
    scope: WorkspaceScope,
    siteId: ObjectId,
    months: RetentionMonths,
  ): Promise<void> {
    const expiresAt =
      months === null
        ? null
        : { $dateAdd: { startDate: '$createdAt', unit: 'month', amount: months } };
    await this.leads
      .updateMany({ siteId, workspaceId: scope.workspaceId }, [{ $set: { expiresAt } }], {
        updatePipeline: true,
      })
      .exec();
  }

  /** Unscoped lookup by id that only returns where the lead lives, for access checks. */
  async findAccessRef(id: ObjectId): Promise<LeadAccessRef | null> {
    const lead = await this.leads
      .findById(id, { workspaceId: 1, siteId: 1 })
      .lean<Pick<LeadRecord, '_id' | 'workspaceId' | 'siteId'>>()
      .exec();
    return lead ? { id: lead._id, workspaceId: lead.workspaceId, siteId: lead.siteId } : null;
  }

  findById(scope: WorkspaceScope, id: ObjectId): Promise<LeadRecord | null> {
    return this.leads
      .findOne({ _id: id, workspaceId: scope.workspaceId })
      .lean<LeadRecord>()
      .exec();
  }

  /** The leads matching the inbox filters, newest first, one keyset page at a time. */
  async listForInbox(
    scope: WorkspaceScope,
    siteId: ObjectId,
    criteria: LeadCriteria,
    cursor: string | undefined,
    limit: number,
  ): Promise<KeysetPage<LeadListRow>> {
    const records = await this.leads
      .find({ $and: [this.criteriaFilter(scope, siteId, criteria), afterCursor(cursor)] })
      .select(LIST_PROJECTION)
      .sort(NEWEST_FIRST)
      .limit(limit + 1)
      .lean<LeadListRow[]>()
      .exec();
    return toKeysetPage(records, limit);
  }

  /**
   * How many leads match, counting at most `limit` (the caller shows "999+" beyond), so a count
   * never scans more than the index range it needs. `until` leaves out leads created after it.
   */
  countMatching(
    scope: WorkspaceScope,
    siteId: ObjectId,
    criteria: LeadCriteria,
    limit: number,
    until?: Date,
  ): Promise<number> {
    return this.leads
      .countDocuments(this.criteriaFilter(scope, siteId, criteria, until), { limit })
      .exec();
  }

  /**
   * The leads matching the filters and created up to `until`, newest first, at most `limit`; read
   * as a stream so an export never holds them all in memory.
   */
  async *streamMatching(
    scope: WorkspaceScope,
    siteId: ObjectId,
    criteria: LeadCriteria,
    until: Date,
    limit: number,
  ): AsyncGenerator<LeadRecord> {
    const cursor = this.leads
      .find(this.criteriaFilter(scope, siteId, criteria, until))
      .sort(NEWEST_FIRST)
      .limit(limit)
      .lean<LeadRecord[]>()
      .cursor();
    try {
      for await (const lead of cursor) {
        yield lead;
      }
    } finally {
      // A download that stops early (the client left) ends the iteration without exhausting the
      // cursor; close it, or the server cursor and its buffered batch stay open until timeout.
      await cursor.close();
    }
  }

  /**
   * Leads per page created since `since`, spam excluded (the column "LEAD 7 NGÀY"), in one
   * aggregation keyed by page id hex. Pages without leads are absent.
   */
  async countRecentByPage(
    scope: WorkspaceScope,
    siteId: ObjectId,
    since: Date,
  ): Promise<Map<string, number>> {
    const groups = await this.leads
      .aggregate<{ _id: ObjectId; count: number }>([
        {
          $match: {
            siteId,
            workspaceId: scope.workspaceId,
            'spam.suspected': false,
            createdAt: { $gte: since },
          },
        },
        { $group: { _id: '$pageId', count: { $sum: 1 } } },
      ])
      .exec();
    return new Map(groups.map((group) => [group._id.toHexString(), group.count]));
  }

  /** Applies inbox changes and returns the lead as it is now; null when it no longer exists. */
  update(scope: WorkspaceScope, id: ObjectId, changes: LeadChanges): Promise<LeadRecord | null> {
    return this.leads
      .findOneAndUpdate(
        { _id: id, workspaceId: scope.workspaceId },
        {
          $set: {
            ...(changes.status === undefined ? {} : { status: changes.status }),
            ...(changes.note === undefined ? {} : { note: changes.note }),
            ...(changes.spam === undefined ? {} : { 'spam.suspected': changes.spam }),
          },
        },
        { returnDocument: 'after' },
      )
      .lean<LeadRecord>()
      .exec();
  }

  /**
   * Takes a pending notification for one attempt and counts it. Unscoped: the sender runs in the
   * background. Null when the notification is not pending: already sent or failed, or another
   * instance of the API took it first (ADR-018).
   */
  claimNotification(leadId: ObjectId, now: Date): Promise<LeadRecord | null> {
    return this.leads
      .findOneAndUpdate(
        { _id: leadId, 'notification.status': 'pending' },
        {
          $set: { 'notification.status': 'sending', 'notification.updatedAt': now },
          $inc: { 'notification.attempts': 1 },
        },
        { returnDocument: 'after' },
      )
      .lean<LeadRecord>()
      .exec();
  }

  /**
   * Records how the attempt that claimed the lead ended. `attempts` is the count at that claim,
   * so an attempt the startup sweep gave to someone else cannot overwrite theirs.
   */
  async finishNotification(
    leadId: ObjectId,
    attempts: number,
    outcome: NotificationOutcome,
  ): Promise<void> {
    await this.leads
      .updateOne(
        { _id: leadId, 'notification.status': 'sending', 'notification.attempts': attempts },
        {
          $set: {
            'notification.status': outcome.status,
            'notification.lastErrorCode': outcome.lastErrorCode,
            'notification.sentAt': outcome.sentAt,
            'notification.recipients': outcome.recipients,
            'notification.updatedAt': outcome.at,
          },
        },
      )
      .exec();
  }

  /**
   * Notifications waiting for an attempt, and those whose sender stopped mid-way (`sending`
   * since before `staleBefore`), oldest first: the backlog an API instance takes on at startup.
   */
  findNotificationBacklog(staleBefore: Date, limit: number): Promise<NotificationBacklogRow[]> {
    return this.leads
      .find(
        {
          $or: [
            { 'notification.status': 'pending' },
            { 'notification.status': 'sending', 'notification.updatedAt': { $lt: staleBefore } },
          ],
        },
        { notification: 1 },
      )
      .sort({ 'notification.updatedAt': 1 })
      .limit(limit)
      .lean<NotificationBacklogRow[]>()
      .exec();
  }

  /** Puts a notification whose sender stopped back in the queue; false when it moved on. */
  async requeueStaleNotification(leadId: ObjectId, staleBefore: Date): Promise<boolean> {
    const result = await this.leads
      .updateOne(
        {
          _id: leadId,
          'notification.status': 'sending',
          'notification.updatedAt': { $lt: staleBefore },
        },
        { $set: { 'notification.status': 'pending', 'notification.updatedAt': new Date() } },
      )
      .exec();
    return result.modifiedCount === 1;
  }

  /**
   * "Gửi lại" on a failed notification: it starts over with no attempt counted. Null when it is
   * not failed (sent meanwhile) or the lead is gone.
   */
  resetFailedNotification(
    scope: WorkspaceScope,
    leadId: ObjectId,
    now: Date,
  ): Promise<LeadRecord | null> {
    return this.leads
      .findOneAndUpdate(
        { _id: leadId, workspaceId: scope.workspaceId, 'notification.status': 'failed' },
        {
          $set: {
            'notification.status': 'pending',
            'notification.attempts': 0,
            'notification.lastErrorCode': null,
            'notification.updatedAt': now,
          },
        },
        { returnDocument: 'after' },
      )
      .lean<LeadRecord>()
      .exec();
  }

  /** How many leads of the site belong to the person, counting at most `limit`. */
  countPerson(
    scope: WorkspaceScope,
    siteId: ObjectId,
    person: LeadPerson,
    limit: number,
  ): Promise<number> {
    return this.leads
      .countDocuments(
        { workspaceId: scope.workspaceId, siteId, ...personFilter(person) },
        { limit },
      )
      .exec();
  }

  /** The person's leads in the site, newest first, at most `limit`. */
  listPerson(
    scope: WorkspaceScope,
    siteId: ObjectId,
    person: LeadPerson,
    limit: number,
  ): Promise<LeadRecord[]> {
    return this.leads
      .find({ workspaceId: scope.workspaceId, siteId, ...personFilter(person) })
      .sort(NEWEST_FIRST)
      .limit(limit)
      .lean<LeadRecord[]>()
      .exec();
  }

  /** Deletes every lead of the person in the site and returns how many there were. */
  async deletePerson(
    scope: WorkspaceScope,
    siteId: ObjectId,
    person: LeadPerson,
    tx: Tx,
  ): Promise<number> {
    const result = await this.leads
      .deleteMany({ workspaceId: scope.workspaceId, siteId, ...personFilter(person) })
      .session(tx)
      .exec();
    return result.deletedCount;
  }

  private criteriaFilter(
    scope: WorkspaceScope,
    siteId: ObjectId,
    criteria: LeadCriteria,
    until?: Date,
  ): QueryFilter<LeadRecord> {
    const createdAt = {
      ...(criteria.createdIn === null
        ? {}
        : { $gte: criteria.createdIn.from, $lt: criteria.createdIn.to }),
      ...(until === undefined ? {} : { $lte: until }),
    };
    return {
      workspaceId: scope.workspaceId,
      siteId,
      'spam.suspected': criteria.spam,
      ...(criteria.pageId === null ? {} : { pageId: criteria.pageId }),
      ...(criteria.status === null ? {} : { status: criteria.status }),
      ...(Object.keys(createdAt).length === 0 ? {} : { createdAt }),
      ...(criteria.search === null ? {} : searchFilter(criteria.search)),
    };
  }
}
