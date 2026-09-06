import { describe, expect, it, vi } from 'vitest';

import {
  CollectionDefinitionSchema,
  type CollectionQueryRequest,
  type CollectionDefinition,
} from '@payload/contracts';

import { CollectionService } from './collection.service';

const collection = CollectionDefinitionSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  siteId: '33333333-3333-4333-8333-333333333333',
  key: 'products',
  name: 'Products',
  singularName: 'Product',
  fields: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      key: 'title',
      label: 'Title',
      type: 'text',
      required: true,
      indexed: true,
      unique: false,
      status: 'active',
      manualSlugOverride: true,
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      key: 'published_at',
      label: 'Published at',
      type: 'datetime',
      required: false,
      indexed: true,
      unique: false,
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

function validateQuery(request: CollectionQueryRequest): void {
  const service = Object.create(CollectionService.prototype) as CollectionService;
  const validator = (
    service as unknown as {
      validateQuery: (model: CollectionDefinition, query: CollectionQueryRequest) => void;
    }
  ).validateQuery.bind(service);
  validator(collection, request);
}

describe('CollectionService query validation', () => {
  it('accepts range operators for date-like fields', () => {
    expect(() =>
      validateQuery({
        filters: [
          {
            field: 'published_at',
            operator: 'gte',
            value: '2026-01-01T00:00:00.000Z',
          },
        ],
        sort: [{ field: 'published_at', direction: 'desc' }],
        limit: 20,
        offset: 0,
      }),
    ).not.toThrow();
  });

  it('rejects text operators that are unsafe or meaningless for date fields', () => {
    expect(() =>
      validateQuery({
        filters: [{ field: 'published_at', operator: 'contains', value: '2026' }],
        sort: [],
        limit: 20,
        offset: 0,
      }),
    ).toThrow(/not valid/i);
  });

  it('rejects structured fields as sort keys', () => {
    const structuredCollection = {
      ...collection,
      fields: [
        ...collection.fields,
        {
          id: '66666666-6666-4666-8666-666666666666',
          key: 'metadata',
          label: 'Metadata',
          type: 'group' as const,
          required: false,
          indexed: false,
          unique: false,
          status: 'active' as const,
          manualSlugOverride: true,
        },
      ],
    };
    const service = Object.create(CollectionService.prototype) as CollectionService;
    const validator = (
      service as unknown as {
        validateQuery: (
          model: CollectionDefinition,
          query: CollectionQueryRequest,
        ) => void;
      }
    ).validateQuery.bind(service);
    expect(() =>
      validator(structuredCollection, {
        filters: [],
        sort: [{ field: 'metadata', direction: 'asc' }],
        limit: 20,
        offset: 0,
      }),
    ).toThrow(/sort/i);
  });
});

describe('CollectionService entry value semantics', () => {
  it('overwrites constants and skips required validation for hidden fields', async () => {
    const service = Object.create(CollectionService.prototype) as CollectionService;
    (
      service as unknown as { entryModel: { exists: ReturnType<typeof vi.fn> } }
    ).entryModel = {
      exists: vi.fn().mockResolvedValue(false),
    };
    const validator = (
      service as unknown as {
        validateValues: (
          workspaceId: string,
          siteId: string | undefined,
          model: CollectionDefinition,
          input: Record<string, unknown>,
        ) => Promise<{ values: Record<string, unknown> }>;
      }
    ).validateValues.bind(service);
    const conditionalCollection = CollectionDefinitionSchema.parse({
      ...collection,
      fields: [
        {
          ...collection.fields[0],
          valueMode: 'constant',
          constantValue: 'server-owned',
        },
        {
          id: '66666666-6666-4666-8666-666666666666',
          key: 'show_details',
          label: 'Show details',
          type: 'boolean',
          required: false,
          indexed: false,
          unique: false,
          status: 'active',
          manualSlugOverride: true,
        },
        {
          id: '77777777-7777-4777-8777-777777777777',
          key: 'details',
          label: 'Details',
          type: 'text',
          required: true,
          indexed: false,
          unique: false,
          status: 'active',
          manualSlugOverride: true,
          condition: {
            logic: 'all',
            rules: [{ fieldKey: 'show_details', operator: 'equals', value: true }],
          },
        },
      ],
      titleFieldKey: 'title',
    });

    await expect(
      validator(collection.workspaceId, undefined, conditionalCollection, {
        title: 'client-value',
        show_details: false,
      }),
    ).resolves.toMatchObject({
      values: { title: 'server-owned', show_details: false },
    });
  });
});
