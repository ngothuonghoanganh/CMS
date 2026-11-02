import type { ActivityItem, UserRef } from '@plp/contracts';
import type { ActivityRecord } from './activity.schema.js';

function pageRef(record: ActivityRecord, deletedPages: ReadonlySet<string>): ActivityItem['page'] {
  if (record.pageId === null) {
    return null;
  }
  if (record.pageTitle === null) {
    // The schema validator stores both or neither; reaching this means the data was edited by hand.
    throw new Error(`Activity ${record._id.toHexString()} has a page but no title snapshot`);
  }
  const id = record.pageId.toHexString();
  return { id, title: record.pageTitle, deleted: deletedPages.has(id) };
}

/**
 * Maps a stored event to the contract `ActivityItem`. Release ids stay internal. `actor` is null
 * for an event of the system. `deletedPages` holds the ids (hex) of the deleted pages among the
 * events' pages.
 */
export function toActivityItem(
  record: ActivityRecord,
  actor: UserRef | null,
  undoable: boolean,
  deletedPages: ReadonlySet<string>,
): ActivityItem {
  return {
    id: record._id.toHexString(),
    type: record.type,
    actor,
    siteId: record.siteId.toHexString(),
    page: pageRef(record, deletedPages),
    data: {
      version: record.data.version,
      fromVersion: record.data.fromVersion,
      toVersion: record.data.toVersion,
      // Events stored before lead exports existed have no count.
      count: record.data.count ?? null,
      // Only `page.deleted` has one; events stored before it have no field.
      slug: record.data.slug ?? null,
      // Only domain events have one (ADR-022), the same.
      hostname: record.data.hostname ?? null,
      revalidationFailed: record.data.revalidationFailed,
    },
    reason: record.reason,
    undoable,
    createdAt: record.createdAt.toISOString(),
  };
}
