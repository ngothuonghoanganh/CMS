import { Injectable } from '@nestjs/common';
import type { OpportunityStage } from '@plp/contracts';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import {
  AUTOMATION_RUN_TTL_DAYS,
  type AutomationEvent,
  type AutomationRecord,
} from './automation.schema.js';
import { AutomationRunsRepository } from './automation-runs.repository.js';
import { AutomationsRepository } from './automations.repository.js';
import { JobWakeupsRepository } from './job-wakeups.repository.js';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** A new lead that joined its profile and opportunity. */
export interface LeadEvent {
  siteId: ObjectId;
  leadId: ObjectId;
  pageId: ObjectId;
  contactId: ObjectId;
  opportunityId: ObjectId;
  at: Date;
}

/**
 * Turns the events of leads, opportunities and tasks into runs of the site's enabled automations
 * (ADR-034), in the event's transaction: the event and its runs are stored together, or neither.
 * Each run waits in the queue at its time, and the workspace wakes by then.
 */
@Injectable()
export class AutomationTriggers {
  constructor(
    private readonly automations: AutomationsRepository,
    private readonly runs: AutomationRunsRepository,
    private readonly wakeups: JobWakeupsRepository,
  ) {}

  /** "Có lead mới" now, and "Lead còn “Mới” sau N phút" at its time. */
  async leadCreated(ref: WorkspaceRef, event: LeadEvent, tx: Tx): Promise<void> {
    const now = new Date();
    const [created, stillNew] = await Promise.all([
      this.automations.listStartedBy(ref, event.siteId, 'lead_created', tx),
      this.automations.listStartedBy(ref, event.siteId, 'lead_still_new', tx),
    ]);
    const base = {
      leadId: event.leadId,
      opportunityId: event.opportunityId,
      taskId: null,
      stage: null,
    };
    const planned: Planned[] = [
      ...created
        .filter((automation) => {
          const trigger = automation.definition.trigger;
          return (
            trigger.kind === 'lead_created' &&
            (trigger.pageIds.length === 0 || trigger.pageIds.includes(event.pageId.toHexString()))
          );
        })
        .map((automation) => ({
          automation,
          eventKey: `lead:${event.leadId.toHexString()}`,
          event: { ...base, kind: 'lead_created' as const, at: event.at },
          dueAt: now,
        })),
      ...stillNew.flatMap((automation) => {
        const trigger = automation.definition.trigger;
        if (trigger.kind !== 'lead_still_new') {
          return [];
        }
        return [
          {
            automation,
            eventKey: `lead:${event.leadId.toHexString()}:${trigger.minutes}`,
            event: { ...base, kind: 'lead_still_new' as const, at: event.at },
            dueAt: new Date(event.at.getTime() + trigger.minutes * MINUTE_MS),
          },
        ];
      }),
    ];
    await this.plan(ref, event.siteId, event.contactId, planned, now, tx);
  }

  /** "Cơ hội chuyển sang …": each move is an event of its own. */
  async stageChanged(
    ref: WorkspaceRef,
    input: {
      siteId: ObjectId;
      opportunityId: ObjectId;
      contactId: ObjectId;
      stage: OpportunityStage;
      at: Date;
    },
    tx: Tx,
  ): Promise<void> {
    const automations = await this.automations.listStartedBy(
      ref,
      input.siteId,
      'opportunity_stage_changed',
      tx,
    );
    const planned = automations
      .filter((automation) => {
        const trigger = automation.definition.trigger;
        return (
          trigger.kind === 'opportunity_stage_changed' &&
          (trigger.stage === null || trigger.stage === input.stage)
        );
      })
      .map((automation) => ({
        automation,
        eventKey: `stage:${input.opportunityId.toHexString()}:${input.at.getTime()}`,
        event: {
          kind: 'opportunity_stage_changed' as const,
          leadId: null,
          opportunityId: input.opportunityId,
          taskId: null,
          stage: input.stage,
          at: input.at,
        },
        dueAt: input.at,
      }));
    await this.plan(ref, input.siteId, input.contactId, planned, input.at, tx);
  }

  /** "Công việc tới hạn mà chưa xong", at the task's due time. */
  async taskCreated(
    ref: WorkspaceRef,
    input: {
      siteId: ObjectId;
      taskId: ObjectId;
      contactId: ObjectId;
      opportunityId: ObjectId | null;
      dueAt: Date;
    },
    tx: Tx,
  ): Promise<void> {
    const automations = await this.automations.listStartedBy(ref, input.siteId, 'task_overdue', tx);
    const planned = automations.map((automation) => ({
      automation,
      eventKey: `task:${input.taskId.toHexString()}:${input.dueAt.getTime()}`,
      event: {
        kind: 'task_overdue' as const,
        leadId: null,
        opportunityId: input.opportunityId,
        taskId: input.taskId,
        stage: null,
        at: input.dueAt,
      },
      dueAt: input.dueAt,
    }));
    await this.plan(ref, input.siteId, input.contactId, planned, new Date(), tx);
  }

  private async plan(
    ref: WorkspaceRef,
    siteId: ObjectId,
    contactId: ObjectId,
    planned: readonly Planned[],
    now: Date,
    tx: Tx,
  ): Promise<void> {
    if (planned.length === 0) {
      return;
    }
    for (const item of planned) {
      await this.runs.enqueue(
        ref,
        {
          siteId,
          automationId: item.automation._id,
          version: item.automation.version,
          definition: item.automation.definition,
          eventKey: item.eventKey,
          event: item.event,
          contactId,
          status: item.dueAt.getTime() > now.getTime() ? 'scheduled' : 'queued',
          nextAt: item.dueAt,
          createdAt: now,
          expiresAt: new Date(now.getTime() + AUTOMATION_RUN_TTL_DAYS * DAY_MS),
        },
        tx,
      );
    }
    const earliest = Math.min(...planned.map((item) => item.dueAt.getTime()));
    await this.wakeups.bump(ref.workspaceId, new Date(earliest), tx);
  }
}

interface Planned {
  automation: AutomationRecord;
  eventKey: string;
  event: AutomationEvent;
  dueAt: Date;
}
