import { describe, expect, it } from 'vitest';

import { readDataPath, resolveBinding, resolveNodeProperty } from './data-runtime';
import { PageBindingSchema } from './extension-platform';

const binding = {
  id: '11111111-1111-4111-8111-111111111111',
  targetNodeId: 'heading',
  targetProperty: 'text',
  source: {
    type: 'query-item' as const,
    sourceId: '22222222-2222-4222-8222-222222222222',
    path: 'title',
  },
  fallback: 'Fallback',
};

describe('safe data binding runtime', () => {
  it('requires query bindings to identify a query source', () => {
    expect(() =>
      PageBindingSchema.parse({
        ...binding,
        source: { ...binding.source, type: 'query', sourceId: undefined },
      }),
    ).toThrow(/sourceId/i);
  });

  it('reads only finite field paths and resolves a query item', () => {
    expect(readDataPath({ title: 'A' }, 'title')).toBe('A');
    expect(readDataPath({ title: 'A' }, 'constructor.name')).toBeUndefined();
    expect(
      resolveBinding(binding, {
        currentEntry: undefined,
        queryItems: {
          '22222222-2222-4222-8222-222222222222': [
            {
              id: '33333333-3333-4333-8333-333333333333',
              collectionId: '44444444-4444-4444-8444-444444444444',
              values: { title: 'Product A' },
            },
          ],
        },
        variables: {},
      }),
    ).toBe('Product A');
  });

  it('uses a binding fallback without evaluating expressions', () => {
    expect(
      resolveNodeProperty(
        [binding],
        'heading',
        'text',
        {
          queryItems: {},
          variables: {},
        },
        'Original',
      ),
    ).toBe('Fallback');
    expect(
      resolveNodeProperty(
        [],
        'heading',
        'text',
        {
          queryItems: {},
          variables: {},
        },
        'Original',
      ),
    ).toBe('Original');
  });
});
