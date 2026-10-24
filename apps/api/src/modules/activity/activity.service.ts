import { Injectable } from '@nestjs/common';
import type { ActivityItem, ActivityListResponse, CursorQuery } from '@plp/contracts';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import { UsersRepository } from '../auth/users.repository.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { toActivityItem } from './activity-dto.js';
import { ActivityRepository } from './activity.repository.js';
import type { ActivityRecord } from './activity.schema.js';
import { isUndoable } from './pointer-events.js';

@Injectable()
export class ActivityService {
  constructor(
    private readonly activity: ActivityRepository,
    private readonly users: UsersRepository,
  ) {}

  async listForSite(
    scope: WorkspaceScope,
    siteId: ObjectId,
    query: CursorQuery,
  ): Promise<ActivityListResponse> {
    const page = await this.activity.listForSite(scope, siteId, query.cursor, query.limit);
    return { items: await this.toItems(scope, page.items), nextCursor: page.nextCursor };
  }

  /**
   * Maps records of one workspace to contract items with a constant number of queries: one for
   * the actor names and, when rollbacks are present, one aggregation for `undoable`.
   */
  async toItems(
    scope: WorkspaceScope,
    records: readonly ActivityRecord[],
  ): Promise<ActivityItem[]> {
    const rolledBackPageIds = records.flatMap((record) =>
      record.type === 'page.rolled_back' && record.pageId !== null ? [record.pageId] : [],
    );
    const [actors, latestByPage] = await Promise.all([
      this.users.findRefs(records.map((record) => record.actorId)),
      this.activity.latestPointerEvents(scope, rolledBackPageIds),
    ]);
    return records.map((record) => {
      const actor = actors.get(record.actorId.toHexString());
      if (!actor) {
        throw new Error(
          `Activity ${record._id.toHexString()} refers to unknown user ${record.actorId.toHexString()}`,
        );
      }
      const latest =
        record.pageId === null ? undefined : latestByPage.get(record.pageId.toHexString());
      return toActivityItem(record, actor, isUndoable(record, latest));
    });
  }
}
