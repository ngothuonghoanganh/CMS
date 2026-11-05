import { Injectable } from '@nestjs/common';
import {
  can,
  CONTACT_COUNT_CAP,
  CONTACT_DONE_TASKS_SHOWN,
  CONTACT_OPEN_TASKS_MAX,
  CONTACT_TAGS_MAX,
  CONTACT_UPCOMING_MEETINGS_MAX,
  type ContactDeletionPreview,
  type ContactExportFile,
  type ContactMeeting,
  type ContactProfile,
  type ContactProfileResponse,
  type ContactTask,
  type CreateMeetingRequest,
  type CreateNoteRequest,
  type CreateTaskRequest,
  type DeleteContactPersonRequest,
  type DeleteContactPersonResponse,
  manualContactChannelShortLabels,
  type Permission,
  SITE_CONTACT_TAGS_MAX,
  TIMELINE_PAGE_SIZE,
  type TimelineEntry,
  type TimelineResponse,
  type UpdateContactDetailsValues,
  type UpdateContactRequest,
  type UpdateTaskRequest,
} from '@plp/contracts';
import { decodeCursor, encodeCursor } from '../../shared/cursor.js';
import { notFound, validationFailed } from '../../shared/errors.js';
import { type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { type Tx, TransactionRunner } from '../../shared/persistence/transaction.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { UsersRepository } from '../auth/users.repository.js';
import { DataRequestsRepository } from '../data-requests/data-requests.repository.js';
import { DataRequestsService } from '../data-requests/data-requests.service.js';
import { type LeadFile, LeadExportService } from '../leads/lead-export.service.js';
import { LeadPersonService } from '../leads/lead-person.service.js';
import type { LeadRecord } from '../leads/lead.schema.js';
import { type LeadPerson, LeadsRepository } from '../leads/leads.repository.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { ReleasesRepository } from '../publishing/releases.repository.js';
import { retentionOf, type SiteRecord, sitePrivacyOf } from '../sites/site.schema.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { SITE_NOT_FOUND, SitesService } from '../sites/sites.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { ContactAssignees } from './contact-assignees.service.js';
import type { ContactRecord } from './contact.schema.js';
import { ContactRecordsRepository } from './contact-records.repository.js';
import { ContactPhoneTakenError, ContactsRepository } from './contacts.repository.js';
import {
  eventEntry,
  leadEntry,
  mergeTimeline,
  personIn,
  type ProfileNames,
  toMeeting,
  toTask,
} from './domain/profile-dto.js';

export const CONTACT_NOT_FOUND = 'Không tìm thấy khách hàng';
const TASK_NOT_FOUND = 'Không tìm thấy công việc';
/** Records of each kind a profile's export holds at most. */
const EXPORT_RECORDS_MAX = 1000;
/** Requests "Gắn với yêu cầu dữ liệu" offers at most. */
const DELETION_REQUESTS_SHOWN = 10;

/** The person a profile is: its number and email, as a person's leads are found (ADR-017). */
function personOfContact(contact: ContactRecord): LeadPerson {
  return { leadId: null, phone: contact.search.phone, email: contact.search.email };
}

/**
 * A customer's profile (board 23, ADR-033). `leads.view` reads it and `leads.handle` writes
 * notes, tasks, meetings, the owner and tags. Every write is personal data: it records the site's
 * `dataSeq` in its transaction (ADR-027) and counts as an interaction for the profile's expiry.
 */
@Injectable()
export class ContactProfileService {
  constructor(
    private readonly sites: SitesService,
    private readonly siteRecords: SitesRepository,
    private readonly contacts: ContactsRepository,
    private readonly records: ContactRecordsRepository,
    private readonly assignees: ContactAssignees,
    private readonly leads: LeadsRepository,
    private readonly pages: PagesRepository,
    private readonly releases: ReleasesRepository,
    private readonly users: UsersRepository,
    private readonly people: LeadPersonService,
    private readonly exports: LeadExportService,
    private readonly dataRequests: DataRequestsService,
    private readonly requests: DataRequestsRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  async profile(
    user: AuthenticatedUser,
    siteId: string,
    contactId: string,
  ): Promise<ContactProfileResponse> {
    const { scope, site, contact } = await this.access(user, siteId, contactId, 'leads.view');
    const [view, tasks, meetings] = await Promise.all([
      this.view(scope, contact),
      this.records.tasksOf(
        scope,
        site._id,
        contact._id,
        CONTACT_OPEN_TASKS_MAX,
        CONTACT_DONE_TASKS_SHOWN,
      ),
      this.records.upcomingMeetings(
        scope,
        site._id,
        contact._id,
        new Date(),
        CONTACT_UPCOMING_MEETINGS_MAX,
      ),
    ]);
    const names = await this.names(
      scope,
      tasks.map((task) => task.assigneeId),
    );
    return {
      contact: view,
      tasks: tasks.map((task) => toTask(task, names)),
      meetings: meetings.map(toMeeting),
    };
  }

  /** The "Thông tin" card: the owner, or one tag added or taken off. */
  async update(
    user: AuthenticatedUser,
    siteId: string,
    contactId: string,
    request: UpdateContactRequest,
  ): Promise<ContactProfile> {
    const { scope, site, contact } = await this.access(user, siteId, contactId, 'leads.handle');
    switch (request.action) {
      case 'assign': {
        if (request.ownerId !== null) {
          await this.requireAssignee(scope, site._id, request.ownerId, 'ownerId');
        }
        const ownerId = request.ownerId === null ? null : toObjectId(request.ownerId);
        await this.contacts.assign(scope, site._id, [contact._id], ownerId);
        break;
      }
      case 'add_tag': {
        if (
          !(await this.contacts.hasTag(scope, site._id, request.tag)) &&
          (await this.contacts.tags(scope, site._id)).length >= SITE_CONTACT_TAGS_MAX
        ) {
          throw validationFailed([
            {
              path: ['tag'],
              code: 'too_many_tags',
              message: `Site đã có ${SITE_CONTACT_TAGS_MAX} nhãn. Dùng lại một nhãn có sẵn.`,
            },
          ]);
        }
        const tagged = await this.contacts.addTag(
          scope,
          site._id,
          [contact._id],
          request.tag,
          CONTACT_TAGS_MAX,
        );
        if (tagged === 0) {
          throw validationFailed([
            {
              path: ['tag'],
              code: 'too_many_tags',
              message: `Mỗi khách hàng có tối đa ${CONTACT_TAGS_MAX} nhãn`,
            },
          ]);
        }
        break;
      }
      case 'remove_tag':
        await this.contacts.removeTag(scope, site._id, contact._id, request.tag);
        break;
    }
    return this.view(scope, await this.reload(scope, site._id, contact._id));
  }

  /**
   * "Sửa thông tin" (ADR-017): the profile's name, phone number and email. The leads keep what
   * the person sent, as evidence. A number of another profile is a field error naming it.
   */
  async updateDetails(
    user: AuthenticatedUser,
    siteId: string,
    contactId: string,
    details: UpdateContactDetailsValues,
  ): Promise<ContactProfile> {
    const { scope, site, contact } = await this.access(
      user,
      siteId,
      contactId,
      'personalData.manage',
    );
    try {
      const updated = await this.transactions.run(async (tx) => {
        if (!(await this.siteRecords.recordDataWrite(scope, site._id, tx))) {
          throw notFound(SITE_NOT_FOUND);
        }
        return this.contacts.updateDetails(
          scope,
          site._id,
          contact._id,
          { name: details.name, phone: details.phone, email: details.email },
          tx,
        );
      });
      if (updated === null) {
        throw notFound(CONTACT_NOT_FOUND);
      }
      return await this.view(scope, updated);
    } catch (error) {
      if (!(error instanceof ContactPhoneTakenError)) {
        throw error;
      }
      const other = await this.contacts.findByPhone(scope, site._id, details.phone);
      throw validationFailed([
        {
          path: ['phone'],
          code: 'phone_taken',
          message:
            other === null
              ? 'Số này đã thuộc một hồ sơ khác'
              : `Số này đã thuộc hồ sơ ${other.name}`,
        },
      ]);
    }
  }

  /** "Dòng thời gian", newest first: notes and meetings with the profile's leads. */
  async timeline(
    user: AuthenticatedUser,
    siteId: string,
    contactId: string,
    cursor: string | undefined,
  ): Promise<TimelineResponse> {
    const { scope, site, contact } = await this.access(user, siteId, contactId, 'leads.view');
    const after = cursor === undefined ? null : decodeCursor(cursor);
    const [events, leads] = await Promise.all([
      this.records.timeline(scope, site._id, contact._id, after, TIMELINE_PAGE_SIZE + 1),
      this.leads.listOfContact(scope, site._id, contact._id, after, TIMELINE_PAGE_SIZE + 1),
    ]);
    const page = mergeTimeline(
      events.map((event) => ({ at: event.at, id: event._id, record: event })),
      leads.map((lead) => ({ at: lead.createdAt, id: lead._id, record: lead })),
      TIMELINE_PAGE_SIZE,
    );
    const shownEvents = page.items.flatMap((entry) =>
      entry.kind === 'event' ? [entry.item.record] : [],
    );
    const shownLeads = page.items.flatMap((entry) =>
      entry.kind === 'lead' ? [entry.item.record] : [],
    );
    const names = await this.names(
      scope,
      shownEvents.flatMap((event) => (event.actorId ? [event.actorId] : [])),
      shownLeads,
    );
    return {
      items: page.items.map((entry) =>
        entry.kind === 'event'
          ? eventEntry(entry.item.record, names)
          : leadEntry(entry.item.record, contact, names),
      ),
      nextCursor: page.next === null ? null : encodeCursor(page.next),
    };
  }

  async addNote(
    user: AuthenticatedUser,
    siteId: string,
    contactId: string,
    request: CreateNoteRequest,
  ): Promise<TimelineEntry> {
    const { scope, site, contact } = await this.access(user, siteId, contactId, 'leads.handle');
    const at = new Date();
    const event = await this.interaction(scope, site, contact._id, at, (expiresAt, tx) =>
      this.records.insertNote(scope, site._id, contact._id, request.text, at, expiresAt, tx),
    );
    return eventEntry(event, await this.names(scope, [scope.userId]));
  }

  async addTask(
    user: AuthenticatedUser,
    siteId: string,
    contactId: string,
    request: CreateTaskRequest,
  ): Promise<ContactTask> {
    const { scope, site, contact } = await this.access(user, siteId, contactId, 'leads.handle');
    await this.requireAssignee(scope, site._id, request.assigneeId, 'assigneeId');
    const at = new Date();
    const task = await this.interaction(scope, site, contact._id, at, async (expiresAt, tx) => {
      const open = await this.records.countOpenTasks(
        scope,
        site._id,
        contact._id,
        CONTACT_OPEN_TASKS_MAX,
        tx,
      );
      if (open >= CONTACT_OPEN_TASKS_MAX) {
        throw validationFailed([
          {
            path: ['title'],
            code: 'too_many_tasks',
            message: `Khách hàng này đã có ${CONTACT_OPEN_TASKS_MAX} công việc đang mở`,
          },
        ]);
      }
      return this.records.insertTask(
        scope,
        site._id,
        contact._id,
        {
          title: request.title,
          dueAt: new Date(request.dueAt),
          assigneeId: toObjectId(request.assigneeId),
          createdBy: scope.userId,
          at,
          expiresAt,
        },
        tx,
      );
    });
    return toTask(task, await this.names(scope, [task.assigneeId]));
  }

  /** Ticks a task done, or opens it again. */
  async updateTask(
    user: AuthenticatedUser,
    siteId: string,
    contactId: string,
    taskId: string,
    request: UpdateTaskRequest,
  ): Promise<ContactTask> {
    const { scope, site, contact } = await this.access(user, siteId, contactId, 'leads.handle');
    const task = await this.records.setTaskDone(
      scope,
      site._id,
      contact._id,
      toObjectId(taskId, TASK_NOT_FOUND),
      request.done ? new Date() : null,
    );
    if (task === null) {
      throw notFound(TASK_NOT_FOUND);
    }
    return toTask(task, await this.names(scope, [task.assigneeId]));
  }

  /** "Đặt lịch hẹn": a meeting from now on, written to the timeline with it. */
  async addMeeting(
    user: AuthenticatedUser,
    siteId: string,
    contactId: string,
    request: CreateMeetingRequest,
  ): Promise<ContactMeeting> {
    const { scope, site, contact } = await this.access(user, siteId, contactId, 'leads.handle');
    const at = new Date();
    const meetingAt = new Date(request.at);
    if (meetingAt.getTime() < at.getTime()) {
      throw validationFailed([
        { path: ['at'], code: 'in_past', message: 'Chọn ngày giờ từ bây giờ trở đi' },
      ]);
    }
    const booked = await this.interaction(scope, site, contact._id, at, async (expiresAt, tx) => {
      const upcoming = await this.records.countUpcomingMeetings(
        scope,
        site._id,
        contact._id,
        at,
        CONTACT_UPCOMING_MEETINGS_MAX,
        tx,
      );
      if (upcoming >= CONTACT_UPCOMING_MEETINGS_MAX) {
        throw validationFailed([
          {
            path: ['at'],
            code: 'too_many_meetings',
            message: `Khách hàng này đã có ${CONTACT_UPCOMING_MEETINGS_MAX} lịch hẹn sắp tới`,
          },
        ]);
      }
      return this.records.insertMeeting(
        scope,
        site._id,
        contact._id,
        { at: meetingAt, place: request.place, with: request.with, note: request.note },
        at,
        expiresAt,
        tx,
      );
    });
    return toMeeting(booked.meeting);
  }

  /**
   * "Xuất dữ liệu của người này" (`leads.export`, board 23): the person's leads with their consent
   * evidence, and everything the profile holds. Recorded as an export, without personal data.
   */
  async exportPerson(
    user: AuthenticatedUser,
    siteId: string,
    contactId: string,
  ): Promise<LeadFile> {
    const { scope, site, contact } = await this.access(user, siteId, contactId, 'leads.export');
    const [leads, held] = await Promise.all([
      this.exports.personLeadsOfProfiles(scope, site, personOfContact(contact), [contact._id]),
      this.records.exportOf(scope, site._id, [contact._id], EXPORT_RECORDS_MAX),
    ]);
    const now = new Date();
    const file: ContactExportFile = {
      exportedAt: now.toISOString(),
      site: site.name,
      leads: leads.leads,
      contact: {
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        createdAt: contact.createdAt.toISOString(),
        source:
          contact.origin.kind === 'lead'
            ? 'Form trên trang'
            : `Thêm tay · ${manualContactChannelShortLabels[contact.origin.channel]}`,
        marketing: {
          consented: contact.marketing.consented,
          at: contact.marketing.at === null ? null : contact.marketing.at.toISOString(),
        },
        tags: contact.tags,
      },
      notes: held.notes.map((note) => ({ at: note.at.toISOString(), text: note.text ?? '' })),
      tasks: held.tasks.map((task) => ({
        title: task.title,
        dueAt: task.dueAt.toISOString(),
        doneAt: task.doneAt === null ? null : task.doneAt.toISOString(),
      })),
      meetings: held.meetings.map((meeting) => ({
        at: meeting.at.toISOString(),
        place: meeting.place,
        with: meeting.with,
        note: meeting.note,
      })),
    };
    return {
      filename: `du-lieu-ca-nhan-${site.subdomain}-${now.toISOString().slice(0, 10)}.json`,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(file, null, 2),
      truncated: leads.truncated,
    };
  }

  /** What "Xóa dữ liệu của người này" removes, and the requests it may complete. */
  async deletionPreview(
    user: AuthenticatedUser,
    siteId: string,
    contactId: string,
  ): Promise<ContactDeletionPreview> {
    const { scope, site, contact } = await this.access(
      user,
      siteId,
      contactId,
      'personalData.manage',
    );
    const person = personOfContact(contact);
    const linked = await this.leads.contactIdsOfPerson(scope, site._id, person);
    const profiles = await this.contacts.idsOfPerson(scope, site._id, person, [
      contact._id,
      ...linked,
    ]);
    const [leads, held, requests] = await Promise.all([
      this.leads.countPersonOrProfiles(scope, site._id, person, profiles, CONTACT_COUNT_CAP),
      this.records.counts(scope, site._id, profiles),
      this.requests.openDeletionsFor(scope, site._id, person, DELETION_REQUESTS_SHOWN),
    ]);
    return {
      leads,
      ...held,
      requests: requests.map((request) => ({
        id: request._id.toHexString(),
        receivedAt: request.receivedAt.toISOString(),
        completeBy: request.completeBy.toISOString(),
      })),
    };
  }

  /**
   * Deletes the person (ADR-017, ADR-033): the profile, every lead of theirs and of the profile,
   * notes, tasks and meetings, in one transaction. With a request picked, the deletion completes
   * it, as "Hoàn tất" on the request would.
   */
  async deletePerson(
    user: AuthenticatedUser,
    siteId: string,
    contactId: string,
    request: DeleteContactPersonRequest,
  ): Promise<DeleteContactPersonResponse> {
    const { scope, site, contact } = await this.access(
      user,
      siteId,
      contactId,
      'personalData.manage',
    );
    if (request.requestId !== null) {
      return {
        deletedLeads: await this.dataRequests.completeDeletionWithProfile(
          user,
          siteId,
          request.requestId,
          contact._id,
        ),
      };
    }
    return {
      deletedLeads: await this.people.deletePerson(scope, site._id, personOfContact(contact), [
        contact._id,
      ]),
    };
  }

  /**
   * A write that is an interaction (ADR-033), in one transaction: the site's `dataSeq`, the
   * profile's activity and expiry, the record with that expiry, and the profile's older records
   * moved to it.
   */
  private async interaction<T>(
    scope: WorkspaceScope,
    site: SiteRecord,
    contactId: ObjectId,
    at: Date,
    write: (expiresAt: Date | null, tx: Tx) => Promise<T>,
  ): Promise<T> {
    const months = retentionOf(sitePrivacyOf(site));
    return this.transactions.run(async (tx) => {
      if (!(await this.siteRecords.recordDataWrite(scope, site._id, tx))) {
        throw notFound(SITE_NOT_FOUND);
      }
      const touched = await this.contacts.touch(scope, site._id, contactId, at, months, tx);
      if (touched === null) {
        throw notFound(CONTACT_NOT_FOUND);
      }
      const written = await write(touched.expiresAt, tx);
      await this.records.alignExpiry(scope, site._id, contactId, touched.expiresAt, tx);
      return written;
    });
  }

  /** The profile through its site (ADR-025); unknown, other sites' and gone profiles are 404. */
  private async access(
    user: AuthenticatedUser,
    siteId: string,
    contactId: string,
    permission: Permission,
  ): Promise<{ scope: WorkspaceScope; site: SiteRecord; contact: ContactRecord }> {
    const id = toObjectId(contactId, CONTACT_NOT_FOUND);
    const { scope, site } = await this.sites.access(user, siteId, permission);
    const contact = await this.contacts.findById(scope, site._id, id);
    if (contact === null) {
      throw notFound(CONTACT_NOT_FOUND);
    }
    return { scope, site, contact };
  }

  private async reload(
    scope: WorkspaceScope,
    siteId: ObjectId,
    contactId: ObjectId,
  ): Promise<ContactRecord> {
    const contact = await this.contacts.findById(scope, siteId, contactId);
    if (contact === null) {
      throw notFound(CONTACT_NOT_FOUND);
    }
    return contact;
  }

  private async requireAssignee(
    scope: WorkspaceScope,
    siteId: ObjectId,
    userId: string,
    field: string,
  ): Promise<void> {
    if (!(await this.assignees.includes(scope, siteId, userId))) {
      throw validationFailed([
        {
          path: [field],
          code: 'not_assignable',
          message: 'Người này không xem được khách hàng của site',
        },
      ]);
    }
  }

  /** The header and left column of board 23, with what the member may do. */
  private async view(scope: WorkspaceScope, contact: ContactRecord): Promise<ContactProfile> {
    const latest = await this.leads.latestOfContact(scope, contact.siteId, contact._id);
    const names = await this.names(
      scope,
      [
        ...(contact.ownerId ? [contact.ownerId] : []),
        ...(contact.origin.kind === 'manual' ? [contact.origin.addedBy] : []),
      ],
      latest === null ? [] : [latest],
    );
    return {
      id: contact._id.toHexString(),
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      createdAt: contact.createdAt.toISOString(),
      owner: personIn(names, contact.ownerId),
      tags: contact.tags,
      origin:
        contact.origin.kind === 'lead'
          ? { kind: 'lead' }
          : {
              kind: 'manual',
              channel: contact.origin.channel,
              addedBy: personIn(names, contact.origin.addedBy),
              at: contact.origin.at.toISOString(),
            },
      consent: {
        processing:
          latest === null
            ? null
            : {
                leadId: latest._id.toHexString(),
                at: latest.consent.at.toISOString(),
                version: names.consentVersions.get(latest.releaseId.toHexString()) ?? null,
                page: {
                  id: latest.pageId.toHexString(),
                  title: names.pages.get(latest.pageId.toHexString()) ?? null,
                },
                pageVersion: latest.releaseVersion,
              },
        marketing: {
          consented: contact.marketing.consented,
          at: contact.marketing.at === null ? null : contact.marketing.at.toISOString(),
        },
      },
      leadCount: contact.leadCount,
      can: {
        handle: can(scope.access, 'leads.handle'),
        export: can(scope.access, 'leads.export'),
        manage: can(scope.access, 'personalData.manage'),
      },
    };
  }

  private async names(
    scope: WorkspaceScope,
    people: readonly ObjectId[],
    leads: readonly LeadRecord[] = [],
  ): Promise<ProfileNames> {
    const [refs, pages, captures] = await Promise.all([
      this.users.findRefs(people),
      this.pages.findTitles(
        scope,
        leads.map((lead) => lead.pageId),
      ),
      this.releases.findLeadCaptures(
        scope,
        leads.map((lead) => lead.releaseId),
      ),
    ]);
    const consentVersions = new Map<string, number>();
    for (const [id, release] of captures) {
      if (release.leadCapture) {
        consentVersions.set(id, release.leadCapture.consentVersion);
      }
    }
    return { people: refs, pages, consentVersions };
  }
}
