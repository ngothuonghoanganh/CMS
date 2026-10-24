import { colorSchemeIds } from '@plp/contracts';
import type { ThemePreset } from '@plp/sections/schema';
import styles from './ThemeSwatches.module.css';

/**
 * The four color schemes of a site theme (Sáng, Nhạt, Thương hiệu, Tối) as small tiles with a
 * heading sample and the accent color. Decorative: the theme's name and description label it.
 */
export function ThemeSwatches({ preset }: { preset: ThemePreset }) {
  return (
    <span className={styles.swatches} aria-hidden="true">
      {colorSchemeIds.map((schemeId) => {
        const scheme = preset.schemes[schemeId];
        return (
          <span
            key={schemeId}
            className={styles.swatch}
            style={{
              background: scheme.background,
              borderColor: scheme.border,
              color: scheme.heading,
              fontFamily: preset.fonts.heading,
            }}
          >
            Aa
            <span className={styles.accent} style={{ background: scheme.accent }} />
          </span>
        );
      })}
    </span>
  );
}
