import { slugSchema } from '@plp/contracts';

/**
 * The page slug a URL addresses: "" for "/", the segment for "/uu-dai". Null for anything no page
 * can live at (deeper paths, invalid or reserved slugs), so those answer 404 without an API call.
 */
export function slugFromSegments(segments: readonly string[] | undefined): string | null {
  if (segments === undefined || segments.length === 0) {
    return '';
  }
  const [segment] = segments;
  if (segments.length > 1 || segment === undefined || segment === '') {
    return null;
  }
  const parsed = slugSchema.safeParse(segment);
  return parsed.success && parsed.data === segment ? segment : null;
}

/** A redirect target from the API must stay on the same site: an absolute path, never "//host". */
export function sameSiteLocation(location: string): string {
  if (!/^\/(?![/\\])/.test(location)) {
    throw new Error('Public API returned a redirect that leaves the site');
  }
  return location;
}

/**
 * The query of a page request as `?a=1&b=2` (or nothing), to carry over a redirect: an ad's utm
 * tags and click ids must still reach the page the old address now points to (ADR-016, ADR-019).
 */
export function queryOf(searchParams: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(searchParams)) {
    for (const item of value === undefined ? [] : [value].flat()) {
      query.append(name, item);
    }
  }
  const text = query.toString();
  return text === '' ? '' : `?${text}`;
}

/** Signed preview tokens are compact JWS strings; anything else is rejected without an API call. */
export function isPlausiblePreviewToken(token: string): boolean {
  return token.length <= 4096 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}
