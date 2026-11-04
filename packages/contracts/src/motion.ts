import { z } from 'zod';

/*
 * Motion presets (ADR-032): a page style, how strongly it moves and its accents, and what a section
 * changes of them. Labels, timings and the rules that combine them live in `@plp/sections/schema`.
 */

export const motionStyleIds = ['none', 'subtle', 'smooth', 'lively', 'luxe', 'playful'] as const;
export const motionStyleSchema = z.enum(motionStyleIds);
export type MotionStyle = z.infer<typeof motionStyleSchema>;

/** How a section enters; `none` shows it at once. */
export const motionEnterIds = ['none', 'fade', 'up', 'side', 'zoom', 'pop', 'reveal'] as const;
export const motionEnterSchema = z.enum(motionEnterIds);
export type MotionEnter = z.infer<typeof motionEnterSchema>;

/** The order of the parts of a section: all at once, one after another, or row by row. */
export const motionOrderIds = ['together', 'stagger', 'rows'] as const;
export const motionOrderSchema = z.enum(motionOrderIds);
export type MotionOrder = z.infer<typeof motionOrderSchema>;

/** Accents that run only in sections with the matching content. */
export const motionAccentIds = ['lines', 'image', 'count', 'steps'] as const;
export const motionAccentSchema = z.enum(motionAccentIds);
export type MotionAccent = z.infer<typeof motionAccentSchema>;

export const motionLevelIds = ['low', 'mid', 'high'] as const;
export const motionLevelSchema = z.enum(motionLevelIds);
export type MotionLevel = z.infer<typeof motionLevelSchema>;

/** Accents switched away from what the style or the page says; an absent key follows it. */
export const motionAccentOverridesSchema = z.object({
  lines: z.boolean().optional(),
  image: z.boolean().optional(),
  count: z.boolean().optional(),
  steps: z.boolean().optional(),
});
export type MotionAccentOverrides = z.infer<typeof motionAccentOverridesSchema>;

export const pageMotionSchema = z.object({
  style: motionStyleSchema,
  level: motionLevelSchema,
  accents: motionAccentOverridesSchema,
  /** Phones (`< 768px`) only fade in, all at once; numbers still count up. */
  reduceOnMobile: z.boolean(),
});
export type PageMotion = z.infer<typeof pageMotionSchema>;

/** What one section changes of the page's motion; an absent key follows the page. */
export const sectionMotionSchema = z.object({
  enter: motionEnterSchema.optional(),
  order: motionOrderSchema.optional(),
  accents: motionAccentOverridesSchema.optional(),
});
export type SectionMotion = z.infer<typeof sectionMotionSchema>;

/** A page without `motion`, every page made before ADR-032 included, does not move. */
export const DEFAULT_PAGE_MOTION: PageMotion = {
  style: 'none',
  level: 'mid',
  accents: {},
  reduceOnMobile: false,
};
