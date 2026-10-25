import { activityItemSchema } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { newObjectId } from '../../shared/persistence/object-id.js';
import { toActivityItem } from './activity-dto.js';
import { type ActivityRecord, EMPTY_ACTIVITY_DATA } from './activity.schema.js';

function activityRecord(overrides: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    _id: newObjectId(),
    workspaceId: newObjectId(),
    siteId: newObjectId(),
    pageId: null,
    pageTitle: null,
    actorId: newObjectId(),
    type: 'site.created',
    data: EMPTY_ACTIVITY_DATA,
    reason: null,
    createdAt: new Date('2026-10-24T09:00:00.000Z'),
    ...overrides,
  };
}

const actor = { id: newObjectId().toHexString(), name: 'Lan Anh' };

describe('toActivityItem', () => {
  it('maps a site event without a page', () => {
    const record = activityRecord();
    expect(activityItemSchema.parse(toActivityItem(record, actor, false))).toEqual({
      id: record._id.toHexString(),
      type: 'site.created',
      actor,
      siteId: record.siteId.toHexString(),
      page: null,
      data: {
        version: null,
        fromVersion: null,
        toVersion: null,
        count: null,
        revalidationFailed: false,
      },
      reason: null,
      undoable: false,
      createdAt: '2026-10-24T09:00:00.000Z',
    });
  });

  it('maps a pointer move with its versions, reason and page title snapshot, hiding release ids', () => {
    const pageId = newObjectId();
    const record = activityRecord({
      type: 'page.rolled_back',
      pageId,
      pageTitle: 'Ưu đãi niềng răng',
      data: {
        ...EMPTY_ACTIVITY_DATA,
        fromVersion: 4,
        toVersion: 3,
        fromReleaseId: newObjectId(),
        toReleaseId: newObjectId(),
        revalidationFailed: true,
      },
      reason: 'Sai giá',
    });
    const item = activityItemSchema.parse(toActivityItem(record, actor, true));
    expect(item.page).toEqual({ id: pageId.toHexString(), title: 'Ưu đãi niềng răng' });
    expect(item.data).toEqual({
      version: null,
      fromVersion: 4,
      toVersion: 3,
      count: null,
      revalidationFailed: true,
    });
    expect(item.reason).toBe('Sai giá');
    expect(item.undoable).toBe(true);
  });

  it('maps how many leads an export covered, and no count for events stored before counts', () => {
    const exported = activityRecord({
      type: 'lead.exported',
      data: { ...EMPTY_ACTIVITY_DATA, count: 48 },
    });
    expect(activityItemSchema.parse(toActivityItem(exported, actor, false)).data.count).toBe(48);
    const { count: _count, ...before } = EMPTY_ACTIVITY_DATA;
    const older = activityRecord({ data: before as typeof EMPTY_ACTIVITY_DATA });
    expect(toActivityItem(older, actor, false).data.count).toBeNull();
  });

  it('fails loudly when a page event lost its title snapshot', () => {
    const record = activityRecord({ type: 'page.created', pageId: newObjectId(), pageTitle: null });
    expect(() => toActivityItem(record, actor, false)).toThrow(/no title snapshot/);
  });
});
