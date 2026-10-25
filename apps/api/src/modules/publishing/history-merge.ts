import { encodeCursor } from '../../shared/cursor.js';
import type { KeysetPage } from '../../shared/persistence/keyset.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';

export interface Positioned {
  _id: ObjectId;
  createdAt: Date;
}

/** Order of every keyset list: newest first, ties broken by the larger id. */
export function newestFirst(a: Positioned, b: Positioned): number {
  const byTime = b.createdAt.getTime() - a.createdAt.getTime();
  if (byTime !== 0) {
    return byTime;
  }
  const aId = a._id.toHexString();
  const bId = b._id.toHexString();
  return aId === bId ? 0 : aId < bId ? 1 : -1;
}

/**
 * Merges keyset pages of several lists, each fetched with the same cursor and limit, into one page
 * newest first. The cursor points at the last item taken, so the items of any list that were not
 * taken this time are the first ones of the next page.
 */
export function mergeKeysetPages<T extends Positioned>(
  pages: readonly KeysetPage<T>[],
  limit: number,
): KeysetPage<T> {
  const merged = pages.flatMap((page) => page.items).sort(newestFirst);
  const items = merged.slice(0, limit);
  const hasMore = merged.length > limit || pages.some((page) => page.nextCursor !== null);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeCursor({ createdAt: last.createdAt, id: last._id.toHexString() })
        : null,
  };
}
