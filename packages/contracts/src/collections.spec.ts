import { describe, expect, it } from 'vitest';

import {
  CollectionDefinitionSchema,
  DynamicPageMetadataSchema,
  PageQuerySchema,
} from './collections';

const ids = {
  collection: '11111111-1111-4111-8111-111111111111',
  field: '22222222-2222-4222-8222-222222222222',
};

describe('Phase 20 collection contracts', () => {
  it('accepts a collection schema and rejects duplicate field keys', () => {
    const collection = CollectionDefinitionSchema.parse({
      id: ids.collection,
      workspaceId: ids.collection,
      siteId: ids.collection,
      key: 'products',
      name: 'Products',
      singularName: 'Product',
      fields: [
        {
          id: ids.field,
          key: 'title',
          label: 'Title',
          type: 'text',
          required: true,
          indexed: true,
          unique: true,
          status: 'active',
          manualSlugOverride: true,
        },
      ],
      titleFieldKey: 'title',
      status: 'active',
      schemaVersion: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(collection.fields[0]?.key).toBe('title');

    expect(() =>
      CollectionDefinitionSchema.parse({
        ...collection,
        fields: [collection.fields[0], { ...collection.fields[0], id: ids.collection }],
      }),
    ).toThrow(/unique/i);
  });

  it('keeps queries finite and dynamic paths to one terminal parameter', () => {
    expect(
      PageQuerySchema.parse({
        id: ids.collection,
        source: { type: 'collection', collectionId: ids.collection },
        filters: [{ field: 'status', operator: 'equals', value: 'active' }],
        sort: [{ field: 'title', direction: 'asc' }],
        limit: 20,
        offset: 0,
      }),
    ).toMatchObject({ limit: 20 });
    expect(() =>
      PageQuerySchema.parse({
        id: ids.collection,
        source: { type: 'collection', collectionId: ids.collection },
        filters: Array.from({ length: 21 }, () => ({
          field: 'title',
          operator: 'equals',
          value: 'x',
        })),
      }),
    ).toThrow();
    expect(
      DynamicPageMetadataSchema.parse({
        collectionId: ids.collection,
        pathPattern: '/products/{slug}',
        lookupField: 'slug',
      }).pathPattern,
    ).toBe('/products/{slug}');
    expect(() =>
      DynamicPageMetadataSchema.parse({
        collectionId: ids.collection,
        pathPattern: '/products/{category}/{slug}',
        lookupField: 'slug',
      }),
    ).toThrow();
  });
});
