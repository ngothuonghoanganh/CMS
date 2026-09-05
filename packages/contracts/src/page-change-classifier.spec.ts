import { describe, expect, it } from 'vitest';

import {
  classifyPageDocumentChanges,
  createPageDocument,
  PagePayloadSchema,
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

describe('page change classifier', () => {
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
