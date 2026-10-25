/**
 * Whether a POST to one of the renderer's routes came from another site. A browser names the
 * posting page's origin; `Origin: null` (an opaque origin) is not proof either way.
 */
export function isCrossSite(request: Request, host: string | null): boolean {
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return true;
  }
  const origin = request.headers.get('origin');
  if (origin === null || origin === 'null') {
    return false;
  }
  return !URL.canParse(origin) || new URL(origin).host !== host;
}
