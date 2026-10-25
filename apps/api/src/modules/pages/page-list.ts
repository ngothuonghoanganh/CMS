import type { PageCounts, PageListResponse, PageStatusKind, PageSummary } from '@plp/contracts';
import { decodeCursor, encodeCursor } from '../../shared/cursor.js';

/** A page of the list with what the dashboard needs about it. */
export interface ListedPage {
  summary: PageSummary;
  blockingCount: number;
}

export interface PageListFilter {
  status?: PageStatusKind | undefined;
  q?: string | undefined;
}

/** Whether a page with status `kind` is listed under the `status` filter (and its chip count). */
export function matchesStatusFilter(kind: PageStatusKind, filter: PageStatusKind): boolean {
  // "Live" means currently live, so it includes the live pages with unpublished changes.
  return filter === 'live' ? kind === 'live' || kind === 'live_with_changes' : kind === filter;
}

const STATUS_FILTERS: readonly PageStatusKind[] = [
  'live',
  'live_with_changes',
  'draft',
  'unpublished',
];

/** Chip counts; each one equals the number of pages its `status` filter lists. */
export function countPages(pages: readonly ListedPage[]): PageCounts {
  const counts: PageCounts = { all: 0, live: 0, live_with_changes: 0, draft: 0, unpublished: 0 };
  for (const { summary } of pages) {
    counts.all += 1;
    for (const filter of STATUS_FILTERS) {
      if (matchesStatusFilter(summary.status.kind, filter)) {
        counts[filter] += 1;
      }
    }
  }
  return counts;
}

/**
 * The dashboard's "Cần chú ý" card. `pages` are sorted most recently updated first, so the first
 * page needing attention is the most recently updated one.
 */
export function attentionOf(pages: readonly ListedPage[]): PageListResponse['attention'] {
  const withChanges = pages.filter(({ summary }) => summary.status.kind === 'live_with_changes');
  const withBlocking = pages.filter(({ blockingCount }) => blockingCount > 0);
  const first = pages.find(
    ({ summary, blockingCount }) =>
      summary.status.kind === 'live_with_changes' || blockingCount > 0,
  );
  return {
    pagesWithChanges: withChanges.length,
    pagesWithBlockingErrors: withBlocking.length,
    firstPage: first ? { id: first.summary.id, title: first.summary.title } : null,
  };
}

/** Status filter and a case-insensitive substring search on the title or the slug. */
export function filterPages(pages: readonly ListedPage[], filter: PageListFilter): ListedPage[] {
  const query = filter.q?.trim().toLocaleLowerCase('vi') ?? '';
  return pages.filter(({ summary }) => {
    if (filter.status !== undefined && !matchesStatusFilter(summary.status.kind, filter.status)) {
      return false;
    }
    if (query === '') {
      return true;
    }
    return (
      summary.title.toLocaleLowerCase('vi').includes(query) ||
      summary.slug.toLocaleLowerCase('vi').includes(query)
    );
  });
}

function isAfter(summary: PageSummary, cursor: { createdAt: Date; id: string }): boolean {
  const updatedAt = Date.parse(summary.updatedAt);
  const boundary = cursor.createdAt.getTime();
  return updatedAt < boundary || (updatedAt === boundary && summary.id < cursor.id);
}

/**
 * Keyset page over pages sorted by (updatedAt desc, id desc). The cursor encodes the last item's
 * `updatedAt` and id, so pages edited in between do not shift the next page.
 */
export function paginatePages(
  pages: readonly ListedPage[],
  cursor: string | undefined,
  limit: number,
): { items: ListedPage[]; nextCursor: string | null } {
  const position = cursor === undefined ? null : decodeCursor(cursor);
  const remaining = position ? pages.filter(({ summary }) => isAfter(summary, position)) : pages;
  const items = remaining.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      remaining.length > limit && last
        ? encodeCursor({ createdAt: new Date(last.summary.updatedAt), id: last.summary.id })
        : null,
  };
}
