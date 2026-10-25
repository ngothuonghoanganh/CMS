import { z } from 'zod';
import { idSchema } from './common.js';

/**
 * Building blocks for section content. Drafts may hold empty values while the user is editing;
 * whether a field must be filled is decided by publish checks, not by these schemas. Formats that
 * could be unsafe (URLs, phone numbers) are always enforced.
 */
export function textSchema(maxLength: number) {
  return z.string().max(maxLength, `Tối đa ${maxLength} ký tự`);
}

function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) {
    return false;
  }
  return URL.canParse(value);
}

export const phoneSchema = z
  .string()
  .trim()
  .max(20)
  .regex(/^[0-9+ ]*$/, 'Số điện thoại chỉ gồm chữ số, dấu + và khoảng trắng');

export const linkSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('section'), sectionId: z.string().max(40) }),
  z.object({ kind: z.literal('page'), pageId: idSchema }),
  z.object({
    kind: z.literal('url'),
    url: z
      .string()
      .trim()
      .max(2000)
      .refine(
        (value) => value === '' || isHttpUrl(value),
        'Đường dẫn phải bắt đầu bằng http:// hoặc https://',
      ),
  }),
  z.object({ kind: z.literal('phone'), phone: phoneSchema }),
  z.object({ kind: z.literal('zalo'), phone: phoneSchema }),
]);
export type Link = z.infer<typeof linkSchema>;
export type LinkKind = Link['kind'];

export const linkKindLabels: Record<LinkKind, string> = {
  none: 'Không liên kết',
  section: 'Một section trong trang',
  page: 'Một trang khác trong site',
  url: 'Đường dẫn bên ngoài',
  phone: 'Gọi điện thoại',
  zalo: 'Zalo',
};

export const ctaSchema = z.object({
  label: textSchema(40),
  link: linkSchema,
});
export type Cta = z.infer<typeof ctaSchema>;

export const imageRefSchema = z.object({
  assetId: idSchema.nullable(),
  alt: textSchema(250),
  decorative: z.boolean(),
});
export type ImageRef = z.infer<typeof imageRefSchema>;

export const EMPTY_IMAGE: ImageRef = { assetId: null, alt: '', decorative: false };
