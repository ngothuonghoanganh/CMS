import { describe, expect, it } from 'vitest';
import {
  activityItemSchema,
  activityListQuerySchema,
  domainActivityTypes,
  isSystemActivityType,
  publishingActivityTypes,
} from './activity.js';

describe('activityListQuerySchema', () => {
  it('lists every type when `types` is absent', () => {
    expect(activityListQuerySchema.parse({})).toEqual({ limit: 20 });
  });

  it('reads a comma-separated list of types', () => {
    expect(
      activityListQuerySchema.parse({ types: publishingActivityTypes.join(','), limit: '5' }),
    ).toEqual({
      types: ['page.published', 'page.rolled_back', 'page.rollback_undone', 'page.unpublished'],
      limit: 5,
    });
  });

  it('rejects an unknown or empty type', () => {
    expect(
      activityListQuerySchema.safeParse({ types: 'page.published,page.archived' }).success,
    ).toBe(false);
    expect(activityListQuerySchema.safeParse({ types: '' }).success).toBe(false);
  });
});

describe('domain events (ADR-022)', () => {
  it('fit in one list query with the publishing events, as on the dashboard', () => {
    const types = [...publishingActivityTypes, 'page.deleted', ...domainActivityTypes];
    expect(activityListQuerySchema.parse({ types: types.join(',') }).types).toEqual(types);
  });

  it('have no actor only when the domain checks record them', () => {
    expect(isSystemActivityType('domain.activated')).toBe(true);
    expect(isSystemActivityType('domain.lost')).toBe(true);
    expect(isSystemActivityType('domain.added')).toBe(false);
    expect(isSystemActivityType('page.published')).toBe(false);
    const item = {
      id: '64b000000000000000000301',
      type: 'domain.activated',
      actor: null,
      siteId: '64b000000000000000000001',
      page: null,
      data: {
        version: null,
        fromVersion: null,
        toVersion: null,
        count: null,
        slug: null,
        hostname: 'go.smilecare.vn',
        template: null,
        revalidationFailed: false,
      },
      reason: null,
      undoable: false,
      createdAt: '2026-11-02T03:00:00.000Z',
    };
    expect(activityItemSchema.parse(item).actor).toBeNull();
  });
});
