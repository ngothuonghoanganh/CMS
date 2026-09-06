import { describe, expect, it } from 'vitest';

import {
  CollectionDefinitionSchema,
  CreateCollectionRequestSchema,
  DynamicPageMetadataSchema,
  isCollectionFieldVisible,
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
    expect(() =>
      DynamicPageMetadataSchema.parse({
        collectionId: ids.collection,
        pathPattern: '/api/products/{slug}',
        lookupField: 'slug',
      }),
    ).toThrow(/reserved/i);
  });

  it('rejects reserved and duplicate field keys at request boundaries', () => {
    const field = {
      key: 'title',
      label: 'Title',
      type: 'text' as const,
      required: false,
      indexed: false,
      unique: false,
      status: 'active' as const,
      manualSlugOverride: true,
    };
    expect(() =>
      CreateCollectionRequestSchema.parse({
        key: 'products',
        name: 'Products',
        singularName: 'Product',
        fields: [field, { ...field }],
      }),
    ).toThrow(/unique/i);
    expect(() =>
      CreateCollectionRequestSchema.parse({
        key: 'products',
        name: 'Products',
        singularName: 'Product',
        fields: [{ ...field, key: 'publishedValues' }],
      }),
    ).toThrow(/reserved/i);
    expect(() =>
      CreateCollectionRequestSchema.parse({
        key: 'products',
        name: 'Products',
        singularName: 'Product',
        fields: [{ ...field, type: 'number', defaultValue: 'not-a-number' }],
      }),
    ).toThrow(/default/i);
  });

  it('supports server-owned constants and finite conditional visibility rules', () => {
    const kind = {
      id: '33333333-3333-4333-8333-333333333333',
      key: 'kind',
      label: 'Type',
      type: 'select' as const,
      required: true,
      indexed: false,
      unique: false,
      status: 'active' as const,
      manualSlugOverride: true,
      options: [{ label: 'Product', value: 'product' }],
    };
    const badge = {
      id: '44444444-4444-4444-8444-444444444444',
      key: 'badge',
      label: 'Badge',
      type: 'text' as const,
      required: true,
      indexed: false,
      unique: false,
      status: 'active' as const,
      manualSlugOverride: true,
      condition: {
        logic: 'all' as const,
        rules: [{ fieldKey: 'kind', operator: 'equals' as const, value: 'product' }],
      },
    };
    const country = {
      id: '55555555-5555-4555-8555-555555555555',
      key: 'country',
      label: 'Country',
      type: 'text' as const,
      required: true,
      indexed: false,
      unique: false,
      status: 'active' as const,
      manualSlugOverride: true,
      valueMode: 'constant' as const,
      constantValue: 'VN',
    };
    const parsed = CollectionDefinitionSchema.parse({
      id: ids.collection,
      workspaceId: ids.collection,
      key: 'products',
      name: 'Products',
      singularName: 'Product',
      fields: [kind, badge, country],
      titleFieldKey: 'kind',
      status: 'active',
      schemaVersion: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const fields = new Map(parsed.fields.map((field) => [field.key, field]));
    expect(
      isCollectionFieldVisible(fields.get('badge')!, { kind: 'product' }, fields),
    ).toBe(true);
    expect(
      isCollectionFieldVisible(fields.get('badge')!, { kind: 'service' }, fields),
    ).toBe(false);
    expect(parsed.fields.find((field) => field.key === 'country')?.constantValue).toBe(
      'VN',
    );

    expect(() =>
      CollectionDefinitionSchema.parse({
        ...parsed,
        fields: [
          kind,
          {
            ...badge,
            condition: { rules: [{ fieldKey: 'kind', operator: 'gt', value: 1 }] },
          },
          country,
        ],
      }),
    ).toThrow(/not valid|compatible/i);
  });

  it('rejects cyclic field conditions', () => {
    const fieldA = {
      id: '66666666-6666-4666-8666-666666666666',
      key: 'first',
      label: 'First',
      type: 'text' as const,
      required: false,
      indexed: false,
      unique: false,
      status: 'active' as const,
      manualSlugOverride: true,
      condition: { rules: [{ fieldKey: 'second', operator: 'isSet' as const }] },
    };
    const fieldB = {
      id: '77777777-7777-4777-8777-777777777777',
      key: 'second',
      label: 'Second',
      type: 'text' as const,
      required: false,
      indexed: false,
      unique: false,
      status: 'active' as const,
      manualSlugOverride: true,
      condition: { rules: [{ fieldKey: 'first', operator: 'isSet' as const }] },
    };
    expect(() =>
      CollectionDefinitionSchema.parse({
        id: ids.collection,
        workspaceId: ids.collection,
        key: 'cyclic',
        name: 'Cyclic',
        singularName: 'Cyclic item',
        fields: [fieldA, fieldB],
        status: 'active',
        schemaVersion: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toThrow(/cycles/i);
  });
});
