import { Injectable } from '@nestjs/common';
import {
  AUTOMATION_RETRY_MAX,
  AUTOMATION_RUNS_PAGE_SIZE,
  type AutomationRunDetail,
  type AutomationRunFilter,
  type AutomationRunItem,
  type AutomationRunListResponse,
  type AutomationRunStatus,
  type RetryRunsResponse,
  type RevealedSecret,
  type RotateWebhookSecretRequest,
  AUTOMATION_RECENT_HOURS,
  AUTOMATION_RECENT_MAX,
  type AutomationActivation,
  type AutomationDefinition,
  type AutomationDetail,
  type TestAutomationRequest,
  type TestAutomationResponse,
  type updateAutomationRequestSchema,
  AUTOMATION_RUNS_PER_MONTH,
  AUTOMATIONS_PER_SITE_MAX,
  type AutomationListItem,
  type AutomationListResponse,
  can,
  type CreateAutomationRequest,
  nextVnMonthStart,
  type SetAutomationStateRequest,
  vnMonthOf,
} from '@plp/contracts';
import type { z } from 'zod';
import { decodeCursor, encodeCursor } from '../../shared/cursor.js';
import type { Env } from '../../config/env.js';
import { InjectEnv } from '../../shared/env.js';
import { AppError, notFound, validationFailed } from '../../shared/errors.js';
import { type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { UsersRepository } from '../auth/users.repository.js';
import { ContactAssignees } from '../contacts/contact-assignees.service.js';
import { ContactsRepository } from '../contacts/contacts.repository.js';
import { OpportunitiesRepository } from '../contacts/opportunities.repository.js';
import { CAPPED_COUNT_LIMIT } from '../leads/lead-dto.js';
import type { LeadRecord } from '../leads/lead.schema.js';
import { LeadsRepository } from '../leads/leads.repository.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { SITE_NOT_FOUND, SitesService } from '../sites/sites.service.js';
import { CustomRolesRepository } from '../workspaces/custom-roles.repository.js';
import { accessOf } from '../workspaces/domain/member-access.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import type { AutomationRecord, AutomationRunRecord } from './automation.schema.js';
import { AutomationRunsRepository, type RunStats } from './automation-runs.repository.js';
import { AutomationUsageRepository } from './automation-usage.repository.js';
import { AutomationsRepository } from './automations.repository.js';
import { AutomationTriggers, type LeadEvent } from './automation-triggers.service.js';
import { missingSteps, recipeDefinition } from './domain/automation-rules.js';
import { type TestSubject, testDefinition } from './domain/automation-test.js';
import { JobWakeupsRepository } from './job-wakeups.repository.js';
import {
  encryptSecret,
  newSecretId,
  newWebhookSecret,
  type StoredWebhookSecret,
} from './webhook-secrets.js';

export const AUTOMATION_NOT_FOUND = 'Không tìm thấy automation';
const RUN_NOT_FOUND = 'Không tìm thấy lượt chạy';

/** Board 27's filters as run statuses; "Đang chờ" is every run still to finish. */
const FILTER_STATUSES: Record<AutomationRunFilter, readonly AutomationRunStatus[] | null> = {
  all: null,
  failed: ['failed'],
  waiting: ['scheduled', 'queued', 'running', 'waiting_retry'],
  succeeded: ['succeeded'],
};
const DAY_MS = 86_400_000;

export type UpdateAutomationValues = z.output<typeof updateAutomationRequestSchema>;
/** Managers a recipe's emails go to at most. */
const MANAGERS_MAX = 5;

function toItem(
  automation: AutomationRecord,
  stats: RunStats | undefined,
  people: ReadonlyMap<string, { id: string; name: string }>,
  month: string,
): AutomationListItem {
  return {
    id: automation._id.toHexString(),
    name: automation.name,
    state: automation.state,
    pausedReason: automation.pausedReason,
    trigger: automation.definition.trigger,
    missing: missingSteps(automation.definition),
    createdBy: people.get(automation.createdBy.toHexString()) ?? null,
    createdAt: automation.createdAt.toISOString(),
    lastRun:
      stats?.last === null || stats?.last === undefined
        ? null
        : { status: stats.last.status, at: stats.last.at.toISOString() },
    last30Days: { runs: stats?.runs ?? 0, failed: stats?.failed ?? 0 },
    skippedForQuota:
      automation.skippedForQuota.month === month ? automation.skippedForQuota.count : 0,
  };
}

function runItem(run: AutomationRunRecord, names: ReadonlyMap<string, string>): AutomationRunItem {
  return {
    id: run._id.toHexString(),
    status: run.status,
    trigger: run.event.kind,
    contactName: run.contactId === null ? null : (names.get(run.contactId.toHexString()) ?? null),
    createdAt: run.createdAt.toISOString(),
  };
}

/**
 * The automations of a site (board 25, ADR-034). `automations.view` reads them;
 * `automations.manage` creates them from a recipe, enables, pauses and copies them.
 */
@Injectable()
export class AutomationsService {
  constructor(
    private readonly sites: SitesService,
    private readonly siteRecords: SitesRepository,
    private readonly automations: AutomationsRepository,
    private readonly runs: AutomationRunsRepository,
    private readonly usage: AutomationUsageRepository,
    private readonly wakeups: JobWakeupsRepository,
    private readonly assignees: ContactAssignees,
    private readonly workspaces: WorkspacesRepository,
    private readonly customRoles: CustomRolesRepository,
    private readonly users: UsersRepository,
    private readonly activity: ActivityRepository,
    private readonly triggers: AutomationTriggers,
    private readonly leads: LeadsRepository,
    private readonly contacts: ContactsRepository,
    private readonly opportunities: OpportunitiesRepository,
    private readonly pages: PagesRepository,
    private readonly transactions: TransactionRunner,
    @InjectEnv() private readonly env: Env,
  ) {}

  async list(user: AuthenticatedUser, siteId: string): Promise<AutomationListResponse> {
    const { scope, site } = await this.sites.access(user, siteId, 'automations.view');
    const now = new Date();
    const month = vnMonthOf(now);
    const automations = await this.automations.listOfSite(scope, site._id);
    const [stats, used, people] = await Promise.all([
      this.runs.stats(
        scope,
        automations.map((automation) => automation._id),
        new Date(now.getTime() - 30 * DAY_MS),
      ),
      this.usage.usedIn(scope, month),
      this.users.findRefs(automations.map((automation) => automation.createdBy)),
    ]);
    return {
      items: automations.map((automation) =>
        toItem(automation, stats.get(automation._id.toHexString()), people, month),
      ),
      usage: { used, limit: AUTOMATION_RUNS_PER_MONTH, resetsOn: nextVnMonthStart(month) },
    };
  }

  /** "Bắt đầu từ mẫu": a draft filled in from the site's members; "Tạo automation": a blank one. */
  async create(
    user: AuthenticatedUser,
    siteId: string,
    request: CreateAutomationRequest,
  ): Promise<AutomationListItem> {
    const { scope, site } = await this.sites.access(user, siteId, 'automations.manage');
    await this.requireRoom(scope, site._id);
    const recipe = request.recipe ?? null;
    let draft: { name: string; definition: AutomationDefinition } = {
      name: 'Automation mới',
      definition: { trigger: { kind: 'lead_created', pageIds: [] }, conditions: [], actions: [] },
    };
    if (recipe !== null) {
      const [assignees, managers] = await Promise.all([
        this.assignees.list(scope, site._id),
        this.managers(scope, site._id),
      ]);
      draft = recipeDefinition(recipe, {
        assignees: assignees.map((person) => person.id),
        managers,
      });
    }
    const created = await this.automations.insert(scope, site._id, {
      ...draft,
      recipe,
      at: new Date(),
    });
    return this.item(scope, created);
  }

  /** "Nhân bản": a draft copy. */
  async duplicate(
    user: AuthenticatedUser,
    siteId: string,
    automationId: string,
  ): Promise<AutomationListItem> {
    const { scope, site } = await this.sites.access(user, siteId, 'automations.manage');
    const source = await this.find(scope, site._id, automationId);
    await this.requireRoom(scope, site._id);
    const copy = await this.automations.insert(scope, site._id, {
      name: `${source.name} (bản sao)`.slice(0, 80),
      definition: source.definition,
      recipe: source.recipe,
      at: new Date(),
      // The copy signs as the original does, for the same receiving system.
      webhookSecrets: source.webhookSecrets,
    });
    return this.item(scope, copy);
  }

  /**
   * "Bật": only with every step configured. "Tạm dừng": the waiting runs stop; enabling again
   * runs new events only, and starts the failures in a row from 0 (ADR-034).
   */
  async setState(
    user: AuthenticatedUser,
    siteId: string,
    automationId: string,
    request: SetAutomationStateRequest,
  ): Promise<AutomationListItem> {
    const { scope, site } = await this.sites.access(user, siteId, 'automations.manage');
    const automation = await this.find(scope, site._id, automationId);
    if (request.state === 'on') {
      const missing = missingSteps(automation.definition);
      if (missing > 0) {
        throw validationFailed([
          {
            path: ['state'],
            code: 'missing_steps',
            message: `Còn ${missing} bước thiếu cấu hình`,
          },
        ]);
      }
      // Its runs move the workspace's due time inside the events' transactions.
      await this.wakeups.ensure(scope.workspaceId);
    }
    const at = new Date();
    const updated = await this.transactions.run(async (tx) => {
      if (!(await this.siteRecords.recordDataWrite(scope, site._id, tx))) {
        throw notFound(SITE_NOT_FOUND);
      }
      const changed = await this.automations.setState(
        scope,
        site._id,
        automation._id,
        request.state,
        at,
        tx,
      );
      if (changed === null) {
        throw notFound(AUTOMATION_NOT_FOUND);
      }
      if (request.state === 'paused') {
        await this.runs.stopWaiting(scope, automation._id, at, tx);
      }
      if (
        request.state === 'on' &&
        request.includeRecent === true &&
        changed.definition.trigger.kind === 'lead_created'
      ) {
        await this.triggers.replayLeads(
          scope,
          changed,
          await this.recentUnassigned(scope, site._id, changed),
          tx,
        );
      }
      await this.activity.record(
        scope,
        {
          siteId: site._id,
          type: request.state === 'on' ? 'automation.enabled' : 'automation.paused',
        },
        tx,
      );
      return changed;
    });
    return this.item(scope, updated);
  }

  /** Board 26: the automation, its definition, and the choices its steps offer. */
  async detail(
    user: AuthenticatedUser,
    siteId: string,
    automationId: string,
  ): Promise<AutomationDetail> {
    const { scope, site } = await this.sites.access(user, siteId, 'automations.view');
    return this.detailOf(scope, site._id, await this.find(scope, site._id, automationId));
  }

  /** The autosave of board 26: the name and the steps, each save a new version (ADR-034). */
  async update(
    user: AuthenticatedUser,
    siteId: string,
    automationId: string,
    request: UpdateAutomationValues,
  ): Promise<AutomationDetail> {
    const { scope, site } = await this.sites.access(user, siteId, 'automations.manage');
    const automation = await this.find(scope, site._id, automationId);
    // A step changed while it runs could stop every run half-set-up: pause first (ADR-034).
    if (request.definition !== undefined && automation.state === 'on') {
      throw new AppError(409, 'conflict', 'Tạm dừng automation trước khi sửa các bước', {
        detail: 'Lượt chạy đang chờ dùng phiên bản đã bật; bật lại sau khi sửa xong.',
      });
    }
    const secrets =
      request.definition === undefined
        ? null
        : this.withSecrets(request.definition, automation.webhookSecrets);
    const updated = await this.automations.update(
      scope,
      site._id,
      automation._id,
      secrets === null
        ? { name: request.name }
        : { name: request.name, definition: secrets.definition, webhookSecrets: secrets.stored },
      new Date(),
    );
    if (updated === null) {
      throw notFound(AUTOMATION_NOT_FOUND);
    }
    return this.detailOf(scope, site._id, updated, secrets?.revealed ?? []);
  }

  /**
   * "Đổi bí mật" (ADR-034): a new secret for the step, shown once; the old one stops signing at
   * once, also for the runs that wait for a retry. Allowed while the automation is on.
   */
  async rotateSecret(
    user: AuthenticatedUser,
    siteId: string,
    automationId: string,
    request: RotateWebhookSecretRequest,
  ): Promise<RevealedSecret> {
    const { scope, site } = await this.sites.access(user, siteId, 'automations.manage');
    const automation = await this.find(scope, site._id, automationId);
    if (!automation.webhookSecrets.some((item) => item.id === request.secretId)) {
      throw notFound('Không tìm thấy bí mật của bước webhook');
    }
    const secret = newWebhookSecret();
    const stored = encryptSecret(this.secretKey(), request.secretId, secret);
    const updated = await this.automations.update(
      scope,
      site._id,
      automation._id,
      {
        webhookSecrets: automation.webhookSecrets.map((item) =>
          item.id === request.secretId ? stored : item,
        ),
      },
      new Date(),
    );
    if (updated === null) {
      throw notFound(AUTOMATION_NOT_FOUND);
    }
    return { secretId: request.secretId, secret };
  }

  /** Board 27: the runs, newest first, with the failures of the last 30 days and 24 hours. */
  async listRuns(
    user: AuthenticatedUser,
    siteId: string,
    automationId: string,
    filter: AutomationRunFilter,
    cursor: string | undefined,
  ): Promise<AutomationRunListResponse> {
    const { scope, site } = await this.sites.access(user, siteId, 'automations.view');
    const automation = await this.find(scope, site._id, automationId);
    const after = cursor === undefined ? null : decodeCursor(cursor);
    const now = Date.now();
    const [rows, failed, failedLastDay, stats] = await Promise.all([
      this.runs.list(
        scope,
        automation._id,
        FILTER_STATUSES[filter],
        after,
        AUTOMATION_RUNS_PAGE_SIZE + 1,
      ),
      this.runs.countFailed(scope, automation._id, new Date(now - 30 * DAY_MS)),
      this.runs.countFailed(scope, automation._id, new Date(now - DAY_MS)),
      this.runs.stats(scope, [automation._id], new Date(now - 30 * DAY_MS)),
    ]);
    const page = rows.slice(0, AUTOMATION_RUNS_PAGE_SIZE);
    const last = page.at(-1);
    const names = await this.contactNames(scope, site._id, page);
    const counts = stats.get(automation._id.toHexString());
    return {
      items: page.map((run) => runItem(run, names)),
      nextCursor:
        rows.length > AUTOMATION_RUNS_PAGE_SIZE && last !== undefined
          ? encodeCursor({ createdAt: last.createdAt, id: last._id.toHexString() })
          : null,
      failed,
      failedLastDay,
      last30Days: { runs: counts?.runs ?? 0, failed: counts?.failed ?? 0 },
    };
  }

  async run(
    user: AuthenticatedUser,
    siteId: string,
    automationId: string,
    runId: string,
  ): Promise<AutomationRunDetail> {
    const { scope, site } = await this.sites.access(user, siteId, 'automations.view');
    const automation = await this.find(scope, site._id, automationId);
    return this.runDetail(scope, site._id, await this.findRun(scope, automation._id, runId));
  }

  /**
   * "Thử lại bước này": a failed run goes back to the queue at its failed step; the steps done
   * before do not run again, and it takes nothing more from the quota (ADR-034).
   */
  async retryRun(
    user: AuthenticatedUser,
    siteId: string,
    automationId: string,
    runId: string,
  ): Promise<AutomationRunDetail> {
    const { scope, site } = await this.sites.access(user, siteId, 'automations.manage');
    const automation = await this.find(scope, site._id, automationId);
    const run = await this.findRun(scope, automation._id, runId);
    await this.requeue(scope, site._id, automation, [run], (requeued) => {
      if (requeued === 0) {
        throw new AppError(409, 'conflict', 'Lượt chạy này không còn lỗi', {
          detail: 'Tải lại để xem trạng thái mới nhất của lượt chạy.',
        });
      }
    });
    return this.runDetail(scope, site._id, await this.findRun(scope, automation._id, runId));
  }

  /** "Thử lại N lượt lỗi": the failed runs of the last 30 days, at most `AUTOMATION_RETRY_MAX`. */
  async retryFailed(
    user: AuthenticatedUser,
    siteId: string,
    automationId: string,
  ): Promise<RetryRunsResponse> {
    const { scope, site } = await this.sites.access(user, siteId, 'automations.manage');
    const automation = await this.find(scope, site._id, automationId);
    const since = new Date(Date.now() - 30 * DAY_MS);
    const retried = await this.requeue(scope, site._id, automation, null, () => undefined, since);
    return { retried };
  }

  /** "Bỏ qua lượt này": a failed run, or one waiting for its retry, ends as skipped. */
  async skipRun(
    user: AuthenticatedUser,
    siteId: string,
    automationId: string,
    runId: string,
  ): Promise<AutomationRunDetail> {
    const { scope, site } = await this.sites.access(user, siteId, 'automations.manage');
    const automation = await this.find(scope, site._id, automationId);
    const run = await this.findRun(scope, automation._id, runId);
    if (!(await this.runs.skip(scope, run._id, new Date()))) {
      throw new AppError(409, 'conflict', 'Lượt chạy này không thể bỏ qua', {
        detail: 'Chỉ bỏ qua được lượt lỗi hoặc lượt đang chờ thử lại.',
      });
    }
    return this.runDetail(scope, site._id, await this.findRun(scope, automation._id, runId));
  }

  /**
   * Failed runs back in the queue, with the activity and the workspace's wake-up in one
   * transaction. A paused automation would stop them at once: it must be on (ADR-034).
   */
  private async requeue(
    scope: WorkspaceScope,
    siteId: ObjectId,
    automation: AutomationRecord,
    runs: AutomationRunRecord[] | null,
    check: (requeued: number) => void,
    since = new Date(0),
  ): Promise<number> {
    if (automation.state !== 'on') {
      throw new AppError(409, 'conflict', 'Bật lại automation trước khi thử lại', {
        detail: 'Lượt chạy của automation đang tạm dừng không được thực hiện.',
      });
    }
    await this.wakeups.ensure(scope.workspaceId);
    const at = new Date();
    return this.transactions.run(async (tx) => {
      const chosen =
        runs ??
        (await this.runs.failedSince(scope, automation._id, since, AUTOMATION_RETRY_MAX, tx));
      let requeued = 0;
      for (const run of chosen) {
        if (await this.runs.requeue(scope, run, at, tx)) {
          requeued += 1;
        }
      }
      check(requeued);
      if (requeued > 0) {
        await this.wakeups.bump(scope.workspaceId, at, tx);
        await this.activity.record(scope, { siteId, type: 'automation.retried' }, tx);
      }
      return requeued;
    });
  }

  private async findRun(
    scope: WorkspaceScope,
    automationId: ObjectId,
    runId: string,
  ): Promise<AutomationRunRecord> {
    const run = await this.runs.findOf(scope, automationId, toObjectId(runId, RUN_NOT_FOUND));
    if (run === null) {
      throw notFound(RUN_NOT_FOUND);
    }
    return run;
  }

  private async runDetail(
    scope: WorkspaceScope,
    siteId: ObjectId,
    run: AutomationRunRecord,
  ): Promise<AutomationRunDetail> {
    const names = await this.contactNames(scope, siteId, [run]);
    return {
      ...runItem(run, names),
      eventKey: run.eventKey,
      version: run.version,
      definition: run.definition,
      reason: run.reason,
      steps: run.steps.flatMap((step, index) => {
        const action = run.definition.actions[index];
        return action === undefined
          ? []
          : [
              {
                action,
                status: step.status,
                attempts: step.attempts,
                at: step.at?.toISOString() ?? null,
                error: step.error,
                summary: step.summary,
              },
            ];
      }),
      nextAt: run.nextAt?.toISOString() ?? null,
      finishedAt: run.finishedAt?.toISOString() ?? null,
    };
  }

  /** The profiles' names now: runs keep only ids (ADR-034). */
  private async contactNames(
    scope: WorkspaceScope,
    siteId: ObjectId,
    runs: readonly AutomationRunRecord[],
  ): Promise<Map<string, string>> {
    const ids = runs.flatMap((run) => (run.contactId === null ? [] : [run.contactId]));
    if (ids.length === 0) {
      return new Map();
    }
    const contacts = await this.contacts.findByIds(scope, siteId, ids);
    return new Map(contacts.map((contact) => [contact._id.toHexString(), contact.name]));
  }

  /**
   * A webhook step saved without a secret gets one, shown once in `revealedSecrets`; a step keeps
   * the secret it has. Secrets no step uses any more are dropped. A step cannot name a secret it
   * was not given.
   */
  private withSecrets(
    definition: AutomationDefinition,
    current: readonly StoredWebhookSecret[],
  ): {
    definition: AutomationDefinition;
    stored: StoredWebhookSecret[];
    revealed: RevealedSecret[];
  } {
    const revealed: RevealedSecret[] = [];
    const stored: StoredWebhookSecret[] = [];
    const actions = definition.actions.map((action, index) => {
      if (action.kind !== 'webhook') {
        return action;
      }
      if (action.secretId === '') {
        const secretId = newSecretId();
        const secret = newWebhookSecret();
        stored.push(encryptSecret(this.secretKey(), secretId, secret));
        revealed.push({ secretId, secret });
        return { ...action, secretId };
      }
      const kept = current.find((item) => item.id === action.secretId);
      if (kept === undefined) {
        throw validationFailed([
          {
            path: ['definition', 'actions', index, 'secretId'],
            code: 'unknown_secret',
            message: 'Bí mật của bước webhook không thuộc automation này',
          },
        ]);
      }
      if (!stored.includes(kept)) {
        stored.push(kept);
      }
      return action;
    });
    return { definition: { ...definition, actions }, stored, revealed };
  }

  private secretKey(): string {
    const key = this.env.AUTOMATION_SECRET_KEY;
    if (key === undefined) {
      // A deployment without the key cannot keep a secret, so it offers no webhook step.
      throw validationFailed([
        {
          path: ['definition'],
          code: 'webhook_unavailable',
          message: 'Máy chủ chưa cấu hình khóa bí mật cho webhook (AUTOMATION_SECRET_KEY)',
        },
      ]);
    }
    return key;
  }

  /**
   * "Chạy thử" (ADR-034): the steps as they stand, with the site's latest lead or a sample. Nothing
   * is given, sent or counted.
   */
  async test(
    user: AuthenticatedUser,
    siteId: string,
    automationId: string,
    request: TestAutomationRequest,
  ): Promise<TestAutomationResponse> {
    const { scope, site } = await this.sites.access(user, siteId, 'automations.manage');
    const automation = await this.find(scope, site._id, automationId);
    const [members, pages] = await Promise.all([
      this.assignees.list(scope, site._id),
      this.pages.listTitlesForSite(scope, site._id),
    ]);
    const names = {
      members: new Map(members.map((person) => [person.id, person.name])),
      pages: new Map(pages.map((page) => [page._id.toHexString(), page.title])),
      rotation: automation.rotation,
    };
    const [lead] =
      request.source === 'latest'
        ? await this.leads.listRecentOfSite(scope, site._id, null, 1)
        : [];
    return testDefinition(
      request.definition,
      await this.testSubject(scope, site._id, lead),
      names,
      new Date(),
    );
  }

  /** The numbers of the "Bật" dialog. */
  async activation(
    user: AuthenticatedUser,
    siteId: string,
    automationId: string,
  ): Promise<AutomationActivation> {
    const { scope, site } = await this.sites.access(user, siteId, 'automations.manage');
    const automation = await this.find(scope, site._id, automationId);
    const canIncludeRecent = automation.definition.trigger.kind === 'lead_created';
    const [leads, recent] = await Promise.all([
      this.leads.countMatching(
        scope,
        site._id,
        { spam: false, pageId: null, status: null, createdIn: null, search: null },
        CAPPED_COUNT_LIMIT,
      ),
      canIncludeRecent ? this.recentUnassigned(scope, site._id, automation) : Promise.resolve([]),
    ]);
    return { leads, recentUnassigned: recent.length, canIncludeRecent };
  }

  /**
   * Leads of the last 24 hours without an owner that the automation's trigger takes: "Chạy luôn
   * cho … lead" (ADR-034).
   */
  private async recentUnassigned(
    scope: WorkspaceScope,
    siteId: ObjectId,
    automation: AutomationRecord,
  ): Promise<LeadEvent[]> {
    const trigger = automation.definition.trigger;
    if (trigger.kind !== 'lead_created') {
      return [];
    }
    const since = new Date(Date.now() - AUTOMATION_RECENT_HOURS * 3_600_000);
    const leads = (
      await this.leads.listRecentOfSite(scope, siteId, since, AUTOMATION_RECENT_MAX)
    ).filter(
      (lead) =>
        lead.contactId &&
        lead.opportunityId &&
        (trigger.pageIds.length === 0 || trigger.pageIds.includes(lead.pageId.toHexString())),
    );
    const contacts = await this.contacts.findByIds(
      scope,
      siteId,
      leads.flatMap((lead) => (lead.contactId ? [lead.contactId] : [])),
    );
    const unassigned = new Set(
      contacts
        .filter((contact) => contact.ownerId === null)
        .map((contact) => contact._id.toHexString()),
    );
    return leads.flatMap((lead) =>
      lead.contactId && lead.opportunityId && unassigned.has(lead.contactId.toHexString())
        ? [
            {
              siteId,
              leadId: lead._id,
              pageId: lead.pageId,
              contactId: lead.contactId,
              opportunityId: lead.opportunityId,
              at: lead.createdAt,
            },
          ]
        : [],
    );
  }

  /** The latest lead with its profile, or the sample of "Lead mẫu". */
  private async testSubject(
    scope: WorkspaceScope,
    siteId: ObjectId,
    lead: LeadRecord | undefined,
  ): Promise<TestSubject> {
    if (lead === undefined) {
      return {
        lead: null,
        contactName: 'Khách mẫu',
        ownerId: null,
        facts: {
          source: { source: 'facebook', medium: 'cpc', campaign: null },
          pageId: null,
          tags: [],
          opportunityValue: null,
          stage: 'new',
        },
      };
    }
    const [contact, opportunity] = await Promise.all([
      lead.contactId
        ? this.contacts.findById(scope, siteId, lead.contactId)
        : Promise.resolve(null),
      lead.opportunityId
        ? this.opportunities.findById(scope, siteId, lead.opportunityId)
        : Promise.resolve(null),
    ]);
    return {
      lead: { name: lead.fields.name, at: lead.createdAt, pageId: lead.pageId.toHexString() },
      contactName: contact?.name ?? lead.fields.name,
      ownerId: contact?.ownerId?.toHexString() ?? null,
      facts: {
        source: lead.source,
        pageId: lead.pageId.toHexString(),
        tags: contact?.tags ?? [],
        opportunityValue: opportunity?.value ?? null,
        stage: opportunity?.stage ?? null,
      },
    };
  }

  private async detailOf(
    scope: WorkspaceScope,
    siteId: ObjectId,
    automation: AutomationRecord,
    revealedSecrets: RevealedSecret[] = [],
  ): Promise<AutomationDetail> {
    const [item, members, pages, tags] = await Promise.all([
      this.item(scope, automation),
      this.assignees.list(scope, siteId),
      this.pages.listTitlesForSite(scope, siteId),
      this.contacts.tags(scope, siteId),
    ]);
    return {
      ...item,
      version: automation.version,
      definition: automation.definition,
      updatedAt: automation.updatedAt.toISOString(),
      options: {
        members,
        pages: pages.map((page) => ({ id: page._id.toHexString(), title: page.title })),
        tags: tags.sort((a, b) => a.localeCompare(b, 'vi')),
      },
      revealedSecrets,
    };
  }

  private async find(
    scope: WorkspaceScope,
    siteId: ObjectId,
    automationId: string,
  ): Promise<AutomationRecord> {
    const automation = await this.automations.findById(
      scope,
      siteId,
      toObjectId(automationId, AUTOMATION_NOT_FOUND),
    );
    if (automation === null) {
      throw notFound(AUTOMATION_NOT_FOUND);
    }
    return automation;
  }

  private async requireRoom(scope: WorkspaceScope, siteId: ObjectId): Promise<void> {
    if ((await this.automations.countOfSite(scope, siteId)) >= AUTOMATIONS_PER_SITE_MAX) {
      throw validationFailed([
        {
          path: ['recipe'],
          code: 'too_many_automations',
          message: `Mỗi site có tối đa ${AUTOMATIONS_PER_SITE_MAX} automation`,
        },
      ]);
    }
  }

  /** "Quản lý": members who manage automations and may open the site, for a recipe's emails. */
  private async managers(scope: WorkspaceScope, siteId: ObjectId): Promise<string[]> {
    const [memberships, roles] = await Promise.all([
      this.workspaces.listMembers(scope),
      this.customRoles.mapForWorkspace(scope),
    ]);
    return memberships
      .filter(
        (membership) =>
          can(accessOf(membership, roles), 'automations.manage') &&
          ((membership.siteIds ?? null) === null ||
            membership.siteIds?.some((id) => id.equals(siteId))),
      )
      .slice(0, MANAGERS_MAX)
      .map((membership) => membership.userId.toHexString());
  }

  private async item(
    scope: WorkspaceScope,
    automation: AutomationRecord,
  ): Promise<AutomationListItem> {
    const [stats, people] = await Promise.all([
      this.runs.stats(scope, [automation._id], new Date(Date.now() - 30 * DAY_MS)),
      this.users.findRefs([automation.createdBy]),
    ]);
    return toItem(
      automation,
      stats.get(automation._id.toHexString()),
      people,
      vnMonthOf(new Date()),
    );
  }
}
