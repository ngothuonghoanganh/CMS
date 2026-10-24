import { z } from 'zod';

/**
 * Identifiers only. The colors and fonts of each preset live in @plp/sections, which must define
 * every id listed here (enforced by its types and its WCAG AA test).
 */
export const themePresetIds = ['mint', 'indigo', 'sunset'] as const;
export const themePresetIdSchema = z.enum(themePresetIds);
export type ThemePresetId = z.infer<typeof themePresetIdSchema>;
export const DEFAULT_THEME_PRESET: ThemePresetId = 'mint';

export const colorSchemeIds = ['light', 'soft', 'brand', 'dark'] as const;
export const colorSchemeIdSchema = z.enum(colorSchemeIds);
export type ColorSchemeId = z.infer<typeof colorSchemeIdSchema>;

export const spacingPresets = ['compact', 'normal', 'spacious'] as const;
export const spacingPresetSchema = z.enum(spacingPresets);
export type SpacingPreset = z.infer<typeof spacingPresetSchema>;

export const spacingLabels: Record<SpacingPreset, string> = {
  compact: 'Gọn',
  normal: 'Vừa',
  spacious: 'Rộng',
};
