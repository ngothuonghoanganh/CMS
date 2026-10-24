import { z } from 'zod';
import { phoneSchema } from './content.js';

export const pageGoalIds = ['lead', 'promo', 'event', 'product', 'waitlist', 'about'] as const;
export const pageGoalSchema = z.enum(pageGoalIds);
export type PageGoal = z.infer<typeof pageGoalSchema>;

/**
 * How section color schemes alternate on a generated page. The site theme itself is site-wide and
 * owner-only (ADR-004), so page creation picks a rhythm within the theme instead.
 */
export const pageStyleIds = ['calm', 'bold', 'minimal'] as const;
export const pageStyleSchema = z.enum(pageStyleIds);
export type PageStyle = z.infer<typeof pageStyleSchema>;

export const briefSchema = z.object({
  offer: z.string().trim().max(120, 'Tối đa 120 ký tự').default(''),
  audience: z.string().trim().max(120, 'Tối đa 120 ký tự').default(''),
  phone: phoneSchema.default(''),
});
export type Brief = z.infer<typeof briefSchema>;
