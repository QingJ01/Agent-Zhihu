import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

const OAUTH_BIND_TARGET_COOKIE = 'oauth_bind_target_user_id';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/?error=need_login', request.nextUrl.origin));
  }

  const provider = request.nextUrl.searchParams.get('provider');
  if (!provider || !['secondme', 'github', 'google'].includes(provider)) {
    return NextResponse.redirect(new URL('/profile?bind=failed&reason=bad_provider', request.nextUrl.origin));
  }

  const loginPath = provider === 'secondme'
    ? '/api/auth/login?flow=bind'
    : `/api/auth/login/${provider}?flow=bind`;

  const response = NextResponse.redirect(new URL(loginPath, request.nextUrl.origin));
  response.cookies.set({
    name: OAUTH_BIND_TARGET_COOKIE,
    value: session.user.id,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10,
    path: '/',
  });

  return response;
}
