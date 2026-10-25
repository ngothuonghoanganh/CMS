const AUTH_PATHS = new Set(['/login', '/signup']);
const PLACEHOLDER_ORIGIN = 'http://admin.invalid';

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Where to go after signing in. Only a same-origin path is accepted ("/sites/abc?status=live");
 * absolute URLs, protocol-relative "//host" paths, backslashes and control characters fall back to
 * "/", so a crafted `?next=` link cannot send the user to another site. The sign-in pages
 * themselves also fall back to "/" to avoid a loop.
 */
export function safeNextPath(value: string | readonly string[] | null | undefined): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }
  // Browsers treat "\" like "/", so "/\evil.example" would leave the origin.
  if (
    value.includes('\\') ||
    hasControlCharacter(value) ||
    !URL.canParse(value, PLACEHOLDER_ORIGIN)
  ) {
    return '/';
  }
  const url = new URL(value, PLACEHOLDER_ORIGIN);
  // Removing dot segments can leave an empty first segment ("/.//evil.example" becomes
  // "//evil.example"), which the router would resolve as another host, so the normalised
  // result is checked again.
  if (
    url.origin !== PLACEHOLDER_ORIGIN ||
    url.pathname.startsWith('//') ||
    AUTH_PATHS.has(url.pathname)
  ) {
    return '/';
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** "/login" or "/login?next=…", keeping where the user wanted to go. */
export function authPageHref(page: '/login' | '/signup', next: string): string {
  return next === '/' ? page : `${page}?next=${encodeURIComponent(next)}`;
}
