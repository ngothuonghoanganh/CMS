import { describe, expect, it } from 'vitest';

import type { Asset } from '@payload/contracts';

import {
  collectionFieldControl,
  filterAssets,
  referenceIds,
} from './collection-field-controls';

const asset = (overrides: Partial<Asset> = {}): Asset =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    filename: 'hero.png',
    mimeType: 'image/png',
    size: 120,
    storageKey: '/assets/hero.png',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as Asset;

describe('collection field controls', () => {
  it('maps schema types to semantic controls', () => {
    expect(collectionFieldControl('boolean')).toBe('boolean');
    expect(collectionFieldControl('rich-text')).toBe('textarea');
    expect(collectionFieldControl('image')).toBe('asset');
    expect(collectionFieldControl('reference')).toBe('reference');
    expect(collectionFieldControl('group')).toBe('structured');
  });

  it('filters assets by bounded text and media type', () => {
    const assets = [
      asset(),
      asset({
        id: '33333333-3333-4333-8333-333333333333',
        filename: 'clip.mp4',
        mimeType: 'video/mp4',
      }),
    ];
    expect(filterAssets(assets, 'hero', 'image')).toHaveLength(1);
    expect(filterAssets(assets, '', 'video')[0]?.filename).toBe('clip.mp4');
  });

  it('normalizes one-to-many reference values', () => {
    expect(referenceIds('11111111-1111-4111-8111-111111111111', 'one')).toEqual([
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect(referenceIds(['a', 3, 'b'], 'many')).toEqual(['a', 'b']);
    expect(referenceIds('a,b', 'many')).toEqual([]);
  });
});
