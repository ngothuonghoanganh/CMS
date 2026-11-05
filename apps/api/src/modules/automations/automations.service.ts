import { Injectable } from '@nestjs/common';
import {
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
import { notFound, validationFailed } from '../../shared/errors.js';
import { type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { UsersRepository } from '../auth/users.repository.js';
import { ContactAssignees } from '../contacts/contact-assignees.service.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { SITE_NOT_FOUND, SitesService } from '../sites/sites.service.js';
import { CustomRolesRepository } from '../workspaces/custom-roles.repository.js';
import { accessOf } from '../workspaces/domain/member-access.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import type { AutomationRecord } from './automation.schema.js';
import { AutomationRunsRepository, type RunStats } from './automation-runs.repository.js';
import { AutomationUsageRepository } from './automation-usage.repository.js';
import { AutomationsRepository } from './automations.repository.js';
import { missingSteps, recipeDefinition } from './domain/automation-rules.js';
import { JobWakeupsRepository } from './job-wakeups.repository.js';

export const AUTOMATION_NOT_FOUND = 'Không tìm thấy automation';
const DAY_MS = 86_400_000;
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
    private readonly transactions: TransactionRunner,
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

  /** "Bắt đầu từ mẫu": a draft filled in from the site's members. */
  async create(
    user: AuthenticatedUser,
    siteId: string,
    request: CreateAutomationRequest,
  ): Promise<AutomationListItem> {
    const { scope, site } = await this.sites.access(user, siteId, 'automations.manage');
    await this.requireRoom(scope, site._id);
    const [assignees, managers] = await Promise.all([
      this.assignees.list(scope, site._id),
      this.managers(scope, site._id),
    ]);
    const { name, definition } = recipeDefinition(request.recipe, {
      assignees: assignees.map((person) => person.id),
      managers,
    });
    const created = await this.automations.insert(scope, site._id, {
      name,
      definition,
      recipe: request.recipe,
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
