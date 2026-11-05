import { Injectable } from '@nestjs/common';
import { type Model, type PipelineStage, Types } from 'mongoose';
import type { CursorPosition } from '../../shared/cursor.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  WorkspaceDatabases,
  type WorkspaceRef,
} from '../../shared/persistence/workspace-databases.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { CONTACT_COLLECTION } from './contact.schema.js';
import { OPPORTUNITY_COLLECTION, type OpportunityRecord } from './opportunity.schema.js';
import {
  CONTACT_EVENT_COLLECTION,
  type ContactEventRecord,
  MEETING_COLLECTION,
  type MeetingRecord,
  type MeetingSnapshot,
  type StageSnapshot,
  TASK_COLLECTION,
  type TaskRecord,
} from './profile.schema.js';

/** A profile's records follow its expiry once they lag behind it by more than this (ADR-033). */
const EXPIRY_SLACK_MS = 24 * 60 * 60 * 1000;

/** A task as "Thêm công việc" creates it. */
export interface NewTask {
  /** The profile's open opportunity the task belongs to, if any: "Thua" closes its tasks. */
  opportunityId: ObjectId | null;
  title: string;
  dueAt: Date;
  assigneeId: ObjectId;
  createdBy: ObjectId;
  at: Date;
  expiresAt: Date | null;
}

/** How many records a profile holds, for "Xóa dữ liệu của người này". */
export interface ContactRecordCounts {
  opportunities: number;
  notes: number;
  tasks: number;
  meetings: number;
}

/** Everything the profiles hold, for "Xuất dữ liệu của người này". */
export interface ContactRecordsExport {
  opportunities: OpportunityRecord[];
  notes: ContactEventRecord[];
  tasks: TaskRecord[];
  meetings: MeetingRecord[];
}

/**
 * The notes, tasks and meetings of profiles (board 23, ADR-033), and the timeline entries they
 * write. Every read starts from one profile of one site; a profile's records go, move and expire
 * with it.
 */
@Injectable()
export class ContactRecordsRepository {
  constructor(private readonly databases: WorkspaceDatabases) {}

  async insertNote(
    scope: WorkspaceScope,
    siteId: ObjectId,
    contactId: ObjectId,
    text: string,
    at: Date,
    expiresAt: Date | null,
    tx: Tx,
  ): Promise<ContactEventRecord> {
    const [created] = await this.eventModel(scope).create(
      [
        {
          workspaceId: scope.workspaceId,
          siteId,
          contactId,
          kind: 'note',
          text,
          meetingId: null,
          meeting: null,
          stage: null,
          at,
          actorId: scope.userId,
          expiresAt,
        },
      ],
      { session: tx },
    );
    if (!created) {
      throw new Error('Creating a note returned nothing');
    }
    return created.toObject<ContactEventRecord>();
  }

  /** Books the meeting and writes its timeline entry, in the caller's transaction. */
  async insertMeeting(
    scope: WorkspaceScope,
    siteId: ObjectId,
    contactId: ObjectId,
    meeting: MeetingSnapshot,
    at: Date,
    expiresAt: Date | null,
    tx: Tx,
  ): Promise<{ meeting: MeetingRecord; event: ContactEventRecord }> {
    const owned = { workspaceId: scope.workspaceId, siteId, contactId, expiresAt };
    const [booked] = await this.meetings(scope).create(
      [{ ...owned, ...meeting, opportunityId: null, createdBy: scope.userId, createdAt: at }],
      { session: tx },
    );
    if (!booked) {
      throw new Error('Booking a meeting returned nothing');
    }
    const [event] = await this.eventModel(scope).create(
      [
        {
          ...owned,
          kind: 'meeting',
          text: null,
          stage: null,
          meetingId: booked._id,
          meeting,
          at,
          actorId: scope.userId,
        },
      ],
      { session: tx },
    );
    if (!event) {
      throw new Error('Writing a meeting entry returned nothing');
    }
    return {
      meeting: booked.toObject<MeetingRecord>(),
      event: event.toObject<ContactEventRecord>(),
    };
  }

  async insertTask(
    scope: WorkspaceScope,
    siteId: ObjectId,
    contactId: ObjectId,
    task: NewTask,
    tx: Tx,
  ): Promise<TaskRecord> {
    const [created] = await this.tasks(scope).create(
      [
        {
          workspaceId: scope.workspaceId,
          siteId,
          contactId,
          opportunityId: task.opportunityId,
          title: task.title,
          dueAt: task.dueAt,
          assigneeId: task.assigneeId,
          doneAt: null,
          createdBy: task.createdBy,
          source: 'user',
          createdAt: task.at,
          expiresAt: task.expiresAt,
        },
      ],
      { session: tx },
    );
    if (!created) {
      throw new Error('Creating a task returned nothing');
    }
    return created.toObject<TaskRecord>();
  }

  countOpenTasks(
    scope: WorkspaceScope,
    siteId: ObjectId,
    contactId: ObjectId,
    limit: number,
    tx?: Tx,
  ): Promise<number> {
    return this.tasks(scope)
      .countDocuments({ ...this.of(scope, siteId, contactId), doneAt: null }, { limit })
      .session(tx ?? null)
      .exec();
  }

  countUpcomingMeetings(
    scope: WorkspaceScope,
    siteId: ObjectId,
    contactId: ObjectId,
    from: Date,
    limit: number,
    tx?: Tx,
  ): Promise<number> {
    return this.meetings(scope)
      .countDocuments({ ...this.of(scope, siteId, contactId), at: { $gte: from } }, { limit })
      .session(tx ?? null)
      .exec();
  }

  /** Ticks the task done (now) or opens it again; null when it is not one of the profile's. */
  setTaskDone(
    scope: WorkspaceScope,
    siteId: ObjectId,
    contactId: ObjectId,
    taskId: ObjectId,
    doneAt: Date | null,
  ): Promise<TaskRecord | null> {
    return this.tasks(scope)
      .findOneAndUpdate(
        { _id: taskId, ...this.of(scope, siteId, contactId) },
        { $set: { doneAt } },
        { returnDocument: 'after' },
      )
      .lean<TaskRecord>()
      .exec();
  }

  /** The open tasks by due time, then the latest done ones. */
  async tasksOf(
    scope: WorkspaceScope,
    siteId: ObjectId,
    contactId: ObjectId,
    openLimit: number,
    doneLimit: number,
  ): Promise<TaskRecord[]> {
    const owned = this.of(scope, siteId, contactId);
    const [open, done] = await Promise.all([
      this.tasks(scope)
        .find({ ...owned, doneAt: null })
        .sort({ dueAt: 1, _id: 1 })
        .limit(openLimit)
        .lean<TaskRecord[]>()
        .exec(),
      this.tasks(scope)
        .find({ ...owned, doneAt: { $ne: null } })
        .sort({ doneAt: -1, _id: -1 })
        .limit(doneLimit)
        .lean<TaskRecord[]>()
        .exec(),
    ]);
    return [...open, ...done];
  }

  upcomingMeetings(
    scope: WorkspaceScope,
    siteId: ObjectId,
    contactId: ObjectId,
    from: Date,
    limit: number,
  ): Promise<MeetingRecord[]> {
    return this.meetings(scope)
      .find({ ...this.of(scope, siteId, contactId), at: { $gte: from } })
      .sort({ at: 1, _id: 1 })
      .limit(limit)
      .lean<MeetingRecord[]>()
      .exec();
  }

  /** Timeline entries strictly after `after` (newest first), at most `limit`. */
  timeline(
    scope: WorkspaceScope,
    siteId: ObjectId,
    contactId: ObjectId,
    after: CursorPosition | null,
    limit: number,
  ): Promise<ContactEventRecord[]> {
    return this.eventModel(scope)
      .find({
        ...this.of(scope, siteId, contactId),
        ...(after === null
          ? {}
          : {
              $or: [
                { at: { $lt: after.createdAt } },
                { at: after.createdAt, _id: { $lt: new Types.ObjectId(after.id) } },
              ],
            }),
      })
      .sort({ at: -1, _id: -1 })
      .limit(limit)
      .lean<ContactEventRecord[]>()
      .exec();
  }

  /**
   * Moves the records of the profile to its later expiry once they lag behind by more than a day,
   * so a note does not rewrite every record of the profile (ADR-033). Each read starts from the
   * `contactId` prefix of the collection's profile index. The profile's expiry only
   * moves later between two changes of the retention, which `alignSite` follows.
   */
  async alignExpiry(
    ref: WorkspaceRef,
    siteId: ObjectId,
    contactId: ObjectId,
    expiresAt: Date | null,
    tx?: Tx,
  ): Promise<void> {
    if (expiresAt === null) {
      return;
    }
    const lagging = {
      workspaceId: ref.workspaceId,
      siteId,
      contactId,
      expiresAt: { $lt: new Date(expiresAt.getTime() - EXPIRY_SLACK_MS) },
    };
    const update = { $set: { expiresAt } };
    await this.opportunities(ref)
      .updateMany(lagging, update)
      .session(tx ?? null)
      .exec();
    await this.eventModel(ref)
      .updateMany(lagging, update)
      .session(tx ?? null)
      .exec();
    await this.tasks(ref)
      .updateMany(lagging, update)
      .session(tx ?? null)
      .exec();
    await this.meetings(ref)
      .updateMany(lagging, update)
      .session(tx ?? null)
      .exec();
  }

  /**
   * Gives every record of the site its profile's expiry, after the retention changed (ADR-017).
   * One statement per collection, run by the database; `$merge` cannot run in a transaction, and
   * the retention is committed before the profiles are recomputed.
   */
  async alignSite(scope: WorkspaceScope, siteId: ObjectId): Promise<void> {
    const contacts = this.databases.model(scope, CONTACT_COLLECTION).collection.collectionName;
    const stagesInto = (into: string): PipelineStage[] => [
      { $match: { workspaceId: scope.workspaceId, siteId } },
      {
        $lookup: {
          from: contacts,
          localField: 'contactId',
          foreignField: '_id',
          pipeline: [{ $project: { expiresAt: 1 } }],
          as: 'contact',
        },
      },
      { $unwind: '$contact' },
      { $project: { expiresAt: '$contact.expiresAt' } },
      { $merge: { into, on: '_id', whenMatched: 'merge', whenNotMatched: 'discard' } },
    ];
    const opportunities = this.opportunities(scope);
    const events = this.eventModel(scope);
    const tasks = this.tasks(scope);
    const meetings = this.meetings(scope);
    await opportunities.aggregate(stagesInto(opportunities.collection.collectionName)).exec();
    await events.aggregate(stagesInto(events.collection.collectionName)).exec();
    await tasks.aggregate(stagesInto(tasks.collection.collectionName)).exec();
    await meetings.aggregate(stagesInto(meetings.collection.collectionName)).exec();
  }

  /** "Gộp hai hồ sơ": the records of the profile merged away go to the one kept. */
  async moveToContact(
    scope: WorkspaceScope,
    siteId: ObjectId,
    from: ObjectId,
    to: ObjectId,
    tx: Tx,
  ): Promise<void> {
    const filter = { workspaceId: scope.workspaceId, siteId, contactId: from };
    const update = { $set: { contactId: to } };
    await this.opportunities(scope).updateMany(filter, update).session(tx).exec();
    await this.eventModel(scope).updateMany(filter, update).session(tx).exec();
    await this.tasks(scope).updateMany(filter, update).session(tx).exec();
    await this.meetings(scope).updateMany(filter, update).session(tx).exec();
  }

  /** The records of profiles deleted with their person (ADR-017). */
  async deleteForContacts(
    ref: WorkspaceRef,
    siteId: ObjectId,
    contactIds: readonly ObjectId[],
    tx: Tx,
  ): Promise<void> {
    if (contactIds.length === 0) {
      return;
    }
    const filter = { workspaceId: ref.workspaceId, siteId, contactId: { $in: contactIds } };
    await this.opportunities(ref).deleteMany(filter).session(tx).exec();
    await this.eventModel(ref).deleteMany(filter).session(tx).exec();
    await this.tasks(ref).deleteMany(filter).session(tx).exec();
    await this.meetings(ref).deleteMany(filter).session(tx).exec();
  }

  async counts(
    scope: WorkspaceScope,
    siteId: ObjectId,
    contactIds: readonly ObjectId[],
  ): Promise<ContactRecordCounts> {
    const filter = { workspaceId: scope.workspaceId, siteId, contactId: { $in: contactIds } };
    const [opportunities, notes, tasks, meetings] = await Promise.all([
      this.opportunities(scope).countDocuments(filter).exec(),
      this.eventModel(scope)
        .countDocuments({ ...filter, kind: 'note' })
        .exec(),
      this.tasks(scope).countDocuments(filter).exec(),
      this.meetings(scope).countDocuments(filter).exec(),
    ]);
    return { opportunities, notes, tasks, meetings };
  }

  /** At most `limit` of each kind, oldest first. */
  async exportOf(
    scope: WorkspaceScope,
    siteId: ObjectId,
    contactIds: readonly ObjectId[],
    limit: number,
  ): Promise<ContactRecordsExport> {
    const filter = { workspaceId: scope.workspaceId, siteId, contactId: { $in: contactIds } };
    const [opportunities, notes, tasks, meetings] = await Promise.all([
      this.opportunities(scope)
        .find(filter)
        .sort({ createdAt: 1, _id: 1 })
        .limit(limit)
        .lean<OpportunityRecord[]>()
        .exec(),
      this.eventModel(scope)
        .find({ ...filter, kind: 'note' })
        .sort({ at: 1, _id: 1 })
        .limit(limit)
        .lean<ContactEventRecord[]>()
        .exec(),
      this.tasks(scope)
        .find(filter)
        .sort({ createdAt: 1, _id: 1 })
        .limit(limit)
        .lean<TaskRecord[]>()
        .exec(),
      this.meetings(scope)
        .find(filter)
        .sort({ at: 1, _id: 1 })
        .limit(limit)
        .lean<MeetingRecord[]>()
        .exec(),
    ]);
    return { opportunities, notes, tasks, meetings };
  }

  /** "Cơ hội chuyển sang …", in the caller's transaction; a null actor is the intake. */
  async insertStageEvent(
    ref: WorkspaceRef,
    siteId: ObjectId,
    contactId: ObjectId,
    stage: StageSnapshot,
    actorId: ObjectId | null,
    at: Date,
    expiresAt: Date | null,
    tx: Tx,
  ): Promise<void> {
    await this.eventModel(ref).create(
      [
        {
          workspaceId: ref.workspaceId,
          siteId,
          contactId,
          kind: 'stage',
          text: null,
          meetingId: null,
          meeting: null,
          stage,
          at,
          actorId,
          expiresAt,
        },
      ],
      { session: tx },
    );
  }

  /** "Đánh dấu thua" closes the opportunity's open tasks (ADR-033). */
  async closeTasksOfOpportunity(
    scope: WorkspaceScope,
    siteId: ObjectId,
    opportunityId: ObjectId,
    at: Date,
    tx: Tx,
  ): Promise<void> {
    await this.tasks(scope)
      .updateMany(
        { workspaceId: scope.workspaceId, siteId, opportunityId, doneAt: null },
        { $set: { doneAt: at } },
      )
      .session(tx)
      .exec();
  }

  /** The open task due first of each profile: "Việc tiếp theo" of the pipeline's cards. */
  async nextTasks(
    scope: WorkspaceScope,
    siteId: ObjectId,
    contactIds: readonly ObjectId[],
  ): Promise<Map<string, { title: string; dueAt: Date }>> {
    if (contactIds.length === 0) {
      return new Map();
    }
    const rows = await this.tasks(scope)
      .aggregate<{ _id: ObjectId; title: string; dueAt: Date }>([
        {
          $match: {
            workspaceId: scope.workspaceId,
            siteId,
            contactId: { $in: contactIds },
            doneAt: null,
          },
        },
        { $sort: { contactId: 1, dueAt: 1, _id: 1 } },
        { $group: { _id: '$contactId', title: { $first: '$title' }, dueAt: { $first: '$dueAt' } } },
      ])
      .exec();
    return new Map(rows.map((row) => [row._id.toHexString(), row]));
  }

  private of(scope: WorkspaceRef, siteId: ObjectId, contactId: ObjectId) {
    return { workspaceId: scope.workspaceId, siteId, contactId };
  }

  private eventModel(ref: WorkspaceRef): Model<ContactEventRecord> {
    return this.databases.model(ref, CONTACT_EVENT_COLLECTION);
  }

  private opportunities(ref: WorkspaceRef): Model<OpportunityRecord> {
    return this.databases.model(ref, OPPORTUNITY_COLLECTION);
  }

  private tasks(ref: WorkspaceRef): Model<TaskRecord> {
    return this.databases.model(ref, TASK_COLLECTION);
  }

  private meetings(ref: WorkspaceRef): Model<MeetingRecord> {
    return this.databases.model(ref, MEETING_COLLECTION);
  }
}
