import type { ActivityItem, UserRef } from '@plp/contracts';
import type { ActivityRecord } from './activity.schema.js';

function pageRef(record: ActivityRecord): ActivityItem['page'] {
  if (record.pageId === null) {
    return null;
  }
  if (record.pageTitle === null) {
    // The schema validator stores both or neither; reaching this means the data was edited by hand.
    throw new Error(`Activity ${record._id.toHexString()} has a page but no title snapshot`);
  }
  return { id: record.pageId.toHexString(), title: record.pageTitle };
}

/** Maps a stored event to the contract `ActivityItem`. Release ids stay internal. */
export function toActivityItem(
  record: ActivityRecord,
  actor: UserRef,
  undoable: boolean,
): ActivityItem {
  return {
    id: record._id.toHexString(),
    type: record.type,
    actor,
    siteId: record.siteId.toHexString(),
    page: pageRef(record),
    data: {
      version: record.data.version,
      fromVersion: record.data.fromVersion,
      toVersion: record.data.toVersion,
      revalidationFailed: record.data.revalidationFailed,
    },
    reason: record.reason,
    undoable,
    createdAt: record.createdAt.toISOString(),
  };
}
