import { z } from 'zod';

export const seoFieldSchema = z.enum(['title', 'description', 'shareImage', 'noindex']);
export type SeoField = z.infer<typeof seoFieldSchema>;

/** Where the user goes to fix an item: the editor opens the section and focuses the field. */
export const checkTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('section'), sectionId: z.string(), fieldPath: z.string().nullable() }),
  z.object({ kind: z.literal('seo'), field: seoFieldSchema }),
  z.object({ kind: z.literal('slug') }),
  z.object({ kind: z.literal('page') }),
  /** The site's personal data and consent settings a form needs (ADR-017). */
  z.object({ kind: z.literal('privacy'), sectionId: z.string() }),
  /** The confirmed email addresses a form's leads go to (ADR-018). */
  z.object({ kind: z.literal('lead_recipients'), sectionId: z.string() }),
]);
export type CheckTarget = z.infer<typeof checkTargetSchema>;

export const blockingCheckCodes = [
  'composition_invalid',
  'required_field_empty',
  'asset_missing',
  'slug_invalid',
  'slug_taken',
  'section_link_broken',
  'no_visible_section_desktop',
  'no_visible_section_mobile',
  'consent_not_configured',
  'lead_destination_missing',
] as const;

export const warningCheckCodes = [
  'image_alt_missing',
  'sample_content',
  'seo_title_missing',
  'seo_title_too_long',
  'seo_description_missing',
  'seo_description_too_long',
  'page_link_not_live',
  'section_hidden_everywhere',
] as const;

export const passedCheckCodes = [
  'seo_title',
  'seo_description',
  'slug_valid',
  'contrast_aa',
  'internal_links',
  'mobile_visible',
  'images_described',
  'no_sample_content',
  'privacy_policy',
  'lead_destination',
] as const;

export const checkItemSchema = z.object({
  code: z.enum([...blockingCheckCodes, ...warningCheckCodes]),
  severity: z.enum(['blocking', 'warning']),
  /** Stable id of this finding, used to acknowledge a warning: `${code}:${target}`. */
  fingerprint: z.string(),
  title: z.string(),
  description: z.string(),
  target: checkTargetSchema,
});
export type CheckItem = z.infer<typeof checkItemSchema>;

export const passedCheckSchema = z.object({
  code: z.enum(passedCheckCodes),
  title: z.string(),
});
export type PassedCheck = z.infer<typeof passedCheckSchema>;

export const checksResultSchema = z.object({
  /** Draft revision the checks were computed for. */
  revision: z.number().int().nonnegative(),
  blocking: z.array(checkItemSchema),
  warnings: z.array(checkItemSchema),
  passed: z.array(passedCheckSchema),
});
export type ChecksResult = z.infer<typeof checksResultSchema>;

export const checkCountsSchema = z.object({
  blocking: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
});
export type CheckCounts = z.infer<typeof checkCountsSchema>;
