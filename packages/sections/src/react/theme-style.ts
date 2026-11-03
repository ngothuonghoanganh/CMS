import type { PageMotion } from '@plp/contracts';
import type { CSSProperties } from 'react';
import { MOTION_LEVELS, type ResolvedSectionMotion } from '../schema/motion.js';
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

/** How far and from what scale parts move at the page's level (ADR-032). */
export function motionLevelStyle(motion: PageMotion): CSSProperties {
  const level = MOTION_LEVELS[motion.level];
  return {
    '--plp-m-distance': `${level.distancePx}px`,
    '--plp-m-scale': level.scale,
    '--plp-m-pop': level.popScale,
  };
}

/** How long a section's parts take to enter, and how far apart they start. */
export function motionStyle(motion: ResolvedSectionMotion | null): CSSProperties {
  return motion
    ? { '--plp-m-dur': `${motion.durationMs}ms`, '--plp-m-step': `${motion.stepMs}ms` }
    : {};
}
