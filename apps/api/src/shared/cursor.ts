import { AppError } from './errors.js';

/** Opaque keyset cursor for lists sorted by (createdAt desc, _id desc). */
export interface CursorPosition {
  createdAt: Date;
  id: string;
}

export function encodeCursor(position: CursorPosition): string {
  return Buffer.from(
    JSON.stringify({ t: position.createdAt.toISOString(), i: position.id }),
  ).toString('base64url');
}

export function decodeCursor(cursor: string): CursorPosition {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      't' in parsed &&
      'i' in parsed &&
      typeof parsed.t === 'string' &&
      typeof parsed.i === 'string' &&
      /^[a-f0-9]{24}$/.test(parsed.i) &&
      !Number.isNaN(Date.parse(parsed.t))
    ) {
      return { createdAt: new Date(parsed.t), id: parsed.i };
    }
  } catch (error) {
    throw new AppError(422, 'validation_failed', 'Con trỏ phân trang không hợp lệ', {
      cause: error,
    });
  }
  throw new AppError(422, 'validation_failed', 'Con trỏ phân trang không hợp lệ');
}
