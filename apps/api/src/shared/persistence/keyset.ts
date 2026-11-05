import { Types } from 'mongoose';
import { type CursorPosition, decodeCursor, encodeCursor } from '../cursor.js';
import type { ObjectId } from './object-id.js';

/** One page of a keyset-paginated list, newest first. */
export interface KeysetPage<T> {
  items: T[];
  /** Opaque cursor for the next page; null on the last page. */
  nextCursor: string | null;
}

/** Sort order every keyset list uses; pair it with an index ending in `createdAt: -1, _id: -1`. */
export const NEWEST_FIRST = { createdAt: -1, _id: -1 } as const;

/** Filter clause for the records strictly after a position in `NEWEST_FIRST` order. */
export interface AfterCursorFilter {
  $or?: [{ createdAt: { $lt: Date } }, { createdAt: Date; _id: { $lt: ObjectId } }];
}

/**
 * Filter clause selecting the records after `cursor` (an opaque string from `encodeCursor`).
 * No cursor means the first page. An invalid cursor is a 422 from `decodeCursor`.
 */
export function afterCursor(cursor: string | undefined): AfterCursorFilter {
  if (cursor === undefined) {
    return {};
  }
  return afterPosition(decodeCursor(cursor));
}

/** Same as `afterCursor` for an already decoded position, e.g. when merging two lists. */
export function afterPosition(position: CursorPosition): AfterCursorFilter {
  return {
    $or: [
      { createdAt: { $lt: position.createdAt } },
      { createdAt: position.createdAt, _id: { $lt: new Types.ObjectId(position.id) } },
    ],
  };
}

/**
 * Builds a page from records fetched in `NEWEST_FIRST` order with `.limit(limit + 1)`: the extra
 * record only tells whether another page exists.
 */
export function toKeysetPage<T extends { _id: ObjectId; createdAt: Date }>(
  records: readonly T[],
  limit: number,
): KeysetPage<T> {
  const items = records.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      records.length > limit && last
        ? encodeCursor({ createdAt: last.createdAt, id: last._id.toHexString() })
        : null,
  };
}
