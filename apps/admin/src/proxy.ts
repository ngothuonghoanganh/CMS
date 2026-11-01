import { INVITATION_PATH, SESSION_COOKIE } from '@plp/contracts';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Pages without a session: sign-in, confirming a lead address from its email (ADR-018), and the
 * invitation page, where a new member signs up (ADR-021).
 */
const PUBLIC_PATHS = ['/login', '/signup', '/lead-recipients/confirm', INVITATION_PATH];

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
