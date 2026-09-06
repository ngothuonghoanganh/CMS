import { describe, expect, it } from 'vitest';

import {
  classifyPageDocumentChanges,
  createPageDocument,
  PagePayloadSchema,
  PagePayloadV7Schema,
  summarizePageChanges,
} from './index';

function payload(
  children: Array<Record<string, unknown>> = [],
  metadata: Record<string, unknown> = { documentTitle: 'Page' },
) {
  return PagePayloadSchema.parse({
    version: 1,
    metadata,
    root: {
      id: 'root',
      type: 'root',
      props: {},
      children: [
        {
          id: 'section-1',
          type: 'section',
          props: {},
          children,
        },
      ],
    },
  });
}

function textNode(text: string, style?: Record<string, unknown>) {
  return {
    id: 'text-1',
    type: 'text',
    props: { text, align: 'left' },
    children: [],
    ...(style ? { style: { base: style } } : {}),
  };
}

function payloadV7(children: Array<Record<string, unknown>> = []) {
  return PagePayloadV7Schema.parse({
    version: 7,
    metadata: { documentTitle: 'Page' },
    root: {
      id: 'root',
      type: 'root',
      props: {},
      children: [
        {
          id: 'section-1',
          type: 'section',
          props: {},
          children,
        },
      ],
    },
  });
}

function payloadV7WithRootChildren(rootChildren: Array<Record<string, unknown>>) {
  return PagePayloadV7Schema.parse({
    version: 7,
    metadata: { documentTitle: 'Page' },
    root: { id: 'root', type: 'root', props: {}, children: rootChildren },
  });
}

describe('page change classifier', () => {
  it('treats collection query changes as design changes even in the content group', () => {
    const queryA = '11111111-1111-4111-8111-111111111111';
    const queryB = '22222222-2222-4222-8222-222222222222';
    const collectionList = (queryId: string) => ({
      id: 'collection-list-1',
      type: 'collection-list' as const,
      props: { queryId, emptyMessage: 'No items' },
      children: [
        {
          id: 'collection-item-1',
          type: 'collection-item' as const,
          props: {},
          children: [],
        },
      ],
    });
    const previous = payloadV7([collectionList(queryA)]);
    const next = payloadV7([collectionList(queryB)]);

    const classification = classifyPageDocumentChanges(previous, next);
    expect(classification.contentChanges).toEqual([]);
    expect(classification.designChanges).toEqual([
      expect.objectContaining({
        category: 'design-property-changed',
        property: 'queryId',
      }),
    ]);
  });

  it.each([
    [
      'tabs',
      'orientation',
      { orientation: 'horizontal', ariaLabel: 'Tabs', activationMode: 'automatic' },
      { orientation: 'vertical', ariaLabel: 'Tabs', activationMode: 'automatic' },
    ],
    [
      'navigation-view',
      'source',
      {
        source: 'main',
        orientation: 'horizontal',
        mobileBehavior: 'collapse',
        alignment: 'left',
        ariaLabel: 'Main navigation',
      },
      {
        source: 'footer',
        orientation: 'horizontal',
        mobileBehavior: 'collapse',
        alignment: 'left',
        ariaLabel: 'Main navigation',
      },
    ],
    ['global-header', 'position', { position: 'static' }, { position: 'sticky' }],
  ] as const)('%s.%s is design-scoped', (type, property, previousProps, nextProps) => {
    const component = (props: Record<string, unknown>) => ({
      id: 'component-1',
      type,
      props,
      children:
        type === 'tabs'
          ? [{ id: 'tab-1', type: 'tab-item', props: { label: 'Tab' }, children: [] }]
          : [],
    });
    const tree = (props: Record<string, unknown>) => {
      const selected = component(props);
      if (type === 'navigation-view') {
        return [
          {
            id: 'header-1',
            type: 'global-header',
            props: { position: 'static' },
            children: [selected],
          },
        ];
      }
      if (type === 'global-header') return [selected];
      return [{ id: 'section-1', type: 'section', props: {}, children: [selected] }];
    };
    const previous = payloadV7WithRootChildren(tree(previousProps));
    const next = payloadV7WithRootChildren(tree(nextProps));

    const classification = classifyPageDocumentChanges(previous, next);
    expect(classification.contentChanges).toEqual([]);
    expect(classification.designChanges).toEqual([
      expect.objectContaining({
        category: 'design-property-changed',
        property,
      }),
    ]);
  });

  it('keeps the whole form custom editor design-scoped until copy-only semantics exist', () => {
    const previous = payloadV7([
      {
        id: 'form-1',
        type: 'form' as const,
        props: {
          fields: [
            {
              id: 'field-1',
              type: 'text' as const,
              name: 'email',
              label: 'Email',
              required: true,
            },
          ],
          submitLabel: 'Submit',
          successMessage: 'Thanks',
        },
        children: [],
      },
    ]);
    const next = payloadV7([
      {
        id: 'form-1',
        type: 'form' as const,
        props: {
          fields: [
            {
              id: 'field-1',
              type: 'text' as const,
              name: 'email',
              label: 'Email',
              required: true,
            },
          ],
          submitLabel: 'Send',
          successMessage: 'Thanks',
        },
        children: [],
      },
    ]);

    const classification = classifyPageDocumentChanges(previous, next);
    expect(classification.contentChanges).toEqual([]);
    expect(classification.designChanges).toEqual([
      expect.objectContaining({
        category: 'design-property-changed',
        property: 'submitLabel',
      }),
    ]);
  });

  it('separates registry-scoped content edits from design edits', () => {
    const previous = payload([textNode('Before')]);
    const next = payload([textNode('After')]);

    expect(classifyPageDocumentChanges(previous, next)).toMatchObject({
      contentChanges: [
        expect.objectContaining({
          category: 'content-property-changed',
          property: 'text',
        }),
      ],
      designChanges: [],
    });
  });

  it('treats structural, style, and responsive changes as design-only', () => {
    const previous = payload([textNode('Same')]);
    const next = payload([
      textNode('Same', { color: 'red' }),
      { id: 'text-2', type: 'text', props: { text: 'Added' }, children: [] },
    ]);

    const classification = classifyPageDocumentChanges(previous, next);
    expect(classification.contentChanges).toHaveLength(0);
    expect(classification.designChanges.map((change) => change.category)).toEqual(
      expect.arrayContaining(['style-changed', 'node-added']),
    );
  });

  it('compares composition semantically instead of using serialized JSON order', () => {
    const previous = createPageDocument(payload([textNode('Same')]), {
      attachments: [],
      layoutAttachments: [],
      bindings: [],
      actions: [],
      resources: [],
      queries: [],
    });
    const reorderedKeys = createPageDocument(payload([textNode('Same')]), {
      resources: [],
      actions: [],
      bindings: [],
      layoutAttachments: [],
      attachments: [],
      queries: [],
    });

    expect(classifyPageDocumentChanges(previous, reorderedKeys).designChanges).toEqual(
      [],
    );
  });

  it('summarizes structural and field changes for publish review', () => {
    const classification = classifyPageDocumentChanges(
      payload([textNode('Before')]),
      payload([
        textNode('After'),
        { id: 'text-2', type: 'text', props: { text: 'New' }, children: [] },
      ]),
    );

    expect(summarizePageChanges(classification)).toMatchObject({
      contentFieldChanges: 1,
      componentsAdded: 1,
      designValueChanges: 0,
    });
  });
});
