import type { CSSProperties } from 'react';
import type { ColorScheme, ThemePreset } from '../schema/themes.js';

export function schemeStyle(scheme: ColorScheme): CSSProperties {
  return {
    '--plp-bg': scheme.background,
    '--plp-surface': scheme.surface,
    '--plp-heading': scheme.heading,
    '--plp-text': scheme.text,
    '--plp-muted': scheme.muted,
    '--plp-accent': scheme.accent,
    '--plp-accent-text': scheme.accentText,
    '--plp-link': scheme.link,
    '--plp-border': scheme.border,
    '--plp-danger': scheme.danger,
  };
}

export function fontStyle(theme: ThemePreset): CSSProperties {
  return {
    '--plp-font-heading': theme.fonts.heading,
    '--plp-font-body': theme.fonts.body,
  };
}
