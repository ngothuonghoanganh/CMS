import { idSchema } from '@plp/contracts';

/**
 * Request header through which the proxy hands the page the id of the release live at the path
 * (ADR-009). It is internal: the proxy removes any value a client sends.
 */
export const LIVE_RELEASE_HEADER = 'x-plp-live-release';

/** The live release id the proxy found; '' when it could not tell (the cache key is then tag-only). */
export function liveReleaseFrom(headers: Pick<Headers, 'get'>): string {
  const value = headers.get(LIVE_RELEASE_HEADER);
  return value !== null && idSchema.safeParse(value).success ? value : '';
}
