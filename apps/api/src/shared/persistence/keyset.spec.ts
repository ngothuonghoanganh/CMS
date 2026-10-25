import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../cursor.js';
import { AppError } from '../errors.js';
import { afterCursor, toKeysetPage } from './keyset.js';

function record(seconds: number): { _id: Types.ObjectId; createdAt: Date } {
  return { _id: new Types.ObjectId(), createdAt: new Date(seconds * 1000) };
}

describe('afterCursor', () => {
  it('selects everything when there is no cursor', () => {
    expect(afterCursor(undefined)).toEqual({});
  });

  it('selects records older than the cursor, breaking ties on the id', () => {
    const id = new Types.ObjectId();
    const createdAt = new Date('2026-10-24T10:00:00.000Z');
    const filter = afterCursor(encodeCursor({ createdAt, id: id.toHexString() }));
    expect(filter).toEqual({
      $or: [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: id } }],
    });
  });

  it('rejects a cursor that was not issued by the API', () => {
    expect(() => afterCursor('not-a-cursor')).toThrow(AppError);
  });
});

describe('toKeysetPage', () => {
  it('returns no cursor when every record fits', () => {
    const records = [record(3), record(2)];
    expect(toKeysetPage(records, 2)).toEqual({ items: records, nextCursor: null });
  });

  it('drops the look-ahead record and points the cursor at the last item', () => {
    const records = [record(3), record(2), record(1)];
    const page = toKeysetPage(records, 2);
    expect(page.items).toEqual(records.slice(0, 2));
    expect(page.nextCursor).not.toBeNull();
    const last = records[1];
    expect(decodeCursor(page.nextCursor ?? '')).toEqual({
      createdAt: last?.createdAt,
      id: last?._id.toHexString(),
    });
  });
});
