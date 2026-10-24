import type { Site } from '@plp/contracts';
import { themePresets } from '@plp/sections/schema';
import type { CSSProperties } from 'react';

/** Letter of a site's tile in the switcher: the first letter of its subdomain ("smilecare" → "S"). */
export function siteInitial(site: Pick<Site, 'subdomain' | 'name'>): string {
  const source = site.subdomain || site.name;
  return (Array.from(source.trim())[0] ?? '?').toLocaleUpperCase('vi');
}

/** Tile colors from the site's own theme, so each client site is recognisable in the switcher. */
export function siteTileStyle(site: Pick<Site, 'themePresetId'>): CSSProperties {
  const { schemes } = themePresets[site.themePresetId];
  return { background: schemes.soft.background, color: schemes.soft.accent };
}
