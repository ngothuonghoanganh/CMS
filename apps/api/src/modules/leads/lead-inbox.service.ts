import { Injectable } from '@nestjs/common';
import {
  type LeadCounts,
  type LeadDetail,
  type LeadFilters,
  type LeadListResponse,
  recentDaysWindow,
  type updateLeadContactRequestSchema,
  type updateLeadRequestSchema,
} from '@plp/contracts';
import type { z } from 'zod';
import { AppError, notFound } from '../../shared/errors.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { LeadNotifier } from '../notifications/lead-notifier.service.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { ReleasesRepository } from '../publishing/releases.repository.js';
import type { SiteRecord } from '../sites/site.schema.js';
import { SitesService } from '../sites/sites.service.js';
import { AccessService } from '../workspaces/access.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { type LeadCriteria, leadCriteria } from './domain/lead-filters.js';
import { LeadAccessService, personOfLead } from './lead-access.service.js';
import {
  CAPPED_COUNT_LIMIT,
  consentOf,
  LEAD_NOT_FOUND,
  pageTitleOf,
  toCappedCount,
  toLeadDetail,
  toLeadListItem,
} from './lead-dto.js';
import type { LeadRecord } from './lead.schema.js';
import { LeadsRepository } from './leads.repository.js';

/** A page of the inbox: the filters, optionally a search, and the keyset position. */
export type LeadPageQuery = LeadFilters & { cursor?: string | undefined; limit: number };
export type UpdateLeadValues = z.output<typeof updateLeadRequestSchema>;
export type UpdateLeadContactValues = z.output<typeof updateLeadContactRequestSchema>;

/** Leads not suspected of spam, of every page, status and time. */
const INBOX: LeadCriteria = {
  spam: false,
  pageId: null,
  status: null,
  createdIn: null,
  search: null,
};

/**
 * The lead inbox (board 10, ADR-018). Owners and editors read leads and triage them: status,
 * internal note, spam. Personal data is returned to members only and never logged (rule 10).
 */
@Injectable()
export class LeadInboxService {
  constructor(
    private readonly sites: SitesService,
    private readonly access: AccessService,
    private readonly leadAccess: LeadAccessService,
    private readonly leads: LeadsRepository,
    private readonly pages: PagesRepository,
    private readonly releases: ReleasesRepository,
    private readonly notifier: LeadNotifier,
  ) {}

  /**
   * One page of leads, newest first, with the count of each folder under the same filters. The
   * search arrives in a request body (`POST …/leads/search`), never in a URL (rule 10).
   */
  async list(
    user: AuthenticatedUser,
    siteId: string,
    query: LeadPageQuery,
  ): Promise<LeadListResponse> {
    const { scope, site } = await this.sites.access(user, siteId);
    const criteria = leadCriteria(query, new Date());
    const [page, inbox, spam] = await Promise.all([
      this.leads.listForInbox(scope, site._id, criteria, query.cursor, query.limit),
      this.leads.countMatching(scope, site._id, { ...criteria, spam: false }, CAPPED_COUNT_LIMIT),
      this.leads.countMatching(scope, site._id, { ...criteria, spam: true }, CAPPED_COUNT_LIMIT),
    ]);
    const titles = await this.pages.findTitles(
      scope,
      page.items.map((row) => row.pageId),
    );
    return {
      items: page.items.map((row) => toLeadListItem(row, pageTitleOf(titles, row.pageId))),
      nextCursor: page.nextCursor,
      counts: { inbox: toCappedCount(inbox), spam: toCappedCount(spam) },
    };
  }

  /**
   * "N mới" in the sidebar and "Lead 7 ngày qua" on the dashboard, spam excluded. "Mới" counts
   * every time, so the badge matches the inbox it opens (ADR-018).
   */
  async counts(user: AuthenticatedUser, siteId: string): Promise<LeadCounts> {
    const { scope, site } = await this.sites.access(user, siteId);
    const [fresh, recent] = await Promise.all([
      this.leads.countMatching(scope, site._id, { ...INBOX, status: 'new' }, CAPPED_COUNT_LIMIT),
      this.leads.countMatching(
        scope,
        site._id,
        { ...INBOX, createdIn: recentDaysWindow(new Date(), 7) },
        CAPPED_COUNT_LIMIT,
      ),
    ]);
    return { new: toCappedCount(fresh), last7Days: toCappedCount(recent) };
  }

  async get(user: AuthenticatedUser, leadId: string): Promise<LeadDetail> {
    const { scope, site, lead } = await this.leadAccess.access(user, leadId);
    return this.detail(scope, site, lead);
  }

  /** Status, note and spam flag; the last change wins, like any field edited in place. */
  async update(
    user: AuthenticatedUser,
    leadId: string,
    input: UpdateLeadValues,
  ): Promise<LeadDetail> {
    const { scope, site, lead } = await this.leadAccess.access(user, leadId);
    const updated = await this.leads.update(scope, lead._id, input);
    if (!updated) {
      // Deleted (by the owner or its retention period) since it was read.
      throw notFound(LEAD_NOT_FOUND);
    }
    return this.detail(scope, site, updated);
  }

  /**
   * "Sửa thông tin", owner only: corrects the person's name, phone number or email, e.g. when they
   * asked for it (ADR-017). The lead is then found under its new phone number and email.
   */
  async updateContact(
    user: AuthenticatedUser,
    leadId: string,
    contact: UpdateLeadContactValues,
  ): Promise<LeadDetail> {
    const { scope, site, lead } = await this.leadAccess.access(user, leadId);
    this.access.requireOwner(scope);
    const updated = await this.leads.updateContact(scope, lead._id, contact);
    if (!updated) {
      throw notFound(LEAD_NOT_FOUND);
    }
    return this.detail(scope, site, updated);
  }

  /** "Gửi lại": a failed email notification starts over with three new attempts (ADR-018). */
  async retryNotification(user: AuthenticatedUser, leadId: string): Promise<LeadDetail> {
    const { scope, site, lead } = await this.leadAccess.access(user, leadId);
    const reset = await this.leads.resetFailedNotification(scope, lead._id, new Date());
    if (!reset) {
      throw new AppError(409, 'conflict', 'Email thông báo của lead này không ở trạng thái lỗi', {
        detail: 'Tải lại để xem trạng thái mới nhất.',
      });
    }
    this.notifier.enqueue(reset._id);
    return this.detail(scope, site, reset);
  }

  private async detail(
    scope: WorkspaceScope,
    site: SiteRecord,
    lead: LeadRecord,
  ): Promise<LeadDetail> {
    const [titles, captures, personLeads] = await Promise.all([
      this.pages.findTitles(scope, [lead.pageId]),
      this.releases.findLeadCaptures(scope, [lead.releaseId]),
      this.leads.countPerson(scope, site._id, personOfLead(lead), CAPPED_COUNT_LIMIT),
    ]);
    return toLeadDetail(lead, {
      pageTitle: pageTitleOf(titles, lead.pageId),
      capture: consentOf(captures, lead),
      personLeads: toCappedCount(personLeads),
    });
  }
}
