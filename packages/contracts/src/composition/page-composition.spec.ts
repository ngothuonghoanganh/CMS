import { describe, expect, it } from 'vitest';

import {
  createEmptyPageCompositionV1,
  deserializePageCompositionV1,
  PAGE_COMPOSITION_V1_MAX_NODES,
  PAGE_COMPOSITION_V1_MAX_SERIALIZED_BYTES,
  PAGE_COMPOSITION_V1_MAX_TREE_DEPTH,
  PageCompositionV1Schema,
  parsePageCompositionV1,
  serializePageCompositionV1,
} from './page-composition';

const validComposition = {
  version: 1 as const,
  root: {
    id: 'root',
    type: 'root' as const,
    props: {},
    children: [
      {
        id: 'hero',
        type: 'section' as const,
        props: {},
        style: { base: { padding: '32px' } },
        children: [
          {
            id: 'hero-copy',
            type: 'text' as const,
            props: { text: 'Canonical content' },
            children: [],
          },
        ],
      },
    ],
  },
  settings: {},
};

describe('PageCompositionV1 contract', () => {
  it('creates an empty canonical document', () => {
    expect(createEmptyPageCompositionV1()).toEqual({
      version: 1,
      root: { id: 'root', type: 'root', props: {}, children: [] },
      settings: {},
    });
  });

  it('accepts a canonical authoring document', () => {
    expect(parsePageCompositionV1(validComposition)).toEqual(validComposition);
  });

  it('rejects invalid hierarchy and node identity', () => {
    expect(
      PageCompositionV1Schema.safeParse({
        ...validComposition,
        root: {
          ...validComposition.root,
          children: [
            {
              id: 'orphan-text',
              type: 'text',
              props: { text: 'Invalid direct child' },
              children: [],
            },
          ],
        },
      }).success,
    ).toBe(false);

    expect(
      PageCompositionV1Schema.safeParse({
        ...validComposition,
        root: {
          ...validComposition.root,
          children: [
            {
              id: 'text-with-editor-style',
              type: 'text',
              props: { text: 'No editor style' },
              style: { base: { editorState: 'selected' } },
              children: [],
            },
          ],
        },
      }).success,
    ).toBe(false);

    expect(
      PageCompositionV1Schema.safeParse({
        ...validComposition,
        root: { ...validComposition.root, id: 'root.without-stable-format' },
      }).success,
    ).toBe(false);

    expect(
      PageCompositionV1Schema.safeParse({
        ...validComposition,
        root: { ...validComposition.root, id: ' root' },
      }).success,
    ).toBe(false);
  });

  it('rejects unsupported components and editor-only metadata', () => {
    expect(
      PageCompositionV1Schema.safeParse({
        ...validComposition,
        root: {
          ...validComposition.root,
          children: [
            {
              id: 'unknown',
              type: 'unsupported-component',
              props: {},
              children: [],
            },
          ],
        },
      }).success,
    ).toBe(false);

    expect(
      PageCompositionV1Schema.safeParse({
        ...validComposition,
        root: {
          ...validComposition.root,
          children: [
            {
              id: 'text-with-editor-state',
              type: 'text',
              props: { text: 'No editor state', editorState: { selected: true } },
              children: [],
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it('round-trips canonical data without changing its serialized shape', () => {
    const serialized = serializePageCompositionV1(validComposition);
    const parsed = deserializePageCompositionV1(serialized);

    expect(parsed).toEqual(validComposition);
    expect(serializePageCompositionV1(parsed)).toBe(serialized);
  });

  it('rejects duplicate node ids and invalid behavior references', () => {
    const duplicated = {
      ...validComposition,
      root: {
        ...validComposition.root,
        children: [validComposition.root.children[0], validComposition.root.children[0]],
      },
    };
    expect(() => parsePageCompositionV1(duplicated)).toThrow();
    expect(() =>
      parsePageCompositionV1({
        ...validComposition,
        behaviorRefs: [{ id: 'action-1', kind: 'action', nodeId: 'missing' }],
      }),
    ).toThrow();
    expect(() =>
      parsePageCompositionV1({
        ...validComposition,
        behaviorRefs: [
          { id: 'action-1', kind: 'action', nodeId: 'hero' },
          { id: 'action-1', kind: 'action', nodeId: 'hero' },
        ],
      }),
    ).toThrow();
  });

  it('enforces node count, tree depth, serialized size and root identity', () => {
    expect(() =>
      parsePageCompositionV1({
        ...validComposition,
        root: { ...validComposition.root, id: 'other' },
      }),
    ).toThrow();
    expect(() =>
      parsePageCompositionV1({
        ...validComposition,
        root: {
          ...validComposition.root,
          children: Array.from({ length: PAGE_COMPOSITION_V1_MAX_NODES }, (_, index) => ({
            id: `section-${index}`,
            type: 'section',
            props: {},
            children: [],
          })),
        },
      }),
    ).toThrow();
    let deepNode: { id: string; type: string; props: object; children: unknown[] } = {
      id: 'leaf',
      type: 'section',
      props: {},
      children: [],
    };
    for (let depth = 0; depth < PAGE_COMPOSITION_V1_MAX_TREE_DEPTH - 1; depth += 1) {
      deepNode = {
        id: `level-${depth}`,
        type: 'section',
        props: {},
        children: [deepNode],
      };
    }
    expect(() =>
      parsePageCompositionV1({
        ...validComposition,
        root: { ...validComposition.root, children: [deepNode] },
      }),
    ).toThrow();
    expect(() =>
      parsePageCompositionV1({
        ...validComposition,
        root: {
          ...validComposition.root,
          children: [
            {
              id: 'large',
              type: 'section',
              props: { text: 'x'.repeat(PAGE_COMPOSITION_V1_MAX_SERIALIZED_BYTES) },
              children: [],
            },
          ],
        },
      }),
    ).toThrow();
  });
});
