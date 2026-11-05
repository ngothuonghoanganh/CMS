import { Injectable } from '@nestjs/common';
import {
  type createDataRequestRequestSchema,
  DATA_REQUEST_MATCHES_MAX,
  dataRequestDeadlines,
  type DataRequestDetail,
  type DataRequestListResponse,
  type PersonExportRequest,
  receivedAtProblem,
} from '@plp/contracts';
import type { z } from 'zod';
import { AppError, notFound, validationFailed } from '../../shared/errors.js';
import { type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { UsersRepository } from '../auth/users.repository.js';
import { phoneSearchKey } from '../leads/domain/lead-search.js';
import { CAPPED_COUNT_LIMIT, toCappedCount } from '../leads/lead-dto.js';
import { type LeadFile, LeadExportService } from '../leads/lead-export.service.js';
import { LeadPersonService } from '../leads/lead-person.service.js';
import { ContactsRepository } from '../contacts/contacts.repository.js';
import { type LeadPerson, LeadsRepository } from '../leads/leads.repository.js';
import { PagesRepository } from '../pages/pages.repository.js';
import type { SiteRecord } from '../sites/site.schema.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { SITE_NOT_FOUND, SitesService } from '../sites/sites.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import {
  DATA_REQUEST_NOT_FOUND,
  personOfRequest,
  toDataRequest,
  toDataRequestDetail,
} from './data-request-dto.js';
import type { DataRequestLogRecord, DataRequestRecord } from './data-request.schema.js';
import { DataRequestsRepository } from './data-requests.repository.js';
import { type DataRequestStep, stepProblem } from './domain/data-request-rules.js';
import { maskContact } from './domain/mask-contact.js';

/** Body of `POST /sites/:siteId/data-requests` after the contract schema normalized it. */
export type CreateDataRequestValues = z.output<typeof createDataRequestRequestSchema>;

interface RequestAccess {
  scope: WorkspaceScope;
  site: SiteRecord;
  request: DataRequestRecord;
}

function stepConflict(title: string): AppError {
  return new AppError(409, 'conflict', title, {
    detail: 'Tải lại để xem trạng thái mới nhất của yêu cầu.',
  });
}

/**
 * Requests from people who sent a form (board 12, ADR-017), owner only. The owner records each one
 * and handles it with the inbox's own operations: a person's export, deletion, the withdrawal of
 * marketing consent, or correcting a lead ("Sửa thông tin"). Deadlines count in working days.
 */
@Injectable()
export class DataRequestsService {
  constructor(
    private readonly sites: SitesService,
    private readonly siteRecords: SitesRepository,
    private readonly requests: DataRequestsRepository,
    private readonly leads: LeadsRepository,
    private readonly contacts: ContactsRepository,
    private readonly pages: PagesRepository,
    private readonly users: UsersRepository,
    private readonly activity: ActivityRepository,
    private readonly exports: LeadExportService,
    private readonly people: LeadPersonService,
    private readonly transactions: TransactionRunner,
  ) {}

  /** One page of the site's requests, with how many leads each person has now. */
  async list(
    user: AuthenticatedUser,
    siteId: string,
    query: { cursor?: string | undefined; limit: number },
  ): Promise<DataRequestListResponse> {
    const { scope, site } = await this.sites.access(user, siteId, 'personalData.manage');
    const page = await this.requests.listForSite(scope, site._id, query.cursor, query.limit);
    const people = page.items.map(personOfRequest);
    // A deleted person has no keys left, hence no count.
    const known = people.filter((person): person is LeadPerson => person !== null);
    const counts = await this.leads.countPeople(scope, site._id, known, CAPPED_COUNT_LIMIT);
    const countOf = new Map(known.map((person, index) => [person, counts[index] ?? 0]));
    return {
      items: page.items.map((row, index) => {
        const person = people[index];
        return toDataRequest(
          row,
          person === null || person === undefined ? null : toCappedCount(countOf.get(person) ?? 0),
        );
      }),
      nextCursor: page.nextCursor,
    };
  }

  async create(
    user: AuthenticatedUser,
    siteId: string,
    values: CreateDataRequestValues,
  ): Promise<DataRequestDetail> {
    const { scope, site } = await this.sites.access(user, siteId, 'personalData.manage');
    const now = new Date();
    const receivedAt = new Date(values.receivedAt);
    const problem = receivedAtProblem(receivedAt, now);
    if (problem !== null) {
      throw validationFailed([{ path: ['receivedAt'], code: 'custom', message: problem }]);
    }
    const contact = { name: values.name, phone: values.phone, email: values.email };
    // The schema already stored the email in lowercase, as `leadSearchKeys` does.
    const search = {
      phone: contact.phone === null ? null : phoneSearchKey(contact.phone),
      email: contact.email,
    };
    // Read before the request is stored: a failure afterwards would answer 500 for a request
    // already recorded, and "Ghi nhận" pressed again would record it twice.
    const found = await this.leadsOf(scope, site, personOfRequest({ search }));
    const record = await this.transactions.run(async (tx) => {
      // The request holds personal data: it must not outlive a site deleted meanwhile (ADR-027).
      if (!(await this.siteRecords.recordDataWrite(scope, site._id, tx))) {
        throw notFound(SITE_NOT_FOUND);
      }
      const created = await this.requests.insert(
        scope,
        site._id,
        {
          contact,
          search,
          type: values.type,
          receivedAt,
          ...dataRequestDeadlines(receivedAt),
        },
        now,
        tx,
      );
      await this.activity.record(scope, { siteId: site._id, type: 'data_request.created' }, tx);
      return created;
    });
    // Its log has one entry, by the user who recorded it.
    const recorder = { id: user.id.toHexString(), name: user.name };
    return toDataRequestDetail(
      record,
      found.counted,
      found.matches,
      found.titles,
      new Map([[recorder.id, recorder]]),
    );
  }

  async get(
    user: AuthenticatedUser,
    siteId: string,
    requestId: string,
  ): Promise<DataRequestDetail> {
    const { scope, site, request } = await this.requestAccess(user, siteId, requestId);
    return this.detail(scope, site, request);
  }

  /** "Đã phản hồi": the person was told their request is being handled. */
  async respond(
    user: AuthenticatedUser,
    siteId: string,
    requestId: string,
  ): Promise<DataRequestDetail> {
    const { scope, site, request } = await this.requestAccess(user, siteId, requestId);
    this.requireStep('respond', request);
    const updated = await this.requests.markResponded(
      scope,
      request._id,
      this.entry(scope, 'responded', null),
    );
    if (!updated) {
      throw stepConflict('Yêu cầu này vừa được cập nhật');
    }
    return this.detail(scope, site, updated);
  }

  /** The file the owner sends to a person who asked to see their data. */
  async exportFile(
    user: AuthenticatedUser,
    siteId: string,
    requestId: string,
    format: PersonExportRequest,
  ): Promise<LeadFile> {
    const { scope, site, request } = await this.requestAccess(user, siteId, requestId);
    this.requireStep('export', request);
    const person = personOfRequest(request);
    if (person === null) {
      throw stepConflict('Dữ liệu của người này đã bị xóa');
    }
    const { file, count } = await this.exports.exportPersonFile(scope, site, person, format);
    if (
      !(await this.requests.appendLog(scope, request._id, this.entry(scope, 'exported', count)))
    ) {
      throw stepConflict('Yêu cầu này đã hoàn tất');
    }
    return file;
  }

  /** Completes the request (`completeRequest`). */
  async complete(
    user: AuthenticatedUser,
    siteId: string,
    requestId: string,
  ): Promise<DataRequestDetail> {
    const { scope, site, request } = await this.requestAccess(user, siteId, requestId);
    const { completed } = await this.completeRequest(scope, site, request, []);
    return this.detail(scope, site, completed);
  }

  /**
   * "Xóa dữ liệu của người này" with "Gắn với yêu cầu dữ liệu" (board 23): completes a request to
   * delete data, the profile deleted with the request's person (ADR-033). Returns how many leads
   * went.
   */
  async completeDeletionWithProfile(
    user: AuthenticatedUser,
    siteId: string,
    requestId: string,
    contactId: ObjectId,
  ): Promise<number> {
    const { scope, site, request } = await this.requestAccess(user, siteId, requestId);
    if (request.type !== 'delete') {
      throw stepConflict('Chỉ gắn được yêu cầu xóa dữ liệu');
    }
    const { count } = await this.completeRequest(scope, site, request, [contactId]);
    return count ?? 0;
  }

  /**
   * Completes the request. A deletion deletes the person's leads and masks the contact of each of
   * their requests in the site; a withdrawal stamps the withdrawn marketing consent on their
   * leads. Each in one transaction with the completion and the activity, so neither can happen
   * without the other.
   */
  private async completeRequest(
    scope: WorkspaceScope,
    site: SiteRecord,
    request: DataRequestRecord,
    profiles: readonly ObjectId[],
  ): Promise<{ completed: DataRequestRecord; count: number | null }> {
    this.requireStep('complete', request);
    const person = personOfRequest(request);
    return this.transactions.run(async (tx) => {
      const at = new Date();
      let count: number | null = null;
      if (request.type === 'delete' && (person !== null || profiles.length > 0)) {
        // The person's other requests are masked with their leads (this one is completed below).
        count = await this.people.deletePersonIn(
          scope,
          site._id,
          person ?? { leadId: null, phone: null, email: null },
          tx,
          profiles,
        );
      } else if (person !== null && request.type === 'withdraw_marketing') {
        count = await this.leads.withdrawMarketing(scope, site._id, person, at, tx);
        await this.contacts.withdrawMarketing(scope, site._id, person, tx);
      }
      const updated = await this.requests.complete(
        scope,
        request._id,
        {
          entry: { ...this.entry(scope, 'completed', count), at },
          count,
          maskedContact: request.type === 'delete' ? maskContact(request.contact) : null,
        },
        tx,
      );
      if (!updated) {
        // Nothing of this one is kept. Either another completion came first, or the request went
        // with its site (ADR-027): the committed state tells which.
        if ((await this.requests.findById(scope, request._id)) === null) {
          throw notFound(DATA_REQUEST_NOT_FOUND);
        }
        throw stepConflict('Yêu cầu này đã hoàn tất');
      }
      await this.activity.record(
        scope,
        { siteId: site._id, type: 'data_request.completed', data: { count } },
        tx,
      );
      return { completed: updated, count };
    });
  }

  /**
   * Entry point of every request endpoint, through the request's site (ADR-025). Unknown requests
   * and requests of another site or workspace are all 404 (ADR-003).
   */
  private async requestAccess(
    user: AuthenticatedUser,
    siteId: string,
    requestId: string,
  ): Promise<RequestAccess> {
    const id = toObjectId(requestId, DATA_REQUEST_NOT_FOUND);
    const { scope, site } = await this.sites.accessById(
      user,
      toObjectId(siteId, DATA_REQUEST_NOT_FOUND),
      'personalData.manage',
      DATA_REQUEST_NOT_FOUND,
    );
    const request = await this.requests.findById(scope, id);
    if (!request || !request.siteId.equals(site._id)) {
      throw notFound(DATA_REQUEST_NOT_FOUND);
    }
    return { scope, site, request };
  }

  private requireStep(step: DataRequestStep, request: DataRequestRecord): void {
    const problem = stepProblem(step, request);
    if (problem !== null) {
      throw stepConflict(problem);
    }
  }

  private entry(
    scope: WorkspaceScope,
    action: DataRequestLogRecord['action'],
    count: number | null,
  ): DataRequestLogRecord {
    return { at: new Date(), actorId: scope.userId, action, count };
  }

  /** The request with its log and the person's leads now (at most `DATA_REQUEST_MATCHES_MAX`). */
  private async detail(
    scope: WorkspaceScope,
    site: SiteRecord,
    request: DataRequestRecord,
  ): Promise<DataRequestDetail> {
    const [found, users] = await Promise.all([
      this.leadsOf(scope, site, personOfRequest(request)),
      this.users.findRefs(request.log.map((entry) => entry.actorId)),
    ]);
    return toDataRequestDetail(request, found.counted, found.matches, found.titles, users);
  }

  /** The leads of the person a request is about, with the titles of their pages. */
  private async leadsOf(scope: WorkspaceScope, site: SiteRecord, person: LeadPerson | null) {
    const [counted, matches] = await Promise.all([
      person === null ? null : this.leads.countPerson(scope, site._id, person, CAPPED_COUNT_LIMIT),
      person === null
        ? []
        : this.leads.listPerson(scope, site._id, person, DATA_REQUEST_MATCHES_MAX),
    ]);
    const titles = await this.pages.findTitles(
      scope,
      matches.map((lead) => lead.pageId),
    );
    return { counted: counted === null ? null : toCappedCount(counted), matches, titles };
  }
}
