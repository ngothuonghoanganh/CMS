import { Injectable } from '@nestjs/common';
import {
  CONTACT_COUNT_CAP,
  CONTACT_PAGE_SIZE,
  CONTACT_TAGS_MAX,
  type ContactBulkResponse,
  type ContactBulkValues,
  type ContactCount,
  type ContactListItem,
  type ContactListQuery,
  type ContactListResponse,
  type ContactOptionsResponse,
  type ContactPerson,
  type ContactView,
  type CreateContactResponse,
  type CreateContactValues,
  type MergeContactsRequest,
  type MergeContactsResponse,
  MERGE_SUGGESTIONS_MAX,
  type MergeSide,
  type MergeSuggestion,
  type MergeSuggestionListResponse,
  SITE_CONTACT_TAGS_MAX,
} from '@plp/contracts';
import { notFound, validationFailed } from '../../shared/errors.js';
import { type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { UsersRepository } from '../auth/users.repository.js';
import { parseLeadQuery } from '../leads/domain/lead-search.js';
import { LeadsRepository } from '../leads/leads.repository.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { retentionOf, sitePrivacyOf } from '../sites/site.schema.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { SITE_NOT_FOUND, SitesService } from '../sites/sites.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { ContactAssignees } from './contact-assignees.service.js';
import type { ContactRecord, MergeSuggestionRecord } from './contact.schema.js';
import { ContactRecordsRepository } from './contact-records.repository.js';
import { OpportunitiesRepository } from './opportunities.repository.js';
import type { OpportunityRecord } from './opportunity.schema.js';
import {
  type ContactCriteria,
  ContactPhoneTakenError,
  ContactsRepository,
} from './contacts.repository.js';
import { contactExpiry, mergeContacts } from './domain/contact-rules.js';
import { MergeSuggestionsRepository } from './merge-suggestions.repository.js';

const SUGGESTION_NOT_FOUND = 'Không tìm thấy cặp hồ sơ này';
const SUGGESTION_GONE = 'Cặp hồ sơ này đã được xử lý';

function toCount(counted: number): ContactCount {
  return counted > CONTACT_COUNT_CAP
    ? { count: CONTACT_COUNT_CAP, capped: true }
    : { count: counted, capped: false };
}

/** Names of members and pages, read once for a page of profiles or pairs. */
interface Names {
  people: ReadonlyMap<string, ContactPerson>;
  pages: ReadonlyMap<string, string>;
}

function personOf(names: Names, id: ObjectId | null): ContactPerson | null {
  return id === null ? null : (names.people.get(id.toHexString()) ?? null);
}

function sourceOf(contact: ContactRecord, names: Names): ContactListItem['source'] {
  if (contact.origin.kind === 'manual') {
    return { kind: 'manual', channel: contact.origin.channel };
  }
  const lead = contact.lastLead;
  if (lead === null) {
    throw new Error(`Contact ${contact._id.toHexString()} comes from leads but has no last lead`);
  }
  return {
    kind: 'lead',
    page: {
      id: lead.pageId.toHexString(),
      title: names.pages.get(lead.pageId.toHexString()) ?? null,
    },
    source: { source: lead.source, medium: lead.medium },
  };
}

function toListItem(
  contact: ContactRecord,
  names: Names,
  duplicate: boolean,
  opportunity: OpportunityRecord | null = null,
): ContactListItem {
  return {
    id: contact._id.toHexString(),
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    source: sourceOf(contact, names),
    leadCount: contact.leadCount,
    owner: personOf(names, contact.ownerId),
    tags: contact.tags,
    possibleDuplicate: duplicate,
    opportunity:
      opportunity === null
        ? null
        : {
            stage: opportunity.stage,
            value:
              opportunity.stage === 'won' ? (opportunity.won?.value ?? null) : opportunity.value,
          },
    lastActivityAt: contact.lastActivityAt.toISOString(),
  };
}

function toSide(contact: ContactRecord, names: Names): MergeSide {
  return {
    id: contact._id.toHexString(),
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    owner: personOf(names, contact.ownerId),
    marketingAt:
      contact.marketing.consented && contact.marketing.at !== null
        ? contact.marketing.at.toISOString()
        : null,
    leadCount: contact.leadCount,
    createdAt: contact.createdAt.toISOString(),
  };
}

/** The older profile first: it is the one a merge keeps (ADR-033). */
function inMergeOrder(a: ContactRecord, b: ContactRecord): [ContactRecord, ContactRecord] {
  return a.createdAt <= b.createdAt ? [a, b] : [b, a];
}

/**
 * The customers of a site (board 22, ADR-033). `leads.view` reads them, `leads.handle` adds,
 * assigns, tags and merges them. Personal data is returned to members only and never logged.
 */
@Injectable()
export class ContactsService {
  constructor(
    private readonly sites: SitesService,
    private readonly siteRecords: SitesRepository,
    private readonly contacts: ContactsRepository,
    private readonly suggestions: MergeSuggestionsRepository,
    private readonly records: ContactRecordsRepository,
    private readonly opportunities: OpportunitiesRepository,
    private readonly leads: LeadsRepository,
    private readonly pages: PagesRepository,
    private readonly users: UsersRepository,
    private readonly assigneeList: ContactAssignees,
    private readonly transactions: TransactionRunner,
  ) {}

  /** The choices of the filters and of "Giao cho…". */
  async options(user: AuthenticatedUser, siteId: string): Promise<ContactOptionsResponse> {
    const { scope, site } = await this.sites.access(user, siteId, 'leads.view');
    const [assignees, tags] = await Promise.all([
      this.assigneeList.list(scope, site._id),
      this.contacts.tags(scope, site._id),
    ]);
    return { assignees, tags: tags.sort((a, b) => a.localeCompare(b, 'vi')) };
  }

  /**
   * One page of a view, with the count of every view under the same tag and search. The search
   * arrives in the request body, never in a URL (rule 10).
   */
  async list(
    user: AuthenticatedUser,
    siteId: string,
    query: ContactListQuery,
  ): Promise<ContactListResponse> {
    const { scope, site } = await this.sites.access(user, siteId, 'leads.view');
    const shared = {
      ...(query.tag === undefined ? {} : { tag: query.tag }),
      search: query.q === undefined ? null : parseLeadQuery(query.q),
    };
    const ownerFilter = query.ownerId === undefined ? {} : { ownerId: toObjectId(query.ownerId) };
    const criteriaOf = (view: Exclude<ContactView, 'duplicates'>): ContactCriteria => {
      switch (view) {
        case 'all':
          return { ...shared, ...ownerFilter };
        case 'mine':
          return { ...shared, ownerId: scope.userId };
        case 'unassigned':
          return { ...shared, ownerId: null };
      }
    };
    const [page, all, mine, unassigned, duplicates] = await Promise.all([
      this.contacts.list(scope, site._id, criteriaOf(query.view), query.cursor, CONTACT_PAGE_SIZE),
      this.contacts.count(scope, site._id, criteriaOf('all'), CONTACT_COUNT_CAP + 1),
      this.contacts.count(scope, site._id, criteriaOf('mine'), CONTACT_COUNT_CAP + 1),
      this.contacts.count(scope, site._id, criteriaOf('unassigned'), CONTACT_COUNT_CAP + 1),
      this.suggestions.countOpen(scope, site._id, CONTACT_COUNT_CAP + 1),
    ]);
    const [names, open, opportunities] = await Promise.all([
      this.names(scope, page.items),
      this.suggestions.openFor(
        scope,
        site._id,
        page.items.map((contact) => contact._id),
      ),
      this.opportunities.latestOfContacts(
        scope,
        site._id,
        page.items.map((contact) => contact._id),
      ),
    ]);
    const paired = new Set(open.flatMap((pair) => pair.contactIds.map((id) => id.toHexString())));
    return {
      items: page.items.map((contact) =>
        toListItem(
          contact,
          names,
          paired.has(contact._id.toHexString()),
          opportunities.get(contact._id.toHexString()) ?? null,
        ),
      ),
      nextCursor: page.nextCursor,
      counts: {
        all: toCount(all),
        mine: toCount(mine),
        unassigned: toCount(unassigned),
        duplicates: toCount(duplicates),
      },
    };
  }

  /**
   * "Thêm khách hàng" (ADR-033): the source is kept as proof of where the data came from, and an
   * agreement to offers with who recorded it. A number already in the site points to its profile.
   */
  async create(
    user: AuthenticatedUser,
    siteId: string,
    values: CreateContactValues,
  ): Promise<CreateContactResponse> {
    const { scope, site } = await this.sites.access(user, siteId, 'leads.handle');
    const existing = await this.contacts.findByPhone(scope, site._id, values.phone);
    if (existing) {
      return { status: 'exists', contact: { id: existing._id.toHexString(), name: existing.name } };
    }
    const at = new Date();
    try {
      const created = await this.transactions.run(async (tx) => {
        // Personal data must not outlive a site deleted meanwhile (ADR-027).
        if (!(await this.siteRecords.recordDataWrite(scope, site._id, tx))) {
          throw notFound(SITE_NOT_FOUND);
        }
        return this.contacts.insertManual(
          scope,
          site._id,
          {
            name: values.name,
            phone: values.phone,
            origin: { kind: 'manual', channel: values.channel, addedBy: scope.userId, at },
            marketing: values.marketing
              ? { consented: true, at, recordedBy: scope.userId }
              : { consented: false, at: null, recordedBy: null },
            at,
            expiresAt: contactExpiry(at, retentionOf(sitePrivacyOf(site))),
          },
          tx,
        );
      });
      return {
        status: 'created',
        contact: toListItem(created, await this.names(scope, [created]), false),
      };
    } catch (error) {
      if (!(error instanceof ContactPhoneTakenError)) {
        throw error;
      }
      // A lead with the same number arrived meanwhile.
      const taken = await this.contacts.findByPhone(scope, site._id, values.phone);
      if (!taken) {
        throw error;
      }
      return { status: 'exists', contact: { id: taken._id.toHexString(), name: taken.name } };
    }
  }

  /** "Giao cho…" and "Gắn nhãn…" on at most `CONTACT_BULK_MAX` profiles. */
  async bulk(
    user: AuthenticatedUser,
    siteId: string,
    values: ContactBulkValues,
  ): Promise<ContactBulkResponse> {
    const { scope, site } = await this.sites.access(user, siteId, 'leads.handle');
    const ids = values.contactIds.map((id) => toObjectId(id));
    switch (values.action) {
      case 'assign': {
        const ownerId = values.ownerId === null ? null : toObjectId(values.ownerId);
        if (
          ownerId !== null &&
          !(await this.assigneeList.includes(scope, site._id, ownerId.toHexString()))
        ) {
          throw validationFailed([
            {
              path: ['ownerId'],
              code: 'not_assignable',
              message: 'Người này không xem được khách hàng của site',
            },
          ]);
        }
        return { updated: await this.contacts.assign(scope, site._id, ids, ownerId) };
      }
      case 'tag': {
        if (!(await this.contacts.hasTag(scope, site._id, values.tag))) {
          const tags = await this.contacts.tags(scope, site._id);
          if (tags.length >= SITE_CONTACT_TAGS_MAX) {
            throw validationFailed([
              {
                path: ['tag'],
                code: 'too_many_tags',
                message: `Site đã có ${SITE_CONTACT_TAGS_MAX} nhãn. Dùng lại một nhãn có sẵn.`,
              },
            ]);
          }
        }
        return {
          updated: await this.contacts.addTag(scope, site._id, ids, values.tag, CONTACT_TAGS_MAX),
        };
      }
    }
  }

  /** "Có thể trùng": the open pairs, oldest first. Pairs whose profile expired are cleared. */
  async suggestionList(
    user: AuthenticatedUser,
    siteId: string,
  ): Promise<MergeSuggestionListResponse> {
    const { scope, site } = await this.sites.access(user, siteId, 'leads.view');
    const [pairs, total] = await Promise.all([
      this.suggestions.listOpen(scope, site._id, MERGE_SUGGESTIONS_MAX),
      this.suggestions.countOpen(scope, site._id, CONTACT_COUNT_CAP + 1),
    ]);
    const contacts = await this.contacts.findByIds(
      scope,
      site._id,
      pairs.flatMap((pair) => pair.contactIds),
    );
    const byId = new Map(contacts.map((contact) => [contact._id.toHexString(), contact]));
    const complete: Array<{ pair: MergeSuggestionRecord; a: ContactRecord; b: ContactRecord }> = [];
    const gone: ObjectId[] = [];
    for (const pair of pairs) {
      const [first, second] = pair.contactIds.map((id) => byId.get(id.toHexString()));
      if (first && second) {
        const [a, b] = inMergeOrder(first, second);
        complete.push({ pair, a, b });
      } else {
        gone.push(...pair.contactIds.filter((id) => !byId.has(id.toHexString())));
      }
    }
    await this.suggestions.deleteForContacts(scope, site._id, gone);
    const names = await this.names(
      scope,
      complete.flatMap(({ a, b }) => [a, b]),
      complete.flatMap(({ pair }) =>
        pair.reason.kind === 'name_page' ? [pair.reason.pageId] : [],
      ),
    );
    const items: MergeSuggestion[] = complete.map(({ pair, a, b }) => ({
      id: pair._id.toHexString(),
      reason:
        pair.reason.kind === 'email'
          ? { kind: 'email' }
          : {
              kind: 'name_page',
              page: {
                id: pair.reason.pageId.toHexString(),
                title: names.pages.get(pair.reason.pageId.toHexString()) ?? null,
              },
              days: pair.reason.days,
            },
      a: toSide(a, names),
      b: toSide(b, names),
    }));
    return { items, total: toCount(Math.max(0, total - (pairs.length - complete.length))) };
  }

  /**
   * "Gộp hai hồ sơ" (ADR-033): the older profile stays with each field from the side picked; the
   * leads of the other move to it, in one transaction. Leads and their consent evidence are kept
   * as they are.
   */
  async merge(
    user: AuthenticatedUser,
    siteId: string,
    suggestionId: string,
    input: MergeContactsRequest,
  ): Promise<MergeContactsResponse> {
    const { scope, site } = await this.sites.access(user, siteId, 'leads.handle');
    const id = toObjectId(suggestionId, SUGGESTION_NOT_FOUND);
    const months = retentionOf(sitePrivacyOf(site));
    const kept = await this.transactions.run(async (tx) => {
      if (!(await this.siteRecords.recordDataWrite(scope, site._id, tx))) {
        throw notFound(SITE_NOT_FOUND);
      }
      const pair = await this.suggestions.findOpen(scope, site._id, id, tx);
      if (!pair) {
        throw notFound(SUGGESTION_GONE);
      }
      const found = await this.contacts.findByIds(scope, site._id, pair.contactIds, tx);
      const [first, second] = found;
      if (found.length !== 2 || !first || !second) {
        throw notFound(SUGGESTION_GONE);
      }
      const [a, b] = inMergeOrder(first, second);
      const merged = await this.contacts.merge(
        scope,
        site._id,
        a._id,
        b._id,
        mergeContacts(a, b, input.picks),
        months,
        tx,
      );
      if (!merged) {
        throw notFound(SUGGESTION_GONE);
      }
      await this.leads.moveToContact(scope, site._id, b._id, a._id, tx);
      await this.records.moveToContact(scope, site._id, b._id, a._id, tx);
      await this.records.alignExpiry(scope, site._id, a._id, merged.expiresAt, tx);
      // The pair itself and every other pair of the profile merged away.
      await this.suggestions.deleteForContacts(scope, site._id, [b._id], tx);
      return merged;
    });
    const latest = await this.opportunities.latestOfContacts(scope, site._id, [kept._id]);
    return {
      contact: toListItem(
        kept,
        await this.names(scope, [kept]),
        false,
        latest.get(kept._id.toHexString()) ?? null,
      ),
    };
  }

  /** "Không phải cùng người": the pair is never suggested again. */
  async dismiss(user: AuthenticatedUser, siteId: string, suggestionId: string): Promise<void> {
    const { scope, site } = await this.sites.access(user, siteId, 'leads.handle');
    const id = toObjectId(suggestionId, SUGGESTION_NOT_FOUND);
    if (!(await this.suggestions.dismiss(scope, site._id, id, new Date()))) {
      throw notFound(SUGGESTION_GONE);
    }
  }

  private async names(
    scope: WorkspaceScope,
    contacts: readonly ContactRecord[],
    extraPages: readonly ObjectId[] = [],
  ): Promise<Names> {
    const [people, pages] = await Promise.all([
      this.users.findRefs(
        contacts.flatMap((contact) => (contact.ownerId ? [contact.ownerId] : [])),
      ),
      this.pages.findTitles(scope, [
        ...contacts.flatMap((contact) => (contact.lastLead ? [contact.lastLead.pageId] : [])),
        ...extraPages,
      ]),
    ]);
    return { people, pages };
  }
}
