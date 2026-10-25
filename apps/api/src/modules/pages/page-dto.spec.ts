import { pointerEventSchema } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { newObjectId } from '../../shared/persistence/object-id.js';
import { type ActivityRecord, EMPTY_ACTIVITY_DATA } from '../activity/activity.schema.js';
import { liveUrlOf, toPointerEvent } from './page-dto.js';

const by = { id: newObjectId().toHexString(), name: 'Lan Anh' };

function event(
  type: ActivityRecord['type'],
  data: Partial<ActivityRecord['data']>,
): ActivityRecord {
  return {
    _id: newObjectId(),
    workspaceId: newObjectId(),
    siteId: newObjectId(),
    pageId: newObjectId(),
    pageTitle: 'Ưu đãi',
    actorId: newObjectId(),
    type,
    data: { ...EMPTY_ACTIVITY_DATA, ...data },
    reason: null,
    createdAt: new Date('2026-10-24T09:00:00.000Z'),
  };
}

describe('liveUrlOf', () => {
  it('is the origin for the home page and origin/slug otherwise', () => {
    expect(liveUrlOf('https://a.payload.site', '')).toBe('https://a.payload.site');
    expect(liveUrlOf('https://a.payload.site', 'uu-dai')).toBe('https://a.payload.site/uu-dai');
  });
});

describe('toPointerEvent', () => {
  it('maps each pointer event with the version that became live', () => {
    const at = '2026-10-24T09:00:00.000Z';
    expect(toPointerEvent(event('page.published', { version: 3, toVersion: 3 }), by)).toEqual({
      type: 'published',
      version: 3,
      by,
      at,
    });
    expect(
      toPointerEvent(event('page.rolled_back', { fromVersion: 3, toVersion: 1 }), by),
    ).toMatchObject({ type: 'rolled_back', version: 1 });
    expect(
      toPointerEvent(event('page.rollback_undone', { fromVersion: 1, toVersion: 3 }), by),
    ).toMatchObject({ type: 'rollback_undone', version: 3 });
    const unpublished = toPointerEvent(event('page.unpublished', { fromVersion: 3 }), by);
    expect(pointerEventSchema.parse(unpublished)).toEqual({
      type: 'unpublished',
      version: null,
      by,
      at,
    });
  });

  it('refuses an event that does not move the pointer', () => {
    expect(() => toPointerEvent(event('page.created', {}), by)).toThrow(/not a pointer event/);
  });
});
