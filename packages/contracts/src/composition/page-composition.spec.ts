import { describe, expect, it } from 'vitest';

import {
  deserializePageCompositionV1,
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
});
