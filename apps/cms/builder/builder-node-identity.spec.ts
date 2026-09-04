import { describe, expect, it } from 'vitest';

import {
  assertUniquePersistedNodeIds,
  collectPersistedNodeIds,
  findDuplicatePersistedNodeIds,
  generateFreshNodeId,
  remapSubtreeNodeIds,
  repairDuplicatePersistedNodeIds,
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

  it('gives cloned extension visual nodes independent attachment identities', () => {
    const value = {
      id: 'extension-source',
      type: 'extension',
      attributes: {
        'data-payload-extension-props': JSON.stringify({
          extensionId: 'custom-launch',
          attachmentId: '44444444-4444-4444-8444-444444444444',
          values: {},
        }),
      },
      children: [],
    };
    const remapped = remapSubtreeNodeIds(value, new Set(['extension-source']));
    const props = JSON.parse(remapped.attributes['data-payload-extension-props']) as {
      attachmentId: string;
    };

    expect(props.attachmentId).not.toBe('44444444-4444-4444-8444-444444444444');
  });

  it('repairs duplicate hydrated IDs while preserving the first node and references', () => {
    const value = {
      id: 'root',
      type: 'root',
      children: [
        {
          id: 'button-shared',
          type: 'button',
          children: [],
        },
        {
          id: 'button-shared',
          type: 'button',
          attributes: {
            'data-payload-node-id': 'button-shared',
            'data-payload-node-type': 'button',
            'aria-controls': 'button-shared',
          },
          children: [],
        },
      ],
    };

    const repaired = repairDuplicatePersistedNodeIds(value);
    const first = repaired.children[0];
    const second = repaired.children[1];
    expect(first?.id).toBe('button-shared');
    expect(second?.id).not.toBe('button-shared');
    expect(second?.attributes?.['data-payload-node-id']).toBe(second?.id);
    expect(second?.attributes?.['aria-controls']).toBe(second?.id);
    assertUniquePersistedNodeIds(repaired);
  });

  it('does not treat component prop IDs as persisted page node IDs', () => {
    const value = {
      id: 'root',
      type: 'root',
      props: {
        items: [{ id: 'button-shared', text: 'A' }],
      },
      children: [{ id: 'button-shared', type: 'button', children: [] }],
    };

    const repaired = repairDuplicatePersistedNodeIds(value);
    expect(repaired.props.items[0]?.id).toBe('button-shared');
    expect(repaired.children[0]?.id).toBe('button-shared');
    assertUniquePersistedNodeIds(repaired);
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
