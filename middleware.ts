import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/src/lib/firebase/constants';

const EXACT_PUBLIC_PATHS = ['/'];
const PREFIX_PUBLIC_PATHS = ['/login', '/api/auth/', '/api/webhook/', '/app'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic =
    EXACT_PUBLIC_PATHS.includes(pathname) ||
    PREFIX_PUBLIC_PATHS.some(p => pathname.startsWith(p));

  const hasSession = Boolean(
    request.cookies.get(SESSION_COOKIE)?.value ||
    request.headers.get('authorization')?.startsWith('Bearer ')
  );

  if (!hasSession && !isPublic) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and static assets
    '/((?!_next/static|_next/image|favicon.ico|icon\\.png).*)',
  ],
};
