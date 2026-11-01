import type { PublicPreviewResponse, PublicPreviewStatusResponse } from '@plp/contracts';
import { isPlausiblePreviewToken } from './routing';

/** The preview behind a token; null when the token is invalid or expired. */
export type PreviewLookup = (token: string) => Promise<PublicPreviewResponse | null>;

/** What a token opens, without the page; null when the token is invalid or expired. */
export type PreviewStatusLookup = (token: string) => Promise<PublicPreviewStatusResponse | null>;

interface PreviewRequest {
  subdomain: string | null;
  token: string;
}

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
 * What `lookup` finds for a token on this host: only on the host of the site it belongs to
 * (ADR-010). Null for anything else (not a token, a host that is not a site, an invalid, expired
 * or foreign token), which every caller answers with the same 404. Throws when the API cannot
 * answer.
 */
async function onHost<T>(
  request: PreviewRequest,
  lookup: (token: string) => Promise<T | null>,
  subdomainOf: (found: T) => string,
): Promise<T | null> {
  if (request.subdomain === null || !isPlausiblePreviewToken(request.token)) {
    return null;
  }
  const found = await lookup(request.token);
  return found !== null && subdomainOf(found) === request.subdomain ? found : null;
}

/** The preview a token opens on this host, page and all: the page's one full load. */
export function previewForHost(
  request: PreviewRequest,
  lookup: PreviewLookup,
): Promise<PublicPreviewResponse | null> {
  return onHost(request, lookup, (preview) => preview.data.site.subdomain);
}

/** Whether a token opens a preview on this host, without loading it: the proxy's check. */
export function previewStatusForHost(
  request: PreviewRequest,
  lookup: PreviewStatusLookup,
): Promise<PublicPreviewStatusResponse | null> {
  return onHost(request, lookup, (status) => status.subdomain);
}
