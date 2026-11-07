import { Injectable } from '@nestjs/common';
import {
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
import type { AutomationRecord } from './automation.schema.js';
import { AutomationRunsRepository, type RunStats } from './automation-runs.repository.js';
import { AutomationUsageRepository } from './automation-usage.repository.js';
import { AutomationsRepository } from './automations.repository.js';
import { AutomationTriggers, type LeadEvent } from './automation-triggers.service.js';
import { missingSteps, recipeDefinition } from './domain/automation-rules.js';
import { type TestSubject, testDefinition } from './domain/automation-test.js';
import { JobWakeupsRepository } from './job-wakeups.repository.js';

export const AUTOMATION_NOT_FOUND = 'Không tìm thấy automation';
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
    const updated = await this.automations.update(
      scope,
      site._id,
      automation._id,
      request,
      new Date(),
    );
    if (updated === null) {
      throw notFound(AUTOMATION_NOT_FOUND);
    }
    return this.detailOf(scope, site._id, updated);
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
