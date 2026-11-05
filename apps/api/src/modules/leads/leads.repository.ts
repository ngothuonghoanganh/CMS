import { Injectable } from '@nestjs/common';
import type {
  InstantWindow,
  LeadNotificationErrorCode,
  LeadStatus,
  RetentionMonths,
  VnDay,
} from '@plp/contracts';
import { type QueryFilter, type Model, Types } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { CursorPosition } from '../../shared/cursor.js';
import {
  afterCursor,
  afterPosition,
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
  LEAD_COLLECTION,
  type LeadNotificationRecord,
  type LeadRecord,
  LEADS_SUBMISSION_INDEX,
} from './lead.schema.js';
import {
  WorkspaceDatabases,
  type WorkspaceRef,
} from '../../shared/persistence/workspace-databases.js';

export type NewLead = Omit<
  LeadRecord,
  '_id' | 'workspaceId' | 'siteId' | 'status' | 'note' | 'search' | 'notification'
> & { notification: LeadNotificationRecord };

/** How one notification attempt ended. */
export interface NotificationOutcome {
  status: 'sent' | 'pending' | 'failed' | 'skipped';
  lastErrorCode: LeadNotificationErrorCode | null;
  sentAt: Date | null;
  recipients: number | null;
  rejectedRecipients: number | null;
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

/** What a row of the inbox shows; the message, note and consent stay in the database. */
export type LeadListRow = Pick<LeadRecord, '_id' | 'pageId' | 'source' | 'status' | 'createdAt'> & {
  fields: Pick<LeadRecord['fields'], 'name' | 'phone'>;
  spam: Pick<LeadRecord['spam'], 'suspected'>;
  notification?: Pick<LeadNotificationRecord, 'status'>;
};

const LIST_PROJECTION = {
  pageId: 1,
  source: 1,
  status: 1,
  createdAt: 1,
  'fields.name': 1,
  'fields.phone': 1,
  'spam.suspected': 1,
  'notification.status': 1,
} as const;

/**
 * A person, as the leads of a site know them (ADR-017): every lead with their phone number or
 * email (`LeadSearchKeys` form), and the lead the owner started from, which always belongs to them.
 * A data request may know only one of the phone number and the email.
 */
export interface LeadPerson {
  leadId: ObjectId | null;
  phone: LeadSearchKeys['phone'] | null;
  email: LeadSearchKeys['email'];
}

/** A lead's name, phone number (E.164) and email, as the owner corrected them. */
export interface LeadContact {
  name: string;
  phone: string;
  email: string | null;
}

/** Leads not suspected of spam, as board 11 counts them (ADR-019). */
export interface LeadAnalyticsRows {
  /** Per Vietnamese day. */
  daily: Array<{ day: VnDay; leads: number }>;
  /** Per source pair and per page, over the current period only. */
  sources: Array<{ source: string; medium: string; leads: number }>;
  pages: Array<{ pageId: string; leads: number }>;
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
  const clauses: QueryFilter<LeadRecord>[] = [
    ...(person.leadId === null ? [] : [{ _id: person.leadId }]),
    ...(person.phone === null ? [] : [{ 'search.phone': person.phone }]),
    ...(person.email === null ? [] : [{ 'search.email': person.email }]),
  ];
  // Nobody to look for matches no lead (`$or` needs at least one clause).
  return clauses.length === 0 ? { _id: { $in: [] } } : { $or: clauses };
}

/** The person's leads, and the leads of their profiles whatever number or email those carry. */
function personOrProfilesFilter(
  person: LeadPerson,
  contactIds: readonly ObjectId[],
): QueryFilter<LeadRecord> {
  if (contactIds.length === 0) {
    return personFilter(person);
  }
  return { $or: [personFilter(person), { contactId: { $in: contactIds } }] };
}

/** A lead the background sender works on, with the workspace whose database holds it (ADR-025). */
export interface LeadRef extends WorkspaceRef {
  readonly leadId: ObjectId;
}

@Injectable()
export class LeadsRepository {
  constructor(private readonly databases: WorkspaceDatabases) {}

  /**
   * Stores a visitor's lead. Public intake has no member scope: the workspace comes from the site
   * record the subdomain resolved to, never from the request (ADR-003).
   */
  async insertPublic(
    site: { _id: ObjectId; workspaceId: ObjectId },
    lead: NewLead,
    tx?: Tx,
  ): Promise<LeadRecord> {
    try {
      const [created] = await this.leads(site).create(
        [
          {
            ...lead,
            workspaceId: site.workspaceId,
            siteId: site._id,
            status: 'new',
            note: '',
            search: leadSearchKeys(lead.fields),
          },
        ],
        tx === undefined ? {} : { session: tx },
      );
      if (!created) {
        throw new Error('Creating a lead returned no document');
      }
      return created.toObject();
    } catch (error) {
      if (isDuplicateKeyError(error, LEADS_SUBMISSION_INDEX)) {
        throw new SubmissionTakenError({ cause: error });
      }
      throw error;
    }
  }

  /**
   * Removes a lead the public intake just stored for a site deleted in the meantime: the deletion
   * did not see it, and nothing of the site may stay (ADR-027).
   */
  async deletePublic(ref: WorkspaceRef, siteId: ObjectId, id: ObjectId): Promise<void> {
    await this.leads(ref).deleteOne({ _id: id, workspaceId: ref.workspaceId, siteId }).exec();
  }

  /** Corrects the expiry of a lead the public intake just stored (see `LeadIntakeService`). */
  async setPublicExpiry(ref: WorkspaceRef, id: ObjectId, expiresAt: Date | null): Promise<void> {
    await this.leads(ref)
      .updateOne({ _id: id, workspaceId: ref.workspaceId }, { $set: { expiresAt } })
      .exec();
  }

  /**
   * Whether the site already received this submission (`submissionKey`): one probe of the unique
   * index, however many leads the site has. MongoDB uses a partial index only for a query that
   * implies its filter, which a plain equality does not, hence the type check. The hint holds the
   * plan: the planner's trial can tie this index with `siteId, createdAt`, and a plan cached from
   * that reads every lead of the site. The index exists before the API serves (`IndexBuilder`).
   */
  async existsPublicSubmission(
    ref: WorkspaceRef,
    siteId: ObjectId,
    submissionId: string,
  ): Promise<boolean> {
    const found = await this.leads(ref)
      .exists({
        workspaceId: ref.workspaceId,
        siteId,
        submissionId: { $eq: submissionId, $type: 'string' },
      })
      .hint(LEADS_SUBMISSION_INDEX)
      .exec();
    return found !== null;
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
    await this.leads(scope)
      .updateMany({ siteId, workspaceId: scope.workspaceId }, [{ $set: { expiresAt } }], {
        updatePipeline: true,
      })
      .exec();
  }

  findById(scope: WorkspaceScope, id: ObjectId): Promise<LeadRecord | null> {
    return this.leads(scope)
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
    const records = await this.leads(scope)
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
    return this.leads(scope)
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
    const cursor = this.leads(scope)
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
   * The releases the leads of a page refer to: the consent evidence that outlives the page when it
   * is deleted (ADR-027). Read in that transaction, on the inbox's page index.
   */
  async releaseIdsOfPage(
    scope: WorkspaceScope,
    siteId: ObjectId,
    pageId: ObjectId,
    tx: Tx,
  ): Promise<ObjectId[]> {
    return this.leads(scope)
      .distinct('releaseId', {
        siteId,
        pageId,
        workspaceId: scope.workspaceId,
      })
      .session(tx)
      .exec();
  }

  /** Every lead of the site, spam included: what deleting the site removes (ADR-027). */
  countForSite(scope: WorkspaceScope, siteId: ObjectId): Promise<number> {
    return this.leads(scope).countDocuments({ siteId, workspaceId: scope.workspaceId }).exec();
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
    const groups = await this.leads(scope)
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

  /**
   * Leads per site created in `window`, spam excluded, in one aggregation keyed by site id hex:
   * the "Lead 7 ngày qua" of each site's dashboard, for the Sites screen (ADR-028). Sites without
   * leads are absent.
   */
  async countRecentBySite(
    scope: WorkspaceScope,
    siteIds: readonly ObjectId[],
    window: InstantWindow,
  ): Promise<Map<string, number>> {
    if (siteIds.length === 0) {
      return new Map();
    }
    const groups = await this.leads(scope)
      .aggregate<{ _id: ObjectId; count: number }>([
        {
          $match: {
            workspaceId: scope.workspaceId,
            siteId: { $in: [...siteIds] },
            'spam.suspected': false,
            createdAt: { $gte: window.from, $lt: window.to },
          },
        },
        { $group: { _id: '$siteId', count: { $sum: 1 } } },
      ])
      .exec();
    return new Map(groups.map((group) => [group._id.toHexString(), group.count]));
  }

  /**
   * Leads not suspected of spam for board 11 (ADR-019), in one aggregation on the inbox index: per
   * Vietnamese day over `window`, per source pair and per page from `currentFrom` on. Moving a lead
   * in or out of spam shows at once.
   */
  async analyticsRows(
    scope: WorkspaceScope,
    siteId: ObjectId,
    pageId: ObjectId | null,
    window: InstantWindow,
    currentFrom: Date,
  ): Promise<LeadAnalyticsRows> {
    const [result] = await this.leads(scope)
      .aggregate<{
        daily: Array<{ _id: VnDay; leads: number }>;
        sources: Array<{ _id: { source: string; medium: string }; leads: number }>;
        pages: Array<{ _id: ObjectId; leads: number }>;
      }>([
        {
          $match: {
            workspaceId: scope.workspaceId,
            siteId,
            'spam.suspected': false,
            createdAt: { $gte: window.from, $lt: window.to },
            ...(pageId === null ? {} : { pageId }),
          },
        },
        {
          $facet: {
            daily: [
              {
                $group: {
                  // Vietnam has no daylight saving time: +07:00 all year (calendar.ts).
                  _id: {
                    $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: '+07:00' },
                  },
                  leads: { $sum: 1 },
                },
              },
            ],
            sources: [
              { $match: { createdAt: { $gte: currentFrom } } },
              {
                $group: {
                  _id: { source: '$source.source', medium: '$source.medium' },
                  leads: { $sum: 1 },
                },
              },
            ],
            pages: [
              { $match: { createdAt: { $gte: currentFrom } } },
              { $group: { _id: '$pageId', leads: { $sum: 1 } } },
            ],
          },
        },
      ])
      .exec();
    return {
      daily: (result?.daily ?? []).map((row) => ({ day: row._id, leads: row.leads })),
      sources: (result?.sources ?? []).map((row) => ({ ...row._id, leads: row.leads })),
      pages: (result?.pages ?? []).map((row) => ({
        pageId: row._id.toHexString(),
        leads: row.leads,
      })),
    };
  }

  /** Applies inbox changes and returns the lead as it is now; null when it no longer exists. */
  update(scope: WorkspaceScope, id: ObjectId, changes: LeadChanges): Promise<LeadRecord | null> {
    return this.leads(scope)
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
   * background, with the workspace of the lead it was given. Null when the notification is not
   * pending: already sent or failed, or another instance of the API took it first (ADR-018).
   */
  claimNotification(lead: LeadRef, now: Date): Promise<LeadRecord | null> {
    return this.leads(lead)
      .findOneAndUpdate(
        { _id: lead.leadId, workspaceId: lead.workspaceId, 'notification.status': 'pending' },
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
    lead: LeadRef,
    attempts: number,
    outcome: NotificationOutcome,
  ): Promise<void> {
    await this.leads(lead)
      .updateOne(
        {
          _id: lead.leadId,
          workspaceId: lead.workspaceId,
          'notification.status': 'sending',
          'notification.attempts': attempts,
        },
        {
          $set: {
            'notification.status': outcome.status,
            'notification.lastErrorCode': outcome.lastErrorCode,
            'notification.sentAt': outcome.sentAt,
            'notification.recipients': outcome.recipients,
            'notification.rejectedRecipients': outcome.rejectedRecipients,
            'notification.updatedAt': outcome.at,
          },
        },
      )
      .exec();
  }

  /**
   * Notifications of one workspace waiting for an attempt, and those whose sender stopped mid-way
   * (`sending` since before `staleBefore`), oldest first: the backlog an API instance takes on at
   * startup.
   */
  findNotificationBacklog(
    ref: WorkspaceRef,
    staleBefore: Date,
    limit: number,
  ): Promise<NotificationBacklogRow[]> {
    return this.leads(ref)
      .find(
        {
          workspaceId: ref.workspaceId,
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
  async requeueStaleNotification(lead: LeadRef, staleBefore: Date): Promise<boolean> {
    const result = await this.leads(lead)
      .updateOne(
        {
          _id: lead.leadId,
          workspaceId: lead.workspaceId,
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
   * not failed (sent meanwhile), the lead was moved to spam (never emailed), or it is gone.
   */
  resetFailedNotification(
    scope: WorkspaceScope,
    leadId: ObjectId,
    now: Date,
  ): Promise<LeadRecord | null> {
    return this.leads(scope)
      .findOneAndUpdate(
        {
          _id: leadId,
          workspaceId: scope.workspaceId,
          'notification.status': 'failed',
          'spam.suspected': false,
        },
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

  /**
   * How many leads of the site belong to each person, counting at most `limit` each (the caller
   * shows "999+"), in one aggregation for a page of data requests rather than one count each.
   * Each person is counted by their own sub-pipeline, which uses the search indexes and stops at
   * `limit`; a lead matching by both phone number and email counts once.
   */
  async countPeople(
    scope: WorkspaceScope,
    siteId: ObjectId,
    people: readonly LeadPerson[],
    limit: number,
  ): Promise<number[]> {
    if (people.length === 0) {
      return [];
    }
    const counted = await this.leads(scope)
      .aggregate<{ person: number; count: number }>([
        // Starts from nothing; each person's count is unioned in.
        { $match: { _id: { $in: [] } } },
        ...people.map((person, index) => ({
          $unionWith: {
            coll: this.leads(scope).collection.collectionName,
            pipeline: [
              { $match: { workspaceId: scope.workspaceId, siteId, ...personFilter(person) } },
              { $limit: limit },
              { $count: 'count' },
              { $set: { person: index } },
            ],
          },
        })),
      ])
      .exec();
    // `$count` emits nothing for a person without leads.
    const byPerson = new Map(counted.map((row) => [row.person, row.count]));
    return people.map((_person, index) => byPerson.get(index) ?? 0);
  }

  /** How many leads of the site belong to the person, counting at most `limit`. */
  countPerson(
    scope: WorkspaceScope,
    siteId: ObjectId,
    person: LeadPerson,
    limit: number,
  ): Promise<number> {
    return this.leads(scope)
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
    return this.leads(scope)
      .find({ workspaceId: scope.workspaceId, siteId, ...personFilter(person) })
      .sort(NEWEST_FIRST)
      .limit(limit)
      .lean<LeadRecord[]>()
      .exec();
  }

  /**
   * Records that the person withdrew their marketing consent (ADR-017) on each of their leads that
   * had it, and returns how many changed. The consent they gave stays as evidence.
   */
  async withdrawMarketing(
    scope: WorkspaceScope,
    siteId: ObjectId,
    person: LeadPerson,
    at: Date,
    tx: Tx,
  ): Promise<number> {
    const result = await this.leads(scope)
      .updateMany(
        {
          workspaceId: scope.workspaceId,
          siteId,
          ...personFilter(person),
          'consent.marketing': true,
          'consent.marketingWithdrawnAt': null,
        },
        { $set: { 'consent.marketingWithdrawnAt': at } },
      )
      .session(tx)
      .exec();
    return result.modifiedCount;
  }

  /**
   * Corrects the lead's name, phone number and email, with the search keys that find it and its
   * person. Null when the lead no longer exists.
   */
  updateContact(
    scope: WorkspaceScope,
    id: ObjectId,
    contact: LeadContact,
  ): Promise<LeadRecord | null> {
    return this.leads(scope)
      .findOneAndUpdate(
        { _id: id, workspaceId: scope.workspaceId },
        {
          $set: {
            'fields.name': contact.name,
            'fields.phone': contact.phone,
            'fields.email': contact.email,
            search: leadSearchKeys(contact),
          },
        },
        { returnDocument: 'after' },
      )
      .lean<LeadRecord>()
      .exec();
  }

  /**
   * Joins a lead to its customer profile (ADR-033). False when it already joined one: a backfill on
   * another instance got there first, and the caller's transaction must not count it twice.
   */
  async linkContact(
    ref: WorkspaceRef,
    leadId: ObjectId,
    contactId: ObjectId,
    tx: Tx,
  ): Promise<boolean> {
    const result = await this.leads(ref)
      .updateOne(
        { _id: leadId, workspaceId: ref.workspaceId, contactId: null },
        { $set: { contactId } },
      )
      .session(tx)
      .exec();
    return result.modifiedCount === 1;
  }

  /**
   * Joins the lead to its opportunity, whose stage becomes its status (ADR-033). False when it
   * had joined one already: the caller's transaction must not count it again.
   */
  async linkOpportunity(
    ref: WorkspaceRef,
    leadId: ObjectId,
    opportunityId: ObjectId,
    stage: LeadStatus,
    tx: Tx,
  ): Promise<boolean> {
    const result = await this.leads(ref)
      .updateOne(
        { _id: leadId, workspaceId: ref.workspaceId, opportunityId: null },
        { $set: { opportunityId, status: stage } },
      )
      .session(tx)
      .exec();
    return result.modifiedCount === 1;
  }

  /** The opportunity moved: every lead of it shows the new stage as its status. */
  async setStatusOfOpportunity(
    ref: WorkspaceRef,
    opportunityId: ObjectId,
    stage: LeadStatus,
    tx: Tx,
  ): Promise<void> {
    await this.leads(ref)
      .updateMany({ workspaceId: ref.workspaceId, opportunityId }, { $set: { status: stage } })
      .session(tx)
      .exec();
  }

  /**
   * Leads without an opportunity, oldest first, after a position: the startup backfill
   * (ADR-033). Suspected spam is passed over and never joins one, so the position moves past it.
   */
  listWithoutOpportunity(
    ref: WorkspaceRef,
    after: { createdAt: Date; id: ObjectId } | null,
    until: Date,
    limit: number,
  ): Promise<LeadRecord[]> {
    return this.leads(ref)
      .find({
        workspaceId: ref.workspaceId,
        opportunityId: null,
        createdAt: { $lte: until },
        ...(after === null
          ? {}
          : {
              $or: [
                { createdAt: { $gt: after.createdAt } },
                { createdAt: after.createdAt, _id: { $gt: after.id } },
              ],
            }),
      })
      .sort({ createdAt: 1, _id: 1 })
      .limit(limit)
      .lean<LeadRecord[]>()
      .exec();
  }

  /**
   * "Chưa liên lạc được" before K3 becomes "Thua" (ADR-033), once per workspace: the leads that
   * join an opportunity take its stage, suspected spam keeps this one.
   */
  async migrateUnreachable(ref: WorkspaceRef): Promise<void> {
    // The old value is no longer a status the model knows, so the driver writes it.
    await this.leads(ref).collection.updateMany(
      { workspaceId: ref.workspaceId, status: 'unreachable' },
      { $set: { status: 'lost' } },
    );
  }

  /** "Gộp hai hồ sơ": the merged profile's leads go to the one kept, untouched otherwise. */
  async moveToContact(
    scope: WorkspaceScope,
    siteId: ObjectId,
    from: ObjectId,
    to: ObjectId,
    tx: Tx,
  ): Promise<void> {
    await this.leads(scope)
      .updateMany(
        { workspaceId: scope.workspaceId, siteId, contactId: from },
        { $set: { contactId: to } },
      )
      .session(tx)
      .exec();
  }

  /** A profile's leads strictly after a position, newest first: its timeline (board 23). */
  listOfContact(
    scope: WorkspaceScope,
    siteId: ObjectId,
    contactId: ObjectId,
    after: CursorPosition | null,
    limit: number,
  ): Promise<LeadRecord[]> {
    return this.leads(scope)
      .find({
        workspaceId: scope.workspaceId,
        siteId,
        contactId,
        ...(after === null ? {} : afterPosition(after)),
      })
      .sort(NEWEST_FIRST)
      .limit(limit)
      .lean<LeadRecord[]>()
      .exec();
  }

  /** The latest lead of a profile: its consent evidence ("Đồng ý", board 23). */
  latestOfContact(
    scope: WorkspaceScope,
    siteId: ObjectId,
    contactId: ObjectId,
  ): Promise<LeadRecord | null> {
    return this.leads(scope)
      .findOne({ workspaceId: scope.workspaceId, siteId, contactId })
      .sort(NEWEST_FIRST)
      .lean<LeadRecord>()
      .exec();
  }

  /**
   * Leads of these profiles on a page within a time window, for "cùng đăng ký trang … trong N
   * ngày" (ADR-033), on the inbox's page index.
   */
  findOnPage(
    ref: WorkspaceRef,
    siteId: ObjectId,
    pageId: ObjectId,
    contactIds: readonly ObjectId[],
    window: { from: Date; to: Date },
    limit: number,
  ): Promise<Pick<LeadRecord, 'contactId' | 'createdAt'>[]> {
    return this.leads(ref)
      .find({
        workspaceId: ref.workspaceId,
        siteId,
        pageId,
        'spam.suspected': false,
        createdAt: { $gte: window.from, $lte: window.to },
        contactId: { $in: contactIds },
      })
      .select({ contactId: 1, createdAt: 1 })
      .limit(limit)
      .lean<Pick<LeadRecord, 'contactId' | 'createdAt'>[]>()
      .exec();
  }

  /** The profiles the person's leads joined, for deleting the person (ADR-017, ADR-033). */
  async contactIdsOfPerson(
    scope: WorkspaceScope,
    siteId: ObjectId,
    person: LeadPerson,
    tx?: Tx,
  ): Promise<ObjectId[]> {
    const ids = await this.leads(scope)
      .distinct('contactId', {
        workspaceId: scope.workspaceId,
        siteId,
        ...personFilter(person),
      })
      .session(tx ?? null)
      .exec();
    return ids.filter((id): id is ObjectId => id instanceof Types.ObjectId);
  }

  /**
   * Deletes every lead of the person in the site, and every lead of their profiles (ADR-033), and
   * returns how many there were.
   */
  async deletePerson(
    scope: WorkspaceScope,
    siteId: ObjectId,
    person: LeadPerson,
    contactIds: readonly ObjectId[],
    tx: Tx,
  ): Promise<number> {
    const result = await this.leads(scope)
      .deleteMany({
        workspaceId: scope.workspaceId,
        siteId,
        ...personOrProfilesFilter(person, contactIds),
      })
      .session(tx)
      .exec();
    return result.deletedCount;
  }

  /** How many leads `deletePerson` would delete, at most `limit`. */
  countPersonOrProfiles(
    scope: WorkspaceScope,
    siteId: ObjectId,
    person: LeadPerson,
    contactIds: readonly ObjectId[],
    limit: number,
  ): Promise<number> {
    return this.leads(scope)
      .countDocuments(
        { workspaceId: scope.workspaceId, siteId, ...personOrProfilesFilter(person, contactIds) },
        { limit },
      )
      .exec();
  }

  /** The leads `deletePerson` would delete, newest first, at most `limit`: a profile's export. */
  listPersonOrProfiles(
    scope: WorkspaceScope,
    siteId: ObjectId,
    person: LeadPerson,
    contactIds: readonly ObjectId[],
    limit: number,
  ): Promise<LeadRecord[]> {
    return this.leads(scope)
      .find({
        workspaceId: scope.workspaceId,
        siteId,
        ...personOrProfilesFilter(person, contactIds),
      })
      .sort(NEWEST_FIRST)
      .limit(limit)
      .lean<LeadRecord[]>()
      .exec();
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

  private leads(ref: WorkspaceRef): Model<LeadRecord> {
    return this.databases.model(ref, LEAD_COLLECTION);
  }
}
