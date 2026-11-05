import type {
  ContactMeeting,
  ContactPerson,
  ContactTask,
  Opportunity,
  TimelineEntry,
} from '@plp/contracts';
import type { CursorPosition } from '../../../shared/cursor.js';
import type { ObjectId } from '../../../shared/persistence/object-id.js';
import type { LeadRecord } from '../../leads/lead.schema.js';
import type { ContactRecord } from '../contact.schema.js';
import type { OpportunityRecord } from '../opportunity.schema.js';
import type { ContactEventRecord, MeetingRecord, TaskRecord } from '../profile.schema.js';

/** Names read once for a profile or a page of its timeline. */
export interface ProfileNames {
  people: ReadonlyMap<string, ContactPerson>;
  pages: ReadonlyMap<string, string>;
  /** Consent text version of each release, by release id. */
  consentVersions: ReadonlyMap<string, number>;
}

export function personIn(names: ProfileNames, id: ObjectId | null): ContactPerson | null {
  return id === null ? null : (names.people.get(id.toHexString()) ?? null);
}

export function toTask(task: TaskRecord, names: ProfileNames): ContactTask {
  return {
    id: task._id.toHexString(),
    title: task.title,
    dueAt: task.dueAt.toISOString(),
    assignee: personIn(names, task.assigneeId),
    doneAt: task.doneAt === null ? null : task.doneAt.toISOString(),
  };
}

export function toMeeting(meeting: MeetingRecord): ContactMeeting {
  return {
    id: meeting._id.toHexString(),
    at: meeting.at.toISOString(),
    place: meeting.place,
    with: meeting.with,
    note: meeting.note,
  };
}

export function eventEntry(event: ContactEventRecord, names: ProfileNames): TimelineEntry {
  const shared = {
    id: event._id.toHexString(),
    at: event.at.toISOString(),
    actor: personIn(names, event.actorId),
  };
  if (event.kind === 'note') {
    if (event.text === null) {
      throw new Error(`Note ${event._id.toHexString()} has no text`);
    }
    return { kind: 'note', ...shared, text: event.text };
  }
  if (event.kind === 'stage') {
    if (event.stage === null) {
      throw new Error(`Stage entry ${event._id.toHexString()} has no stage`);
    }
    return {
      kind: 'stage',
      ...shared,
      title: event.stage.title,
      from: event.stage.from,
      to: event.stage.to,
      value: event.stage.value,
    };
  }
  if (event.meeting === null) {
    throw new Error(`Meeting entry ${event._id.toHexString()} has no meeting`);
  }
  return {
    kind: 'meeting',
    ...shared,
    meeting: {
      at: event.meeting.at.toISOString(),
      place: event.meeting.place,
      with: event.meeting.with,
      note: event.meeting.note,
    },
  };
}

/**
 * A lead as a timeline entry. It "joined" the profile when it was not the lead that created it:
 * a profile added by hand, or a later lead with the same number ("tự gom vào hồ sơ").
 */
export function leadEntry(
  lead: LeadRecord,
  contact: Pick<ContactRecord, 'origin' | 'createdAt'>,
  names: ProfileNames,
): TimelineEntry {
  return {
    kind: 'lead',
    id: lead._id.toHexString(),
    at: lead.createdAt.toISOString(),
    page: {
      id: lead.pageId.toHexString(),
      title: names.pages.get(lead.pageId.toHexString()) ?? null,
    },
    message: lead.fields.message,
    source: lead.source.source,
    medium: lead.source.medium,
    campaign: lead.source.campaign,
    consentVersion: names.consentVersions.get(lead.releaseId.toHexString()) ?? null,
    joined: contact.origin.kind === 'manual' || lead.createdAt > contact.createdAt,
  };
}

/** A record of either source of the timeline, at its time. */
export interface TimedRecord<T> {
  at: Date;
  id: ObjectId;
  record: T;
}

/**
 * One page of the timeline from its two sources, each read newest first with `limit + 1` rows
 * after the same position: the first `limit` of both together are the page, and anything beyond
 * means another page follows.
 */
export function mergeTimeline<A, B>(
  events: readonly TimedRecord<A>[],
  leads: readonly TimedRecord<B>[],
  limit: number,
): {
  items: Array<{ kind: 'event'; item: TimedRecord<A> } | { kind: 'lead'; item: TimedRecord<B> }>;
  next: CursorPosition | null;
} {
  const all = [
    ...events.map((item) => ({ kind: 'event' as const, item })),
    ...leads.map((item) => ({ kind: 'lead' as const, item })),
  ].sort((a, b) => {
    const byTime = b.item.at.getTime() - a.item.at.getTime();
    return byTime !== 0 ? byTime : b.item.id.toHexString().localeCompare(a.item.id.toHexString());
  });
  const items = all.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    next:
      all.length > limit && last !== undefined
        ? { createdAt: last.item.at, id: last.item.id.toHexString() }
        : null,
  };
}

/** An opportunity for a card, a list row or a profile. */
export function toOpportunity(
  opportunity: OpportunityRecord,
  people: ReadonlyMap<string, ContactPerson>,
  contactName: string,
  next: { title: string; dueAt: Date } | null,
): Opportunity {
  const person = (id: ObjectId | null) =>
    id === null ? null : (people.get(id.toHexString()) ?? null);
  return {
    id: opportunity._id.toHexString(),
    title: opportunity.title,
    stage: opportunity.stage,
    value: opportunity.value,
    valueBy: person(opportunity.valueBy),
    won: opportunity.won,
    lost: opportunity.lost,
    owner: person(opportunity.ownerId),
    contact: { id: opportunity.contactId.toHexString(), name: contactName },
    // Closed opportunities have nothing next.
    next:
      next === null || opportunity.stage === 'won' || opportunity.stage === 'lost'
        ? null
        : { title: next.title, dueAt: next.dueAt.toISOString() },
    stageChangedAt: opportunity.stageChangedAt.toISOString(),
    createdAt: opportunity.createdAt.toISOString(),
  };
}
