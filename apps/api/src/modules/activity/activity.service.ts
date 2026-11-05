import { Injectable } from '@nestjs/common';
import {
  type ActivityItem,
  type activityListQuerySchema,
  type ActivityListResponse,
  type ActivityType,
  activityTypes,
  can,
  type Permission,
} from '@plp/contracts';
import type { z } from 'zod';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import { UsersRepository } from '../auth/users.repository.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { toActivityItem } from './activity-dto.js';
import { ActivityRepository } from './activity.repository.js';
import type { ActivityRecord } from './activity.schema.js';
import { isUndoable } from './pointer-events.js';

export type ActivityListQueryValues = z.output<typeof activityListQuerySchema>;

/**
 * Events about leads and the people who sent forms carry counts and names: they show to the roles
 * that see those, not to every role that opens the site (ADR-020).
 */
const seenWith: Partial<Record<ActivityType, Permission>> = {
  'lead.exported': 'leads.view',
  'lead.person_deleted': 'leads.view',
  'lead.recipients_changed': 'leads.view',
  'data_request.created': 'personalData.manage',
  'data_request.completed': 'personalData.manage',
  'automation.enabled': 'automations.view',
  'automation.paused': 'automations.view',
  'automation.auto_paused': 'automations.view',
};

@Injectable()
export class ActivityService {
  constructor(
    private readonly activity: ActivityRepository,
    private readonly users: UsersRepository,
  ) {}

  async listForSite(
    scope: WorkspaceScope,
    siteId: ObjectId,
    query: ActivityListQueryValues,
  ): Promise<ActivityListResponse> {
    const types = (query.types ?? activityTypes).filter((type) => {
      const permission = seenWith[type];
      return permission === undefined || can(scope.access, permission);
    });
    const page = await this.activity.listForSite(scope, siteId, query.cursor, query.limit, types);
    return { items: await this.toItems(scope, page.items), nextCursor: page.nextCursor };
  }

  /**
   * Maps records of one workspace to contract items with a constant number of queries: one for
   * the actor names, one for the deleted pages among theirs (ADR-027) and, when rollbacks are
   * present, one aggregation for `undoable`.
   */
  async toItems(
    scope: WorkspaceScope,
    records: readonly ActivityRecord[],
  ): Promise<ActivityItem[]> {
    const rolledBackPageIds = records.flatMap((record) =>
      record.type === 'page.rolled_back' && record.pageId !== null ? [record.pageId] : [],
    );
    const [actors, latestByPage, deletedPages] = await Promise.all([
      this.users.findRefs(records.flatMap((record) => (record.actorId ? [record.actorId] : []))),
      this.activity.latestPointerEvents(scope, rolledBackPageIds),
      this.activity.findGonePages(
        scope,
        records.flatMap((record) => (record.pageId === null ? [] : [record.pageId])),
      ),
    ]);
    return records.map((record) => {
      // The system's events (the domain checks) have no actor; the schema allows nothing else.
      const actor = record.actorId === null ? null : actors.get(record.actorId.toHexString());
      if (actor === undefined) {
        throw new Error(
          `Activity ${record._id.toHexString()} refers to unknown user ${record.actorId?.toHexString() ?? ''}`,
        );
      }
      const latest =
        record.pageId === null ? undefined : latestByPage.get(record.pageId.toHexString());
      return toActivityItem(record, actor, isUndoable(record, latest), deletedPages);
    });
  }
}
