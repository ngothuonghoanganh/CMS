import { colorSchemeIds, type ThemePresetId } from '@plp/contracts';
import { themePresets } from '@plp/sections/schema';
import styles from './theme.module.css';

/** Three overlapping dots: brand background, soft background and accent (decorative). */
export function ThemeSwatches({ themePresetId }: { themePresetId: ThemePresetId }) {
  const { schemes } = themePresets[themePresetId];
  const colors = [schemes.brand.background, schemes.soft.background, schemes.brand.accent];
  return (
    <span className={styles.dots} aria-hidden="true">
      {colors.map((color, index) => (
        <span key={index} className={styles.dot} style={{ background: color }} />
      ))}
    </span>
  );
}

/** The four color schemes of a preset as "Aa" tiles with the accent dot. */
export function SchemeStrip({ themePresetId }: { themePresetId: ThemePresetId }) {
  const { schemes } = themePresets[themePresetId];
  return (
    <span className={styles.strip} aria-hidden="true">
      {colorSchemeIds.map((id) => {
        const scheme = schemes[id];
        return (
          <span
            key={id}
            className={styles.stripTile}
            style={{
              background: scheme.background,
              color: scheme.heading,
              borderColor: scheme.border,
            }}
          >
            Aa
            <span className={styles.stripAccent} style={{ background: scheme.accent }} />
          </span>
        );
      })}
    </span>
  );
}
