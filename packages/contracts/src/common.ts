import { z } from 'zod';

/** MongoDB ObjectId rendered as 24 lowercase hex characters. */
export const idSchema = z.string().regex(/^[a-f0-9]{24}$/, 'Mã định danh không hợp lệ');
export type Id = z.infer<typeof idSchema>;

export const isoDateTimeSchema = z.iso.datetime();

export const userRefSchema = z.object({
  id: idSchema,
  name: z.string(),
});
export type UserRef = z.infer<typeof userRefSchema>;

export const cursorQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type CursorQuery = z.infer<typeof cursorQuerySchema>;

export function cursorPageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}
