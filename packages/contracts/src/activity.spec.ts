import { describe, expect, it } from 'vitest';
import { activityListQuerySchema, publishingActivityTypes } from './activity.js';

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
      activityListQuerySchema.safeParse({ types: 'page.published,page.deleted' }).success,
    ).toBe(false);
    expect(activityListQuerySchema.safeParse({ types: '' }).success).toBe(false);
  });
});
