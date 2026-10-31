import type { PageStatusKind, PageSummary } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { decodeCursor } from '../../shared/cursor.js';
import {
  attentionOf,
  countPages,
  filterPages,
  type ListedPage,
  liveSiteUrlOf,
  paginatePages,
} from './page-list.js';

let counter = 0;

function listed(
  kind: PageStatusKind,
  overrides: { title?: string; slug?: string; updatedAt?: string; blocking?: number } = {},
): ListedPage {
  counter += 1;
  const id = counter.toString(16).padStart(24, '0');
  const summary = {
    id,
    title: overrides.title ?? `Trang ${counter}`,
    slug: overrides.slug ?? `trang-${counter}`,
    status: { kind, changeCount: 0, changes: [] },
    updatedAt:
      overrides.updatedAt ?? new Date(Date.UTC(2026, 9, 24, 10, 0, 100 - counter)).toISOString(),
  } as Pick<PageSummary, 'id' | 'title' | 'slug' | 'status' | 'updatedAt'>;
  return { summary: summary as PageSummary, blockingCount: overrides.blocking ?? 0 };
}

describe('page list helpers', () => {
  it('counts every status; "live" includes the live pages with changes', () => {
    const pages = [
      listed('live'),
      listed('live'),
      listed('draft'),
      listed('live_with_changes'),
      listed('unpublished'),
    ];
    expect(countPages(pages)).toEqual({
      all: 5,
      live: 3,
      live_with_changes: 1,
      draft: 1,
      unpublished: 1,
    });
  });

  it('filters "live" on both live kinds and "live_with_changes" on changed pages only', () => {
    const live = listed('live');
    const changed = listed('live_with_changes');
    const draft = listed('draft');
    const unpublished = listed('unpublished');
    const pages = [live, changed, draft, unpublished];
    expect(filterPages(pages, { status: 'live' })).toEqual([live, changed]);
    expect(filterPages(pages, { status: 'live_with_changes' })).toEqual([changed]);
    expect(filterPages(pages, { status: 'unpublished' })).toEqual([unpublished]);
    const counts = countPages(pages);
    for (const status of ['live', 'live_with_changes', 'draft', 'unpublished'] as const) {
      expect(counts[status]).toBe(filterPages(pages, { status }).length);
    }
  });

  it('computes attention and the most recently updated page needing it', () => {
    const fine = listed('live');
    const changed = listed('live_with_changes', { title: 'Có thay đổi' });
    const blocked = listed('draft', { blocking: 2 });
    expect(attentionOf([fine, changed, blocked])).toEqual({
      pagesWithChanges: 1,
      pagesWithBlockingErrors: 1,
      firstPage: { id: changed.summary.id, title: 'Có thay đổi' },
    });
    expect(attentionOf([fine])).toEqual({
      pagesWithChanges: 0,
      pagesWithBlockingErrors: 0,
      firstPage: null,
    });
  });

  it('filters by status and a case-insensitive search on title or slug', () => {
    const promo = listed('live', { title: 'Ưu đãi Niềng Răng', slug: 'uu-dai' });
    const about = listed('draft', { title: 'Giới thiệu', slug: 'gioi-thieu' });
    const pages = [promo, about];
    expect(filterPages(pages, { status: 'draft' })).toEqual([about]);
    expect(filterPages(pages, { q: 'niềng răng' })).toEqual([promo]);
    expect(filterPages(pages, { q: 'GIOI' })).toEqual([about]);
    expect(filterPages(pages, { q: '.*' })).toEqual([]);
    expect(filterPages(pages, { q: '  ' })).toEqual(pages);
  });

  it('pages with a cursor on (updatedAt, id) into disjoint pages', () => {
    const pages = [listed('live'), listed('live'), listed('live'), listed('live'), listed('live')];
    const first = paginatePages(pages, undefined, 2);
    expect(first.items).toEqual(pages.slice(0, 2));
    expect(decodeCursor(first.nextCursor ?? '').id).toBe(pages[1]?.summary.id);
    const second = paginatePages(pages, first.nextCursor ?? undefined, 2);
    expect(second.items).toEqual(pages.slice(2, 4));
    const third = paginatePages(pages, second.nextCursor ?? undefined, 2);
    expect(third.items).toEqual(pages.slice(4));
    expect(third.nextCursor).toBeNull();
  });

  it('breaks updatedAt ties with the id', () => {
    const at = '2026-10-24T10:00:00.000Z';
    const higher = listed('live', { updatedAt: at });
    const lower = { ...listed('live', { updatedAt: at }) };
    const [b, a] = [higher, lower].sort((x, y) => (x.summary.id < y.summary.id ? 1 : -1));
    if (!a || !b) {
      throw new Error('two pages expected');
    }
    const first = paginatePages([b, a], undefined, 1);
    expect(first.items).toEqual([b]);
    expect(paginatePages([b, a], first.nextCursor ?? undefined, 1).items).toEqual([a]);
  });
});

describe('liveSiteUrlOf', () => {
  function live(slug: string, publishedAt: string): ListedPage {
    const page = listed('live');
    return {
      ...page,
      summary: {
        ...page.summary,
        liveRelease: { id: page.summary.id, version: 1, slug, publishedAt },
        liveUrl: `https://smilecare.payload.site/${slug}`,
      },
    };
  }

  it('leads to the home page when it is live, else to the page published last', () => {
    const older = live('uu-dai', '2026-10-20T08:00:00.000Z');
    const newer = live('implant', '2026-10-24T08:00:00.000Z');
    expect(liveSiteUrlOf([older, newer])).toBe('https://smilecare.payload.site/implant');
    expect(liveSiteUrlOf([older, live('', '2026-10-01T08:00:00.000Z'), newer])).toBe(
      'https://smilecare.payload.site/',
    );
  });

  it('is null while no page is live', () => {
    const draft = listed('draft');
    expect(
      liveSiteUrlOf([
        { ...draft, summary: { ...draft.summary, liveRelease: null, liveUrl: null } },
      ]),
    ).toBeNull();
    expect(liveSiteUrlOf([])).toBeNull();
  });
});
