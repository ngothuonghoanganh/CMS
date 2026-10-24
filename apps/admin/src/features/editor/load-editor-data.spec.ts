import type { Asset, PageListResponse } from '@plp/contracts';
import { describe, expect, it, vi } from 'vitest';
import { loadAllPages, loadEditorAssets, referencedAssetIds } from './load-editor-data';
import { asset, pageSummary, sampleComposition, site } from './test-fixtures';

function pagesResponse(nextCursor: string | null): PageListResponse {
  return {
    items: [pageSummary()],
    nextCursor,
    counts: { all: 1, live: 0, live_with_changes: 0, draft: 1, unpublished: 0 },
    attention: { pagesWithChanges: 0, pagesWithBlockingErrors: 0, firstPage: null },
  };
}

function assetWithId(id: string): Asset {
  return { ...asset, id };
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

  it('loads asset pages only until every used asset is found', async () => {
    const pagesOfAssets = [
      { items: [assetWithId('1'.repeat(24))], nextCursor: 'p2' },
      { items: [assetWithId('2'.repeat(24))], nextCursor: 'p3' },
      { items: [assetWithId('3'.repeat(24))], nextCursor: null },
    ];
    const fetchPage = vi.fn((cursor: string | null) => {
      const index = cursor === null ? 0 : Number(cursor.slice(1)) - 1;
      const page = pagesOfAssets[index];
      if (!page) {
        throw new Error('unexpected page');
      }
      return Promise.resolve(page);
    });
    const assets = await loadEditorAssets(new Set(['2'.repeat(24)]), fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(assets.map((item) => item.id)).toEqual(['1'.repeat(24), '2'.repeat(24)]);

    fetchPage.mockClear();
    await loadEditorAssets(new Set(), fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
