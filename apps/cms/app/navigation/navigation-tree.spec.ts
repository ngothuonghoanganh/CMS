import { describe, expect, it } from 'vitest';
import type { NavigationItem } from '@payload/contracts';

import {
  createNavigationItemId,
  duplicateNavigationItem,
  flattenNavigationItems,
  indentNavigationItem,
  moveNavigationItem,
  moveNavigationItemTo,
  outdentNavigationItem,
  removeNavigationItem,
} from './navigation-tree';

const page = (id: string, label = id): NavigationItem => ({
  id,
  label,
  type: 'page',
  pageId: '00000000-0000-4000-8000-000000000001',
});

describe('navigation tree operations', () => {
  it('always creates UUID-compatible item IDs', () => {
    expect(createNavigationItemId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('supports indent, outdent, and sibling movement without changing IDs', () => {
    const items = [page('one'), page('two'), page('three')];
    const indented = indentNavigationItem(items, 'two');
    expect(indented.map((item) => item.id)).toEqual(['one', 'three']);
    expect(indented[0]?.children?.map((item) => item.id)).toEqual(['two']);

    const moved = moveNavigationItem(indented, 'three', -1);
    expect(moved.map((item) => item.id)).toEqual(['three', 'one']);
    const restored = outdentNavigationItem(indented, 'two');
    expect(restored.map((item) => item.id)).toEqual(['one', 'two', 'three']);
  });

  it('duplicates a full subtree with fresh IDs and removes whole subtrees', () => {
    const items: NavigationItem[] = [
      { ...page('one'), children: [{ ...page('child'), label: 'Child' }] },
      page('two'),
    ];
    const duplicated = duplicateNavigationItem(items, 'one');
    expect(duplicated).toHaveLength(3);
    expect(duplicated[1]?.label).toBe('one');
    expect(duplicated[1]?.children).toHaveLength(1);
    expect(flattenNavigationItems(duplicated).map((item) => item.id)).toHaveLength(5);
    expect(new Set(flattenNavigationItems(duplicated).map((item) => item.id)).size).toBe(
      5,
    );

    const removed = removeNavigationItem(duplicated, 'one');
    expect(flattenNavigationItems(removed).map((item) => item.label)).toEqual([
      'one',
      'Child',
      'two',
    ]);
  });

  it('supports drag-style nesting and rejects moving a parent into its subtree', () => {
    const items = [page('one'), page('two'), page('three')];
    const nested = moveNavigationItemTo(items, 'three', 'one');
    expect(nested[0]?.children?.map((item) => item.id)).toEqual(['three']);

    const unchanged = moveNavigationItemTo(
      [{ ...page('one'), children: [page('child')] }],
      'one',
      'child',
    );
    expect(unchanged[0]?.children?.[0]?.id).toBe('child');
  });
});
