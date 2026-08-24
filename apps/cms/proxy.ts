import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const isLoginRoute = request.nextUrl.pathname === '/login';
  const hasSessionCookie = Boolean(
    request.cookies.get(
      process.env.AUTH_ACCESS_TOKEN_COOKIE_NAME ?? 'payload_access_token',
    ) ??
    request.cookies.get(
      process.env.AUTH_REFRESH_TOKEN_COOKIE_NAME ?? 'payload_refresh_token',
    ),
  );

  if (!isLoginRoute && !hasSessionCookie) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
