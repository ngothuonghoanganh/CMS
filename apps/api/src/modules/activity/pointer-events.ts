import type { ActivityType } from '@plp/contracts';
import type { ActivityRecord } from './activity.schema.js';

/** Events that move a page's live pointer; each is written in the same transaction as the move. */
export const POINTER_EVENT_TYPES = [
  'page.published',
  'page.rolled_back',
  'page.rollback_undone',
  'page.unpublished',
] as const satisfies readonly ActivityType[];

export function isPointerEvent(type: ActivityType): boolean {
  return (POINTER_EVENT_TYPES as readonly ActivityType[]).includes(type);
}

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
