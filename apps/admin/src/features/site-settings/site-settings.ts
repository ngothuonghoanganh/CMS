import type { Asset, Site, ThemePresetId, UpdateSiteRequest } from '@plp/contracts';

/** The values of the site settings form. */
export interface SiteSettingsValues {
  name: string;
  themePresetId: ThemePresetId;
  logo: Asset | null;
  shareImage: Asset | null;
}

export function settingsValuesOf(site: Site, assets: readonly Asset[]): SiteSettingsValues {
  const find = (id: string | null) =>
    id === null ? null : (assets.find((asset) => asset.id === id) ?? null);
  return {
    name: site.name,
    themePresetId: site.themePresetId,
    logo: find(site.logoAssetId),
    shareImage: find(site.defaultShareImageAssetId),
  };
}

/**
 * Only the settings that differ from the saved site, so `updateSite` never rewrites the others.
 * An asset that could not be loaded counts as unchanged until the user picks or removes one.
 */
export function settingsChanges(
  site: Site,
  values: SiteSettingsValues,
  touched: { logo: boolean; shareImage: boolean },
): UpdateSiteRequest {
  const patch: UpdateSiteRequest = {};
  const name = values.name.trim();
  if (name !== site.name) {
    patch.name = name;
  }
  if (values.themePresetId !== site.themePresetId) {
    patch.themePresetId = values.themePresetId;
  }
  const logoId = values.logo?.id ?? null;
  if (touched.logo && logoId !== site.logoAssetId) {
    patch.logoAssetId = logoId;
  }
  const shareId = values.shareImage?.id ?? null;
  if (touched.shareImage && shareId !== site.defaultShareImageAssetId) {
    patch.defaultShareImageAssetId = shareId;
  }
  return patch;
}

export function hasChanges(patch: UpdateSiteRequest): boolean {
  return Object.keys(patch).length > 0;
}
