import { describe, expect, it } from 'vitest';

import { PagePayloadV3Schema } from '../index';
import { adaptLegacyPageDocument, LegacyPageAdapterError } from './page-adapter';

const legacyV1 = {
  version: 1 as const,
  metadata: {
    documentTitle: 'Legacy title',
    documentDescription: 'Legacy description',
  },
  root: {
    id: 'root',
    type: 'root' as const,
    props: {},
    children: [
      {
        id: 'legacy-section',
        type: 'section' as const,
        props: {},
        children: [
          {
            id: 'legacy-copy',
            type: 'text' as const,
            props: { text: 'Legacy content' },
            children: [],
          },
        ],
      },
    ],
  },
};

describe('LegacyPageAdapter', () => {
  it('converts legacy content deterministically and keeps metadata outside composition', () => {
    const source = JSON.parse(JSON.stringify(legacyV1)) as typeof legacyV1;
    const first = adaptLegacyPageDocument(source);
    const second = adaptLegacyPageDocument(source);

    expect(first).toEqual(second);
    expect(first.sourceVersion).toBe(1);
    expect(first.metadata).toEqual({
      documentTitle: 'Legacy title',
      documentDescription: 'Legacy description',
    });
    expect(first.composition).toEqual({
      version: 1,
      root: {
        id: 'root',
        type: 'root',
        props: {},
        children: [
          {
            id: 'legacy-section',
            type: 'section',
            props: {},
            children: [
              {
                id: 'legacy-copy',
                type: 'text',
                props: { text: 'Legacy content' },
                children: [],
              },
            ],
          },
        ],
      },
      settings: {},
    });
    expect(source).toEqual(legacyV1);
  });

  it('rejects an unsupported legacy feature explicitly instead of dropping it', () => {
    const legacyCountdown = PagePayloadV3Schema.parse({
      version: 3,
      metadata: { documentTitle: 'Countdown' },
      root: {
        id: 'root',
        type: 'root',
        props: {},
        children: [
          {
            id: 'section',
            type: 'section',
            props: {},
            children: [
              {
                id: 'countdown',
                type: 'countdown',
                props: {
                  label: 'Launch',
                  targetAt: '2030-01-01T00:00:00.000Z',
                },
                children: [],
              },
            ],
          },
        ],
      },
    });

    try {
      adaptLegacyPageDocument(legacyCountdown);
      throw new Error('Expected the legacy adapter to reject countdown');
    } catch (error) {
      expect(error).toBeInstanceOf(LegacyPageAdapterError);
      expect(error).toMatchObject({
        code: 'UNSUPPORTED_LEGACY_FEATURE',
        path: ['root', 'children', 0, 'children', 0],
      });
      expect((error as Error).message).toMatch(/countdown/i);
    }
  });

  it('rejects malformed legacy input at the compatibility boundary', () => {
    expect(() => adaptLegacyPageDocument({ version: 999 })).toThrow(
      /legacy page document/i,
    );
  });
});
