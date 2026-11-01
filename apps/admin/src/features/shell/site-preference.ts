import { idSchema, type Site } from '@plp/contracts';

/**
 * Cookie remembering the site the user last opened, so a workspace screen (Vai trò & quyền) keeps
 * that site in the sidebar. A UI preference only: the API checks access on every request.
 */
export const SITE_PREFERENCE_COOKIE = 'plp_site';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** The preferred site when the user may still open it, otherwise the first one. */
export function pickSite(
  sites: readonly Site[],
  preferredSiteId: string | null | undefined,
): Site | null {
  return sites.find((site) => site.id === preferredSiteId) ?? sites[0] ?? null;
}

/** `document.cookie` value that stores the preference for a year on the whole admin. */
export function sitePreferenceCookie(siteId: string): string {
  const id = idSchema.parse(siteId);
  return `${SITE_PREFERENCE_COOKIE}=${id}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}
