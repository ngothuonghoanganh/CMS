import { colorSchemeIds, themePresetIds } from '@plp/contracts';
import { describe, expect, it } from 'vitest';
import { type ColorScheme, themePresets } from './themes.js';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [lighter = 0, darker = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

const TEXT_ROLES = ['heading', 'text', 'muted', 'link', 'danger'] as const;
const GROUNDS = ['background', 'surface'] as const;

const cases = themePresetIds.flatMap((presetId) =>
  colorSchemeIds.map(
    (schemeId) => [presetId, schemeId, themePresets[presetId].schemes[schemeId]] as const,
  ),
);

describe('theme presets', () => {
  it('define every preset and color scheme listed in the contracts', () => {
    expect(Object.keys(themePresets).sort()).toEqual([...themePresetIds].sort());
    for (const presetId of themePresetIds) {
      expect(Object.keys(themePresets[presetId].schemes).sort()).toEqual(
        [...colorSchemeIds].sort(),
      );
    }
  });

  it.each(cases)(
    '%s / %s meets WCAG AA for every text and button pair',
    (_preset, _scheme, scheme: ColorScheme) => {
      for (const role of TEXT_ROLES) {
        for (const ground of GROUNDS) {
          expect(
            contrast(scheme[role], scheme[ground]),
            `${role} on ${ground}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(
        contrast(scheme.accentText, scheme.accent),
        'button text on button',
      ).toBeGreaterThanOrEqual(4.5);
      for (const ground of GROUNDS) {
        expect(
          contrast(scheme.accent, scheme[ground]),
          `button against ${ground}`,
        ).toBeGreaterThanOrEqual(3);
      }
    },
  );
});
