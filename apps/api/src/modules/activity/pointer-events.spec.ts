import type { ActivityType } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { newObjectId, type ObjectId } from '../../shared/persistence/object-id.js';
import { isUndoable, pointerActorOf } from './pointer-events.js';

function event(type: ActivityType, pageId: ObjectId | null = newObjectId()) {
  return { _id: newObjectId(), type, pageId };
}

describe('isUndoable', () => {
  it('is true for a rollback that is still the latest pointer event of its page', () => {
    const rollback = event('page.rolled_back');
    expect(isUndoable(rollback, { _id: rollback._id })).toBe(true);
  });

  it('is false once another pointer event happened on the page', () => {
    const rollback = event('page.rolled_back');
    expect(isUndoable(rollback, { _id: newObjectId() })).toBe(false);
  });

  it('is false when the latest pointer event is unknown', () => {
    expect(isUndoable(event('page.rolled_back'), undefined)).toBe(false);
  });

  it('is false for any other event type, even when it is the latest', () => {
    for (const type of ['page.published', 'page.rollback_undone', 'page.unpublished'] as const) {
      const record = event(type);
      expect(isUndoable(record, { _id: record._id })).toBe(false);
    }
  });

  it('is false for a rollback without a page', () => {
    const record = event('page.rolled_back', null);
    expect(isUndoable(record, { _id: record._id })).toBe(false);
  });
});

describe('pointerActorOf', () => {
  it('is the member who moved the pointer, and an error for an event without one', () => {
    const actorId = newObjectId();
    expect(pointerActorOf({ ...event('page.published'), actorId })).toBe(actorId);
    expect(() => pointerActorOf({ ...event('page.published'), actorId: null })).toThrow(
      /has no actor/,
    );
  });
});
