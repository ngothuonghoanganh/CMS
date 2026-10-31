import type { PublicPreviewResponse } from '@plp/contracts';
import { isPlausiblePreviewToken } from './routing';

/** The preview behind a token; null when the token is invalid or expired. */
export type PreviewLookup = (token: string) => Promise<PublicPreviewResponse | null>;

const PREVIEW_PATH = /^\/_preview\/([^/]+)$/;

/** The token of a preview URL (`/_preview/{token}`), or null for any other path. */
export function previewTokenOf(pathname: string): string | null {
  const encoded = PREVIEW_PATH.exec(pathname)?.[1];
  if (encoded === undefined) {
    return null;
  }
  try {
    return decodeURIComponent(encoded);
  } catch {
    // A malformed escape sequence is not a token; the caller answers it like an invalid one.
    return '';
  }
}

/**
 * The preview a token opens on this host: only on the host of the site it belongs to (ADR-010).
 * Null for anything else (not a token, a host that is not a site, an invalid, expired or foreign
 * token), which every caller answers with the same 404. Throws when the API cannot answer.
 */
export async function previewForHost(
  request: { subdomain: string | null; token: string },
  lookup: PreviewLookup,
): Promise<PublicPreviewResponse | null> {
  if (request.subdomain === null || !isPlausiblePreviewToken(request.token)) {
    return null;
  }
  const preview = await lookup(request.token);
  return preview !== null && preview.data.site.subdomain === request.subdomain ? preview : null;
}
