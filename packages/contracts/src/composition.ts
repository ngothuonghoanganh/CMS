import { z } from 'zod';
import { colorSchemeIdSchema, spacingPresetSchema } from './themes.js';

export const sectionTypes = [
  'navbar',
  'hero',
  'benefits',
  'testimonials',
  'faq',
  'cta_band',
  'footer',
] as const;
export const sectionTypeSchema = z.enum(sectionTypes);
export type SectionType = z.infer<typeof sectionTypeSchema>;

export const sectionIdSchema = z.string().regex(/^[a-z0-9]{8,24}$/, 'Mã section không hợp lệ');

export const mobileOrderSchema = z.enum(['auto', 'media-first']);
export type MobileOrder = z.infer<typeof mobileOrderSchema>;

export const mobileOrderLabels: Record<MobileOrder, string> = {
  auto: 'Tự động (chữ trước, ảnh sau)',
  'media-first': 'Ảnh trước',
};

export const visibilitySchema = z.object({ desktop: z.boolean(), mobile: z.boolean() });
export type Visibility = z.infer<typeof visibilitySchema>;

/**
 * A section placed on a page. `content` is validated against the section's own schema by the
 * registry in @plp/sections; this schema only checks the frame shared by every section.
 */
export const sectionInstanceSchema = z.object({
  id: sectionIdSchema,
  type: sectionTypeSchema,
  variant: z.string().min(1).max(40),
  colorScheme: colorSchemeIdSchema,
  spacing: spacingPresetSchema,
  visibility: visibilitySchema,
  mobileOrder: mobileOrderSchema,
  content: z.record(z.string(), z.unknown()),
  /** Content paths that still hold sample text, e.g. "items.0.title". */
  samplePaths: z.array(z.string().max(200)).max(300),
});
export type SectionInstance = z.infer<typeof sectionInstanceSchema>;

export const MAX_SECTIONS = 30;

export const compositionSchema = z
  .object({
    version: z.literal(1),
    sections: z
      .array(sectionInstanceSchema)
      .max(MAX_SECTIONS, `Một trang có tối đa ${MAX_SECTIONS} section`),
  })
  .superRefine((composition, ctx) => {
    const seen = new Set<string>();
    composition.sections.forEach((section, index) => {
      if (seen.has(section.id)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Mã section bị trùng',
          path: ['sections', index, 'id'],
        });
      }
      seen.add(section.id);
    });
  });
export type Composition = z.infer<typeof compositionSchema>;

export const EMPTY_COMPOSITION: Composition = { version: 1, sections: [] };
