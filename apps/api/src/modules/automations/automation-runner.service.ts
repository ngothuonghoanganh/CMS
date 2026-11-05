import { Injectable, Logger } from '@nestjs/common';
import {
  AUTOMATION_FAILURES_BEFORE_PAUSE,
  AUTOMATION_RUNS_PER_MONTH,
  type AutomationAction,
  CONTACT_TAGS_MAX,
  SITE_CONTACT_TAGS_MAX,
  vnMonthOf,
} from '@plp/contracts';
import { type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { type Tx, TransactionRunner } from '../../shared/persistence/transaction.js';
import type { WorkspaceRef } from '../../shared/persistence/workspace-databases.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import { UsersRepository } from '../auth/users.repository.js';
import { ContactAssignees } from '../contacts/contact-assignees.service.js';
import type { ContactRecord } from '../contacts/contact.schema.js';
import { ContactRecordsRepository } from '../contacts/contact-records.repository.js';
import { ContactsRepository } from '../contacts/contacts.repository.js';
import { OpportunitiesRepository } from '../contacts/opportunities.repository.js';
import type { OpportunityRecord } from '../contacts/opportunity.schema.js';
import type { TaskRecord } from '../contacts/profile.schema.js';
import type { LeadRecord } from '../leads/lead.schema.js';
import { LeadsRepository } from '../leads/leads.repository.js';
import { EmailSender, EmailSendError } from '../notifications/email-sender.js';
import { automationNoticeEmail } from '../notifications/emails.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { WorkspaceLinks } from '../workspaces/workspace-links.js';
import type {
  AutomationRecord,
  AutomationRunRecord,
  AutomationStepRecord,
} from './automation.schema.js';
import { AutomationRunsRepository, type RunUpdate } from './automation-runs.repository.js';
import { AutomationTriggers } from './automation-triggers.service.js';
import { AutomationUsageRepository } from './automation-usage.repository.js';
import { AutomationsRepository } from './automations.repository.js';
import {
  conditionsHold,
  renderSubject,
  retryAt,
  type RunFacts,
} from './domain/automation-rules.js';

/** How long a run holds its lock; past it, another instance takes the run again (ADR-034). */
export const RUN_LOCK_MS = 2 * 60_000;
/** Runs of one workspace an instance works on at once. */
export const RUNS_AT_ONCE = 4;

/**
 * A step that did not do its work. `retryable` steps are tried again (ADR-034); the others fail
 * the run at once, e.g. a member who is gone (`member_gone`).
 */
export class StepFailure extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    options?: { cause: unknown },
  ) {
    super(`Automation step failed: ${code}`, options);
    this.name = 'StepFailure';
  }
}

/** What a run acts on, read when it starts. */
interface RunContext {
  lead: LeadRecord | null;
  contact: ContactRecord;
  opportunity: OpportunityRecord | null;
  task: TaskRecord | null;
}

function capitalized(text: string): string {
  return text.charAt(0).toLocaleUpperCase('vi') + text.slice(1);
}

/**
 * Runs the automations' runs (ADR-034): the conditions on the data as it is now, one run taken
 * from the monthly quota once the first action starts, then the actions one after the other.
 * Actions run as the automation, not as the member who made it.
 */
@Injectable()
export class AutomationRunner {
  private readonly logger = new Logger(AutomationRunner.name);

  constructor(
    private readonly automations: AutomationsRepository,
    private readonly runs: AutomationRunsRepository,
    private readonly usage: AutomationUsageRepository,
    private readonly triggers: AutomationTriggers,
    private readonly contacts: ContactsRepository,
    private readonly opportunities: OpportunitiesRepository,
    private readonly records: ContactRecordsRepository,
    private readonly leads: LeadsRepository,
    private readonly pages: PagesRepository,
    private readonly sites: SitesRepository,
    private readonly users: UsersRepository,
    private readonly assignees: ContactAssignees,
    private readonly sender: EmailSender,
    private readonly links: WorkspaceLinks,
    private readonly activity: ActivityRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  /** Every run of the workspace due now, `RUNS_AT_ONCE` at a time. */
  async drain(ref: WorkspaceRef): Promise<void> {
    for (;;) {
      const batch: AutomationRunRecord[] = [];
      while (batch.length < RUNS_AT_ONCE) {
        const run = await this.runs.claimDue(ref, new Date(), RUN_LOCK_MS);
        if (run === null) {
          break;
        }
        batch.push(run);
      }
      if (batch.length === 0) {
        return;
      }
      await Promise.all(
        batch.map((run) =>
          this.execute(ref, run).catch((error: unknown) => {
            // Its lock lapses and the queue takes it again; nothing personal goes to the log.
            this.logger.error(
              { err: error, runId: run._id.toHexString() },
              'Automation run stopped on an unexpected error',
            );
          }),
        ),
      );
    }
  }

  async execute(ref: WorkspaceRef, run: AutomationRunRecord): Promise<void> {
    const now = new Date();
    const automation = await this.automations.findById(ref, run.siteId, run.automationId);
    if (automation === null) {
      await this.finish(ref, run, 'skipped', 'automation_gone', now);
      return;
    }
    if (automation.state !== 'on') {
      await this.finish(ref, run, 'stopped', 'paused', now);
      return;
    }
    const context = await this.context(ref, run);
    if (typeof context === 'string') {
      await this.finish(ref, run, 'skipped', context, now);
      return;
    }
    let countedIn = run.countedIn;
    if (countedIn === null) {
      if (!conditionsHold(run.definition.conditions, this.facts(context))) {
        await this.finish(ref, run, 'skipped', 'conditions', now);
        return;
      }
      const month = vnMonthOf(now);
      await this.usage.ensureMonth(ref, month, now);
      if (!(await this.usage.take(ref, month, AUTOMATION_RUNS_PER_MONTH, now))) {
        await this.automations.countSkippedForQuota(ref, automation._id, month);
        await this.finish(ref, run, 'skipped', 'quota', now);
        return;
      }
      countedIn = month;
    }
    const steps: AutomationStepRecord[] = run.steps.map((step) => ({ ...step }));
    for (const [index, action] of run.definition.actions.entries()) {
      const step = steps[index];
      if (step === undefined || step.status === 'succeeded') {
        continue;
      }
      try {
        const summary = await this.perform(ref, run, automation, context, action, index);
        steps[index] = {
          status: 'succeeded',
          attempts: step.attempts + 1,
          at: new Date(),
          error: null,
          summary,
        };
      } catch (error) {
        const failure =
          error instanceof StepFailure
            ? error
            : new StepFailure('internal', true, { cause: error });
        if (!(error instanceof StepFailure)) {
          this.logger.error(
            { err: error, runId: run._id.toHexString(), step: index },
            'Automation step failed unexpectedly',
          );
        }
        const attempts = step.attempts + 1;
        steps[index] = {
          status: 'failed',
          attempts,
          at: new Date(),
          error: { code: failure.code, httpStatus: null },
          summary: null,
        };
        const next = failure.retryable ? retryAt(attempts, new Date()) : null;
        if (next !== null) {
          await this.save(ref, run, { status: 'waiting_retry', steps, countedIn, nextAt: next });
          return;
        }
        await this.fail(ref, run, automation, steps, countedIn);
        return;
      }
    }
    await this.save(ref, run, {
      status: 'succeeded',
      steps,
      countedIn,
      finishedAt: new Date(),
      nextAt: null,
    });
    await this.automations.clearFailures(ref, automation._id);
    const done = steps.flatMap((step) => (step.summary === null ? [] : [step.summary]));
    if (done.length > 0) {
      await this.records.insertAutomationEvent(
        ref,
        run.siteId,
        context.contact._id,
        {
          automationId: automation._id,
          name: automation.name,
          summary: `${capitalized(done.join(', '))}.`,
        },
        new Date(),
        context.contact.expiresAt,
      );
    }
  }

  /** The data the run acts on; a reason to skip it when the event no longer holds. */
  private async context(ref: WorkspaceRef, run: AutomationRunRecord): Promise<RunContext | string> {
    const { event, siteId } = run;
    let lead: LeadRecord | null = null;
    let task: TaskRecord | null = null;
    let opportunityId: ObjectId | null = event.opportunityId;
    let contactId: ObjectId | null = run.contactId;
    if (event.leadId !== null) {
      lead = await this.leads.findOf(ref, siteId, event.leadId);
      if (lead === null) {
        return 'gone';
      }
      // "Lead còn “Mới” sau N phút": a lead moved on meanwhile has nothing left to remind.
      if (event.kind === 'lead_still_new' && lead.status !== 'new') {
        return 'not_new';
      }
      contactId = lead.contactId ?? contactId;
      opportunityId = lead.opportunityId ?? opportunityId;
    }
    if (event.taskId !== null) {
      task = await this.records.findTask(ref, siteId, event.taskId);
      if (task === null || task.doneAt !== null || task.dueAt.getTime() !== event.at.getTime()) {
        return 'task_done';
      }
      contactId = task.contactId;
      opportunityId = task.opportunityId ?? opportunityId;
    }
    const opportunity =
      opportunityId === null ? null : await this.opportunities.findById(ref, siteId, opportunityId);
    if (event.kind === 'opportunity_stage_changed' && opportunity === null) {
      return 'gone';
    }
    const contact =
      contactId === null ? null : await this.contacts.findById(ref, siteId, contactId);
    if (contact === null) {
      return 'gone';
    }
    return { lead, contact, opportunity, task };
  }

  private facts(context: RunContext): RunFacts {
    const opportunity = context.opportunity;
    return {
      source: context.lead === null ? null : context.lead.source,
      pageId:
        context.lead?.pageId.toHexString() ?? opportunity?.sourcePageId?.toHexString() ?? null,
      tags: context.contact.tags,
      opportunityValue:
        opportunity === null
          ? null
          : opportunity.stage === 'won'
            ? (opportunity.won?.value ?? opportunity.value)
            : opportunity.value,
      stage: opportunity?.stage ?? null,
    };
  }

  /** One action; returns what it did, in words for the timeline. */
  private async perform(
    ref: WorkspaceRef,
    run: AutomationRunRecord,
    automation: AutomationRecord,
    context: RunContext,
    action: AutomationAction,
    index: number,
  ): Promise<string> {
    const siteId = run.siteId;
    switch (action.kind) {
      case 'assign': {
        const memberIds = action.memberIds;
        if (memberIds.length === 0) {
          throw new StepFailure('not_configured', false);
        }
        const turn =
          memberIds.length === 1
            ? 0
            : (await this.automations.takeRotation(ref, automation._id)) % memberIds.length;
        const memberId = memberIds[turn];
        if (memberId === undefined) {
          throw new StepFailure('not_configured', false);
        }
        const member = await this.member(ref, siteId, memberId);
        await this.contacts.assign(ref, siteId, [context.contact._id], member.id);
        if (context.opportunity !== null && context.opportunity.ownerId === null) {
          await this.opportunities.update(ref, siteId, context.opportunity._id, {
            ownerId: member.id,
          });
        }
        context.contact = { ...context.contact, ownerId: member.id };
        return `giao cho ${member.name}`;
      }
      case 'create_task': {
        const assignee =
          action.assignee === 'owner'
            ? await this.owner(ref, siteId, context.contact)
            : await this.member(ref, siteId, action.assignee);
        const at = new Date();
        const dueAt = new Date(at.getTime() + action.dueInMinutes * 60_000);
        await this.transactions.run(async (tx) => {
          const task = await this.records.insertTask(
            ref,
            siteId,
            context.contact._id,
            {
              opportunityId: context.opportunity?._id ?? null,
              title: action.title,
              dueAt,
              assigneeId: assignee.id,
              createdBy: automation._id,
              at,
              expiresAt: context.contact.expiresAt,
            },
            tx,
            'automation',
          );
          await this.triggers.taskCreated(
            ref,
            {
              siteId,
              taskId: task._id,
              contactId: context.contact._id,
              opportunityId: task.opportunityId,
              dueAt,
            },
            tx,
          );
        });
        return `tạo công việc “${action.title}”`;
      }
      case 'add_tag': {
        if (
          !(await this.contacts.hasTag(ref, siteId, action.tag)) &&
          (await this.contacts.tags(ref, siteId)).length >= SITE_CONTACT_TAGS_MAX
        ) {
          throw new StepFailure('too_many_tags', false);
        }
        const tagged = await this.contacts.addTag(
          ref,
          siteId,
          [context.contact._id],
          action.tag,
          CONTACT_TAGS_MAX,
        );
        if (tagged === 0) {
          throw new StepFailure('too_many_tags', false);
        }
        return `gắn nhãn “${action.tag}”`;
      }
      case 'email':
        return this.email(ref, run, automation, context, action, index);
    }
  }

  private async email(
    ref: WorkspaceRef,
    run: AutomationRunRecord,
    automation: AutomationRecord,
    context: RunContext,
    action: Extract<AutomationAction, { kind: 'email' }>,
    index: number,
  ): Promise<string> {
    const siteId = run.siteId;
    const recipients =
      action.to === 'owner'
        ? [await this.owner(ref, siteId, context.contact)]
        : await Promise.all(action.to.map((id) => this.member(ref, siteId, id)));
    const contacts = await this.users.findContacts(recipients.map((person) => person.id));
    const to = contacts.map((contact) => contact.email);
    if (to.length === 0) {
      throw new StepFailure('member_gone', false);
    }
    const [siteName, pageTitle, owner, origin] = await Promise.all([
      this.sites.findPublicName(ref, siteId),
      context.lead !== null
        ? this.pages.findPublicTitle(ref, context.lead.pageId)
        : context.opportunity?.sourcePageId
          ? this.pages.findPublicTitle(ref, context.opportunity.sourcePageId)
          : Promise.resolve(null),
      context.contact.ownerId === null
        ? Promise.resolve(null)
        : this.users.findRefs([context.contact.ownerId]),
      this.links.originOf(ref.workspaceId),
    ]);
    if (siteName === null) {
      throw new StepFailure('gone', false);
    }
    const ownerName =
      context.contact.ownerId === null
        ? null
        : (owner?.get(context.contact.ownerId.toHexString())?.name ?? null);
    const profileUrl = `${origin}/sites/${siteId.toHexString()}/contacts/${context.contact._id.toHexString()}`;
    const values = { contactName: context.contact.name, pageTitle, ownerName, profileUrl };
    try {
      await this.sender.send({
        to,
        ...automationNoticeEmail({
          runId: run._id.toHexString(),
          step: index,
          siteName,
          automationName: automation.name,
          subject: renderSubject(action.subject, values),
          contactName: context.contact.name,
          pageTitle,
          ownerName,
          profileUrl,
        }),
      });
    } catch (error) {
      if (error instanceof EmailSendError) {
        throw new StepFailure(`email_${error.code}`, true, { cause: error });
      }
      throw error;
    }
    return `gửi email cho ${to.length} người`;
  }

  /** The profile's owner, who must still see the site's customers. */
  private async owner(
    ref: WorkspaceRef,
    siteId: ObjectId,
    contact: ContactRecord,
  ): Promise<{ id: ObjectId; name: string }> {
    if (contact.ownerId === null) {
      throw new StepFailure('no_owner', false);
    }
    return this.member(ref, siteId, contact.ownerId.toHexString());
  }

  /** A member the step names: gone from the workspace or the site is `member_gone` (ADR-034). */
  private async member(
    ref: WorkspaceRef,
    siteId: ObjectId,
    id: string,
  ): Promise<{ id: ObjectId; name: string }> {
    const person = (await this.assignees.list(ref, siteId)).find((item) => item.id === id);
    if (person === undefined) {
      throw new StepFailure('member_gone', false);
    }
    return { id: toObjectId(id), name: person.name };
  }

  private async finish(
    ref: WorkspaceRef,
    run: AutomationRunRecord,
    status: 'skipped' | 'stopped',
    reason: string,
    at: Date,
  ): Promise<void> {
    await this.save(ref, run, { status, reason, finishedAt: at, nextAt: null });
  }

  /** Failed for good: the failures in a row count, and the 20th pauses the automation. */
  private async fail(
    ref: WorkspaceRef,
    run: AutomationRunRecord,
    automation: AutomationRecord,
    steps: AutomationStepRecord[],
    countedIn: string,
  ): Promise<void> {
    const at = new Date();
    await this.transactions.run(async (tx) => {
      await this.save(
        ref,
        run,
        { status: 'failed', steps, countedIn, finishedAt: at, nextAt: null },
        tx,
      );
      const paused = await this.automations.countFailure(
        ref,
        automation._id,
        AUTOMATION_FAILURES_BEFORE_PAUSE,
        at,
        tx,
      );
      if (paused !== null) {
        await this.runs.stopWaiting(ref, automation._id, at, tx);
        await this.activity.recordSystem(
          ref,
          { siteId: run.siteId, type: 'automation.auto_paused', data: {} },
          tx,
        );
      }
    });
  }

  private async save(
    ref: WorkspaceRef,
    run: AutomationRunRecord,
    update: RunUpdate,
    tx?: Tx,
  ): Promise<void> {
    if (!(await this.runs.save(ref, run, update, tx))) {
      // Its lock lapsed and another instance took it; that one finishes the run.
      this.logger.warn({ runId: run._id.toHexString() }, 'Automation run was taken over');
    }
  }
}
