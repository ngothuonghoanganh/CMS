import type { ChangeItem, ThemePresetId } from '@plp/contracts';

/**
 * What a live page shows of its site's settings (ADR-015). Each release freezes it at publish
 * time, so changing the site settings never changes a live page until that page is published
 * again (business rule 1). Asset ids are strings, like the ones in a release's SEO.
 */
export interface SitePresentation {
  name: string;
  themePresetId: ThemePresetId;
  logoAssetId: string | null;
  defaultShareImageAssetId: string | null;
}

/** Chip labels, in the order the publish dialog and the history list them. */
const SITE_LABELS: { field: keyof SitePresentation; label: string }[] = [
  { field: 'themePresetId', label: 'Giao diện site: giao diện' },
  { field: 'logoAssetId', label: 'Giao diện site: logo' },
  { field: 'name', label: 'Giao diện site: tên site' },
  { field: 'defaultShareImageAssetId', label: 'Giao diện site: ảnh chia sẻ' },
];

/**
 * The site settings that differ from `base` to `next`, as chips ("Giao diện site: logo"). Used for
 * a live page's `siteChanges` (live snapshot → current site) and in a release's `changeSummary`
 * (previously live snapshot → the new release's snapshot).
 */
export function diffSitePresentation(base: SitePresentation, next: SitePresentation): ChangeItem[] {
  return SITE_LABELS.filter(({ field }) => base[field] !== next[field]).map(({ label }) => ({
    kind: 'site',
    label,
    sectionId: null,
  }));
}
