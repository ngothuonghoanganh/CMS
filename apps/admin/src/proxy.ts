import { SESSION_COOKIE } from '@plp/contracts';
import { type NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/signup'];

/**
 * Optimistic check only: without a session cookie the visitor is sent to the login page. Every
 * page still verifies the session with the API (`requireMe`).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  if (!hasSession && !PUBLIC_PATHS.includes(pathname)) {
    const url = new URL('/login', request.url);
    if (pathname !== '/') {
      url.searchParams.set('next', `${pathname}${search}`);
    }
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // The /api proxy, health check and static files are not pages.
  matcher: ['/((?!api/|healthz|_next/|favicon.ico).*)'],
};
