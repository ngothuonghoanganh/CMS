import type { PageListResponse } from '@plp/contracts';
import { describe, expect, it, vi } from 'vitest';
import { loadAllPages, referencedAssetIds } from './load-editor-data';
import { pageSummary, sampleComposition, site } from './test-fixtures';

function pagesResponse(nextCursor: string | null): PageListResponse {
  return {
    items: [pageSummary()],
    nextCursor,
    counts: { all: 1, live: 0, live_with_changes: 0, draft: 1, unpublished: 0 },
    attention: { pagesWithChanges: 0, pagesWithBlockingErrors: 0, firstPage: null },
  };
}

describe('editor data loading', () => {
  it('follows page cursors but never past the per-site page limit', async () => {
    const fetchPage = vi.fn((cursor: string | null) =>
      Promise.resolve(pagesResponse(`after-${cursor ?? 'start'}`)),
    );
    const pages = await loadAllPages(fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(4);
    expect(fetchPage.mock.calls.map(([cursor]) => cursor)).toEqual([
      null,
      'after-start',
      'after-after-start',
      'after-after-after-start',
    ]);
    expect(pages).toHaveLength(4);
  });

  it('collects image, share image and logo asset ids', () => {
    const composition = sampleComposition();
    const hero = composition.sections[1];
    if (hero) {
      hero.content = {
        ...hero.content,
        image: { assetId: 'a'.repeat(24), alt: '', decorative: true },
      };
    }
    const ids = referencedAssetIds(
      composition,
      { title: '', description: '', shareImageAssetId: 'b'.repeat(24), noindex: false },
      { ...site, logoAssetId: 'c'.repeat(24) },
    );
    expect([...ids].sort()).toEqual(['a'.repeat(24), 'b'.repeat(24), 'c'.repeat(24)]);
  });
});
