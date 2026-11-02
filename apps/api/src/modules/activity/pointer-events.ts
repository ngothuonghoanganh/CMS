import { publishingActivityTypes } from '@plp/contracts';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { ActivityRecord } from './activity.schema.js';

/** Events that move a page's live pointer; each is written in the same transaction as the move. */
export const POINTER_EVENT_TYPES = publishingActivityTypes;

/**
 * A rollback can be undone only while it is still the latest pointer event of its page. Every
 * pointer move records an event in the same transaction, so being the latest proves the pointer
 * still sits on the rollback's target (ADR-006).
 */
export function isUndoable(
  record: Pick<ActivityRecord, '_id' | 'type' | 'pageId'>,
  latestPointerEventOfPage: Pick<ActivityRecord, '_id'> | undefined,
): boolean {
  return (
    record.type === 'page.rolled_back' &&
    record.pageId !== null &&
    latestPointerEventOfPage !== undefined &&
    latestPointerEventOfPage._id.equals(record._id)
  );
}

/** Who moved the pointer: always a member, since only the domain checks record events alone. */
export function pointerActorOf(record: Pick<ActivityRecord, '_id' | 'type' | 'actorId'>): ObjectId {
  if (record.actorId === null) {
    throw new Error(`Activity ${record._id.toHexString()} (${record.type}) has no actor`);
  }
  return record.actorId;
}
