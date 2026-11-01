import {
  FORGOT_PASSWORD_PATH,
  INVITATION_PATH,
  RESET_PASSWORD_PATH,
  SESSION_COOKIE,
  SIGNUP_VERIFY_PATH,
} from '@plp/contracts';
import { type NextRequest, NextResponse } from 'next/server';
import { REQUEST_PATH_HEADER } from './features/shell/request-path';

/**
 * Pages without a session: sign-in and sign-up with its confirmation link, a forgotten password
 * and its reset link (ADR-026), confirming a lead address from its email (ADR-018), and the
 * invitation page, where a new member signs up (ADR-021).
 */
const PUBLIC_PATHS = [
  '/login',
  '/signup',
  SIGNUP_VERIFY_PATH,
  FORGOT_PASSWORD_PATH,
  RESET_PASSWORD_PATH,
  '/lead-recipients/confirm',
  INVITATION_PATH,
];

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
  // The page learns its own path, to open it at a workspace's address instead (ADR-025). Set
  // here on every page request, so a value the browser sent never gets through.
  const forwarded = new Headers(request.headers);
  forwarded.set(REQUEST_PATH_HEADER, `${pathname}${search}`);
  return NextResponse.next({ request: { headers: forwarded } });
}

export const config = {
  // The /api proxy, health check and static files are not pages.
  matcher: ['/((?!api/|healthz|_next/|favicon.ico).*)'],
};
