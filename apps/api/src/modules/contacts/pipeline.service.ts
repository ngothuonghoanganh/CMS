import { Injectable } from '@nestjs/common';
import {
  type BulkCreateOpportunitiesRequest,
  type CreateOpportunityRequest,
  type MoveOpportunityValues,
  type Opportunity,
  opportunityStages,
  PIPELINE_COLUMN_MAX,
  type PipelineQuery,
  type PipelineResponse,
  type UpdateOpportunityRequest,
  vnDayStart,
  vnMonthOf,
} from '@plp/contracts';
import { notFound, validationFailed } from '../../shared/errors.js';
import { type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { UsersRepository } from '../auth/users.repository.js';
import { retentionOf, type SiteRecord, sitePrivacyOf } from '../sites/site.schema.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { SITE_NOT_FOUND, SitesService } from '../sites/sites.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { ContactAssignees } from './contact-assignees.service.js';
import { CONTACT_NOT_FOUND } from './contact-profile.service.js';
import { ContactRecordsRepository } from './contact-records.repository.js';
import { ContactsRepository } from './contacts.repository.js';
import { toOpportunity } from './domain/profile-dto.js';
import { OpportunitiesRepository } from './opportunities.repository.js';
import { OPPORTUNITY_NOT_FOUND, OpportunityFlow } from './opportunity-flow.service.js';
import type { OpportunityRecord } from './opportunity.schema.js';

/**
 * The pipeline of a site (board 24, ADR-033). `leads.view` reads it; `leads.handle` creates and
 * moves opportunities. Every write is personal data and records the site's `dataSeq` (ADR-027).
 */
@Injectable()
export class PipelineService {
  constructor(
    private readonly sites: SitesService,
    private readonly siteRecords: SitesRepository,
    private readonly opportunities: OpportunitiesRepository,
    private readonly contacts: ContactsRepository,
    private readonly records: ContactRecordsRepository,
    private readonly flow: OpportunityFlow,
    private readonly assignees: ContactAssignees,
    private readonly users: UsersRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  /**
   * The four open columns, then "Thắng" and "Thua" of this month (Vietnam's calendar), each at
   * most `PIPELINE_COLUMN_MAX` cards, with counts and values of all of them.
   */
  async board(
    user: AuthenticatedUser,
    siteId: string,
    query: PipelineQuery,
  ): Promise<PipelineResponse> {
    const { scope, site } = await this.sites.access(user, siteId, 'leads.view');
    const now = new Date();
    const board = {
      ownerId: query.ownerId === undefined ? null : toObjectId(query.ownerId),
      closedSince: vnDayStart(`${vnMonthOf(now)}-01`),
    };
    const [totals, ...columns] = await Promise.all([
      this.opportunities.totals(scope, site._id, opportunityStages, board),
      ...opportunityStages.map((stage) =>
        this.opportunities.column(scope, site._id, stage, board, PIPELINE_COLUMN_MAX),
      ),
    ]);
    const cards = await this.present(scope, site._id, columns.flat());
    const byId = new Map(cards.map((card) => [card.id, card]));
    const total = (stage: (typeof opportunityStages)[number]) =>
      totals.find((row) => row.stage === stage) ?? { count: 0, total: 0 };
    const open = totals.filter((row) => row.stage !== 'won' && row.stage !== 'lost');
    return {
      columns: opportunityStages.map((stage, index) => ({
        stage,
        count: total(stage).count,
        total: total(stage).total,
        items: (columns[index] ?? []).flatMap((item) => {
          const card = byId.get(item._id.toHexString());
          return card ? [card] : [];
        }),
      })),
      summary: {
        open: open.reduce((sum, row) => sum + row.count, 0),
        openValue: open.reduce((sum, row) => sum + row.total, 0),
        wonThisMonth: total('won').count,
        lostThisMonth: total('lost').count,
      },
    };
  }

  async create(
    user: AuthenticatedUser,
    siteId: string,
    request: CreateOpportunityRequest,
  ): Promise<Opportunity> {
    const { scope, site } = await this.sites.access(user, siteId, 'leads.handle');
    const contactId = toObjectId(request.contactId, CONTACT_NOT_FOUND);
    const [created] = await this.openFor(scope, site, [contactId], request);
    if (!created) {
      throw notFound(CONTACT_NOT_FOUND);
    }
    const [card] = await this.present(scope, site._id, [created]);
    if (!card) {
      throw notFound(OPPORTUNITY_NOT_FOUND);
    }
    return card;
  }

  /** "Tạo cơ hội" for profiles selected on board 22: one each, profiles gone meanwhile skipped. */
  async bulkCreate(
    user: AuthenticatedUser,
    siteId: string,
    request: BulkCreateOpportunitiesRequest,
  ): Promise<{ created: number }> {
    const { scope, site } = await this.sites.access(user, siteId, 'leads.handle');
    const ids = request.contactIds.map((id) => toObjectId(id, CONTACT_NOT_FOUND));
    return { created: (await this.openFor(scope, site, ids, request)).length };
  }

  /** The title, the expected value ("do … nhập") or the owner of an opportunity. */
  async update(
    user: AuthenticatedUser,
    siteId: string,
    opportunityId: string,
    request: UpdateOpportunityRequest,
  ): Promise<Opportunity> {
    const { scope, site } = await this.sites.access(user, siteId, 'leads.handle');
    const id = toObjectId(opportunityId, OPPORTUNITY_NOT_FOUND);
    if (request.ownerId !== undefined && request.ownerId !== null) {
      if (!(await this.assignees.includes(scope, site._id, request.ownerId))) {
        throw validationFailed([
          {
            path: ['ownerId'],
            code: 'not_assignable',
            message: 'Người này không xem được khách hàng của site',
          },
        ]);
      }
    }
    const updated = await this.opportunities.update(scope, site._id, id, {
      ...(request.title === undefined ? {} : { title: request.title }),
      ...(request.value === undefined
        ? {}
        : { value: request.value, valueBy: request.value === null ? null : scope.userId }),
      ...(request.ownerId === undefined
        ? {}
        : { ownerId: request.ownerId === null ? null : toObjectId(request.ownerId) }),
    });
    if (updated === null) {
      throw notFound(OPPORTUNITY_NOT_FOUND);
    }
    const [card] = await this.present(scope, site._id, [updated]);
    if (!card) {
      throw notFound(OPPORTUNITY_NOT_FOUND);
    }
    return card;
  }

  /** "Chuyển giai đoạn", "Đánh dấu thắng / thua" and "Mở lại". */
  async move(
    user: AuthenticatedUser,
    siteId: string,
    opportunityId: string,
    request: MoveOpportunityValues,
  ): Promise<Opportunity> {
    const { scope, site } = await this.sites.access(user, siteId, 'leads.handle');
    const id = toObjectId(opportunityId, OPPORTUNITY_NOT_FOUND);
    const moved = await this.transactions.run(async (tx) => {
      if (!(await this.siteRecords.recordDataWrite(scope, site._id, tx))) {
        throw notFound(SITE_NOT_FOUND);
      }
      return this.flow.move(
        scope,
        site._id,
        id,
        request,
        retentionOf(sitePrivacyOf(site)),
        new Date(),
        tx,
      );
    });
    const [card] = await this.present(scope, site._id, [moved]);
    if (!card) {
      throw notFound(OPPORTUNITY_NOT_FOUND);
    }
    return card;
  }

  /** One "Mới" opportunity per profile, in one transaction; each is an interaction. */
  private openFor(
    scope: WorkspaceScope,
    site: SiteRecord,
    contactIds: readonly ObjectId[],
    input: { title: string; value: number | null },
  ): Promise<OpportunityRecord[]> {
    const months = retentionOf(sitePrivacyOf(site));
    const at = new Date();
    return this.transactions.run(async (tx) => {
      if (!(await this.siteRecords.recordDataWrite(scope, site._id, tx))) {
        throw notFound(SITE_NOT_FOUND);
      }
      const created: OpportunityRecord[] = [];
      for (const contactId of contactIds) {
        const contact = await this.contacts.touch(scope, site._id, contactId, at, months, tx);
        if (contact === null) {
          continue;
        }
        await this.records.alignExpiry(scope, site._id, contact._id, contact.expiresAt, tx);
        created.push(await this.flow.create(scope, contact, input, at, tx));
      }
      return created;
    });
  }

  /** Cards with their owner, their profile's name and its next task. */
  private async present(
    scope: WorkspaceScope,
    siteId: ObjectId,
    items: readonly OpportunityRecord[],
  ): Promise<Opportunity[]> {
    const contactIds = items.map((item) => item.contactId);
    const [contacts, next, people] = await Promise.all([
      this.contacts.findByIds(scope, siteId, contactIds),
      this.records.nextTasks(scope, siteId, contactIds),
      this.users.findRefs(
        items.flatMap((item) => [item.ownerId, item.valueBy]).filter((id) => id !== null),
      ),
    ]);
    const names = new Map(contacts.map((contact) => [contact._id.toHexString(), contact.name]));
    return items.flatMap((item) => {
      const name = names.get(item.contactId.toHexString());
      // A profile gone meanwhile (its TTL) takes its opportunities with it.
      return name === undefined
        ? []
        : [toOpportunity(item, people, name, next.get(item.contactId.toHexString()) ?? null)];
    });
  }
}
