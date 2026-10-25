import { z } from 'zod';
import { cursorQuerySchema, idSchema, isoDateTimeSchema, userRefSchema } from './common.js';

export const assetMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
] as const;
export const assetMimeTypeSchema = z.enum(assetMimeTypes);
export type AssetMimeType = z.infer<typeof assetMimeTypeSchema>;

export const MAX_ASSET_BYTES = 10 * 1024 * 1024;

export const altTextSchema = z.string().trim().max(250, 'Mô tả ảnh tối đa 250 ký tự');

/** An image needs a description unless it is marked as decorative. */
function describedOrDecorative(value: { alt: string; decorative: boolean }): boolean {
  return value.decorative || value.alt.length > 0;
}
const altRequiredMessage = {
  message: 'Nhập mô tả ảnh hoặc đánh dấu "Ảnh chỉ để trang trí"',
  path: ['alt'],
};

export const assetSchema = z.object({
  id: idSchema,
  siteId: idSchema,
  url: z.url(),
  mimeType: assetMimeTypeSchema,
  bytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Default description, copied into an image field when the asset is picked. */
  alt: z.string().nullable(),
  decorative: z.boolean(),
  uploadedBy: userRefSchema,
  createdAt: isoDateTimeSchema,
});
export type Asset = z.infer<typeof assetSchema>;

export const assetListResponseSchema = z.object({
  items: z.array(assetSchema),
  nextCursor: z.string().nullable(),
});
export type AssetListResponse = z.infer<typeof assetListResponseSchema>;

/** Most asset ids one `ids` lookup accepts. */
export const MAX_ASSET_IDS_PER_LOOKUP = 50;

/**
 * Asset library query. Without `ids` it pages the library newest first. With `ids`
 * (comma-separated, at most 50 valid asset ids) it returns only those assets of the site, in the
 * requested order without duplicates, ignores `cursor`/`limit` and answers `nextCursor: null`.
 * Ids of another site or workspace are simply absent from the result.
 */
export const assetListQuerySchema = cursorQuerySchema.extend({
  ids: z
    .string()
    .transform((value) => value.split(','))
    // Splitting always yields at least one item; an empty value fails as an invalid id.
    .pipe(
      z
        .array(idSchema)
        .max(MAX_ASSET_IDS_PER_LOOKUP, `Tra cứu tối đa ${MAX_ASSET_IDS_PER_LOOKUP} ảnh mỗi lần`),
    )
    .optional(),
});
export type AssetListQuery = z.infer<typeof assetListQuerySchema>;

/** Text fields of the multipart upload (`file` is the binary part). */
export const uploadAssetFieldsSchema = z
  .object({
    alt: altTextSchema.default(''),
    decorative: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .refine(describedOrDecorative, altRequiredMessage);

export const updateAssetRequestSchema = z
  .object({ alt: altTextSchema, decorative: z.boolean() })
  .refine(describedOrDecorative, altRequiredMessage);
export type UpdateAssetRequest = z.infer<typeof updateAssetRequestSchema>;
