// Next.js middleware — gates protected routes.
//
// The middleware is a fast first-line gate: it checks for the presence
// of the `cs_refresh` cookie, which the backend sets on register/login.
// Actual JWT verification happens on the server during page render via
// `/auth/refresh`. This means a stale cookie lets the user past the
// middleware, but the AuthProvider on the client will see the refresh
// fail and bounce them back to /login — so cookie presence is a UX
// speedup, not a security boundary.

import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/dashboard', '/cases'];
const AUTH_PAGES = ['/login', '/register'];
const REFRESH_COOKIE = 'cs_refresh';

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const hasRefreshCookie = req.cookies.has(REFRESH_COOKIE);

  if (PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (!hasRefreshCookie) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  if (AUTH_PAGES.includes(pathname) && hasRefreshCookie) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/cases/:path*', '/login', '/register'],
};
