import { describe, expect, it } from 'vitest';
import { decodeCursor } from '../../shared/cursor.js';
import { toKeysetPage } from '../../shared/persistence/keyset.js';
import { newObjectId } from '../../shared/persistence/object-id.js';
import { mergeKeysetPages, newestFirst } from './history-merge.js';

function row(seconds: number, label: string) {
  return { _id: newObjectId(), createdAt: new Date(seconds * 1000), label };
}

describe('mergeKeysetPages', () => {
  it('interleaves two lists newest first and cuts at the limit', () => {
    const releases = [row(9, 'v3'), row(5, 'v2'), row(1, 'v1')];
    const events = [row(7, 'rollback'), row(3, 'unpublish')];
    const merged = mergeKeysetPages(
      [toKeysetPage(releases.slice(0, 3), 3), toKeysetPage(events, 3)],
      3,
    );
    expect(merged.items.map((item) => item.label)).toEqual(['v3', 'rollback', 'v2']);
    const last = merged.items.at(-1);
    expect(decodeCursor(merged.nextCursor ?? '')).toEqual({
      createdAt: last?.createdAt,
      id: last?._id.toHexString(),
    });
  });

  it('has no cursor when every item of every list fits', () => {
    const merged = mergeKeysetPages(
      [toKeysetPage([row(2, 'a')], 5), toKeysetPage([row(1, 'b')], 5)],
      5,
    );
    expect(merged.items.map((item) => item.label)).toEqual(['a', 'b']);
    expect(merged.nextCursor).toBeNull();
  });

  it('keeps a cursor when one list has more even if the merged page is short', () => {
    const merged = mergeKeysetPages(
      [toKeysetPage([row(4, 'a'), row(3, 'b'), row(2, 'c')], 2), toKeysetPage([], 2)],
      2,
    );
    expect(merged.items.map((item) => item.label)).toEqual(['a', 'b']);
    expect(merged.nextCursor).not.toBeNull();
  });

  it('breaks time ties with the larger id first', () => {
    const older = row(1, 'first');
    const newer = { ...row(1, 'second'), createdAt: older.createdAt };
    expect([older, newer].sort(newestFirst).map((item) => item.label)).toEqual(['second', 'first']);
  });
});
