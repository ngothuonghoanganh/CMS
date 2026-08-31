import { describe, expect, it } from 'vitest';

import {
  assertUniquePersistedNodeIds,
  collectPersistedNodeIds,
  findDuplicatePersistedNodeIds,
  generateFreshNodeId,
  remapSubtreeNodeIds,
} from './builder-node-identity';

describe('builder node identity service', () => {
  it('finds duplicate IDs without repairing the invalid input', () => {
    const value = {
      id: 'root',
      type: 'root',
      children: [
        { id: 'shared', type: 'text', children: [] },
        { id: 'shared', type: 'text', children: [] },
      ],
    };

    expect(findDuplicatePersistedNodeIds(value)).toEqual(['shared']);
    expect(() => assertUniquePersistedNodeIds(value)).toThrow(
      'Duplicate persisted node ids: shared',
    );
    expect(value.children[0]?.id).toBe('shared');
  });

  it('remaps a compound definition recursively, preserves root, and updates refs', () => {
    const value = {
      id: 'root',
      type: 'root',
      children: [
        {
          id: 'section-source',
          type: 'section',
          children: [
            {
              id: 'text-source',
              type: 'text',
              attributes: { 'aria-controls': 'text-source' },
              children: [],
            },
          ],
        },
      ],
    };
    const remapped = remapSubtreeNodeIds(value, new Set(['root', 'existing']));
    const ids = collectPersistedNodeIds(remapped);
    const child = remapped.children[0];
    const text = child?.children[0];

    expect(remapped.id).toBe('root');
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain('section-source');
    expect(ids).not.toContain('text-source');
    expect(text?.attributes?.['aria-controls']).toBe(text?.id);
    assertUniquePersistedNodeIds(remapped);
  });

  it('returns an ID outside the document set even when the generated base collides', () => {
    const usedIds = new Set<string>();
    const first = generateFreshNodeId('text', usedIds);
    usedIds.add(first);
    const second = generateFreshNodeId('text', usedIds);

    expect(second).not.toBe(first);
    expect(usedIds.has(second)).toBe(false);
  });
});
