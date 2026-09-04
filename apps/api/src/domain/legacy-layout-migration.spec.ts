import { describe, expect, it } from 'vitest';

// The migration runner is intentionally a Node ESM script. These pure helpers
// are imported here so rerun/idempotency rules are covered without connecting
// to MongoDB in the unit test suite.
// @ts-expect-error The JavaScript migration utility is runtime-tested by Vitest.
import {
  layoutSlot,
  legacyDocument,
  legacyGlobal,
  uuidFor,
} from '../../../../scripts/legacy-layout-migration-utils.mjs';

const header = {
  version: 1,
  documentKind: 'site-header',
  metadata: { documentTitle: 'Legacy header' },
  root: { id: 'root', type: 'root', props: {}, children: [] },
};

describe('legacy layout migration helpers', () => {
  it('creates stable ids and keeps the same site/kind idempotent', () => {
    expect(uuidFor('site-1:header')).toBe(uuidFor('site-1:header'));
    expect(uuidFor('site-1:header')).not.toBe(uuidFor('site-1:footer'));
  });

  it('accepts only well-formed header/footer documents', () => {
    expect(legacyDocument(header, 'header')).toEqual(header);
    expect(
      legacyDocument({ ...header, documentKind: 'site-footer' }, 'header'),
    ).toBeNull();
    expect(
      legacyDocument({ ...header, root: { children: 'invalid' } }, 'header'),
    ).toBeNull();
  });

  it('preserves draft and published source selection and attachment slots', () => {
    const site = {
      globalsDraft: { header },
      publishedGlobals: { footer: { ...header, documentKind: 'site-footer' } },
    };
    expect(legacyGlobal(site, 'draft', 'header')).toEqual(header);
    expect(legacyGlobal(site, 'published', 'footer')?.documentKind).toBe('site-footer');
    expect(layoutSlot('header')).toBe('page.header.top');
    expect(layoutSlot('footer')).toBe('page.footer.bottom');
  });
});
