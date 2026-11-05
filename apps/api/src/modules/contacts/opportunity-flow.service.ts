import { Injectable } from '@nestjs/common';
import {
  type MoveOpportunityValues,
  type OpportunityStage,
  type RetentionMonths,
  vnDayOf,
} from '@plp/contracts';
import { AppError, notFound } from '../../shared/errors.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import type { LeadRecord } from '../leads/lead.schema.js';
import { LeadsRepository } from '../leads/leads.repository.js';
import { PagesRepository } from '../pages/pages.repository.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import type { ContactRecord } from './contact.schema.js';
import { ContactRecordsRepository } from './contact-records.repository.js';
import { ContactsRepository } from './contacts.repository.js';
import type { OpportunityRecord } from './opportunity.schema.js';
import { OpportunitiesRepository, type StageChange } from './opportunities.repository.js';

export const OPPORTUNITY_NOT_FOUND = 'Không tìm thấy cơ hội';
/** An opportunity a lead opens on a page that is gone meanwhile. */
const UNTITLED = 'Cơ hội mới';

/** The lead joined a profile or an opportunity meanwhile: its transaction must not count it again. */
export class LeadAlreadyLinkedError extends Error {
  constructor() {
    super('The lead already joined a contact');
    this.name = 'LeadAlreadyLinkedError';
  }
}

/** The card moved meanwhile, on another screen or by someone else. */
export function stageConflict(): AppError {
  return new AppError(409, 'conflict', 'Cơ hội này vừa được chuyển giai đoạn', {
    detail: 'Tải lại để xem giai đoạn mới nhất.',
  });
}

/** What a move writes besides the stage: "Thắng" and "Thua" keep their details, others clear them. */
export function stageChangeOf(request: MoveOpportunityValues, at: Date): StageChange {
  switch (request.stage) {
    case 'won':
      return { stage: 'won', won: { value: request.value, on: request.on }, lost: null, at };
    case 'lost':
      return { stage: 'lost', won: null, lost: { reason: request.reason, note: request.note }, at };
    default:
      return { stage: request.stage, won: null, lost: null, at };
  }
}

/**
 * The opportunities a lead joins and the moves through the fixed pipeline (ADR-033), in the
 * caller's transaction. A lead's status is the stage of its opportunity, written with every move,
 * and every move is one entry of the profile's timeline.
 */
@Injectable()
export class OpportunityFlow {
  constructor(
    private readonly opportunities: OpportunitiesRepository,
    private readonly contacts: ContactsRepository,
    private readonly records: ContactRecordsRepository,
    private readonly leads: LeadsRepository,
    private readonly pages: PagesRepository,
  ) {}

  /**
   * A new lead joins the profile's open opportunity, or opens a "Mới" one named after its page.
   * `backfill` is a lead stored before K3: its status, already a stage, moves the opportunity.
   */
  async joinLead(
    ref: WorkspaceRef,
    lead: LeadRecord,
    contact: ContactRecord,
    tx: Tx,
    backfill = false,
  ): Promise<OpportunityRecord> {
    const open = await this.opportunities.findOpenOfContact(ref, lead.siteId, contact._id, tx);
    const opportunity =
      open ??
      (await this.open(
        ref,
        contact,
        {
          title: (await this.pages.findPublicTitle(ref, lead.pageId)) ?? UNTITLED,
          value: null,
          sourcePageId: lead.pageId,
          actorId: null,
        },
        lead.createdAt,
        tx,
      ));
    if (
      !(await this.leads.linkOpportunity(ref, lead._id, opportunity._id, opportunity.stage, tx))
    ) {
      throw new LeadAlreadyLinkedError();
    }
    if (!backfill || lead.status === opportunity.stage || lead.status === 'new') {
      return opportunity;
    }
    const at = lead.createdAt;
    const change: StageChange =
      lead.status === 'won'
        ? { stage: 'won', won: { value: null, on: vnDayOf(at) }, lost: null, at }
        : lead.status === 'lost'
          ? { stage: 'lost', won: null, lost: { reason: 'unreachable', note: '' }, at }
          : { stage: lead.status, won: null, lost: null, at };
    return this.apply(ref, contact, opportunity, change, null, tx);
  }

  /** "Tạo cơ hội": a "Mới" opportunity of the profile, given to its owner. */
  async create(
    scope: WorkspaceScope,
    contact: ContactRecord,
    input: { title: string; value: number | null },
    at: Date,
    tx: Tx,
  ): Promise<OpportunityRecord> {
    return this.open(
      scope,
      contact,
      { title: input.title, value: input.value, sourcePageId: null, actorId: scope.userId },
      at,
      tx,
    );
  }

  /**
   * "Chuyển giai đoạn" from the pipeline or the inbox: refused (409) when the card is no longer
   * where the member saw it. "Thua" closes the opportunity's open tasks.
   */
  async move(
    scope: WorkspaceScope,
    siteId: ObjectId,
    id: ObjectId,
    request: MoveOpportunityValues,
    months: RetentionMonths,
    at: Date,
    tx: Tx,
  ): Promise<OpportunityRecord> {
    const opportunity = await this.opportunities.findById(scope, siteId, id, tx);
    if (opportunity === null) {
      throw notFound(OPPORTUNITY_NOT_FOUND);
    }
    if (opportunity.stage !== request.from) {
      throw stageConflict();
    }
    if (request.stage === request.from) {
      return opportunity;
    }
    // A move is an interaction: the profile and its records live on from now (ADR-033).
    const contact = await this.contacts.touch(scope, siteId, opportunity.contactId, at, months, tx);
    if (contact === null) {
      throw notFound(OPPORTUNITY_NOT_FOUND);
    }
    await this.records.alignExpiry(scope, siteId, contact._id, contact.expiresAt, tx);
    const moved = await this.apply(
      scope,
      contact,
      opportunity,
      stageChangeOf(request, at),
      scope.userId,
      tx,
    );
    if (moved.stage === 'lost') {
      await this.records.closeTasksOfOpportunity(scope, siteId, moved._id, at, tx);
    }
    return moved;
  }

  private async open(
    ref: WorkspaceRef,
    contact: ContactRecord,
    input: {
      title: string;
      value: number | null;
      sourcePageId: ObjectId | null;
      actorId: ObjectId | null;
    },
    at: Date,
    tx: Tx,
  ): Promise<OpportunityRecord> {
    const created = await this.opportunities.insert(
      ref,
      contact.siteId,
      contact._id,
      {
        title: input.title,
        stage: 'new',
        value: input.value,
        valueBy: input.value === null ? null : input.actorId,
        won: null,
        lost: null,
        ownerId: contact.ownerId,
        sourcePageId: input.sourcePageId,
        at,
        expiresAt: contact.expiresAt,
      },
      tx,
    );
    await this.records.insertStageEvent(
      ref,
      contact.siteId,
      contact._id,
      {
        opportunityId: created._id,
        title: created.title,
        from: null,
        to: 'new',
        value: input.value,
      },
      input.actorId,
      at,
      contact.expiresAt,
      tx,
    );
    return created;
  }

  private async apply(
    ref: WorkspaceRef,
    contact: ContactRecord,
    opportunity: OpportunityRecord,
    change: StageChange,
    actorId: ObjectId | null,
    tx: Tx,
  ): Promise<OpportunityRecord> {
    const from: OpportunityStage = opportunity.stage;
    const moved = await this.opportunities.move(
      ref,
      contact.siteId,
      opportunity._id,
      from,
      change,
      tx,
    );
    if (moved === null) {
      throw stageConflict();
    }
    await this.leads.setStatusOfOpportunity(ref, moved._id, moved.stage, tx);
    await this.records.insertStageEvent(
      ref,
      contact.siteId,
      contact._id,
      {
        opportunityId: moved._id,
        title: moved.title,
        from,
        to: moved.stage,
        value: moved.stage === 'won' ? (moved.won?.value ?? null) : moved.value,
      },
      actorId,
      change.at,
      contact.expiresAt,
      tx,
    );
    return moved;
  }
}
