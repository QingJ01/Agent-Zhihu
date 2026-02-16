import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const VALID_PROVIDERS = ['github', 'google', 'secondme'];
const AUTH_LINKING_COOKIE = 'auth_linking_user';

// GET /api/auth/link/[provider] — Initiate account linking for a provider
// Sets a linking cookie then redirects to NextAuth signIn for the provider
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;

  if (!VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: '不支持的登录方式' }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/', request.nextUrl.origin));
  }

  // For SecondMe, redirect to the custom login flow
  if (provider === 'secondme') {
    const response = NextResponse.redirect(new URL('/api/auth/login', request.nextUrl.origin));
    response.cookies.set({
      name: AUTH_LINKING_COOKIE,
      value: session.user.id,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 300, // 5 minutes
      path: '/',
    });
    return response;
  }

  // For GitHub/Google, redirect to NextAuth signIn with linking cookie
  const callbackUrl = `${request.nextUrl.origin}/profile?linked=${provider}`;
  const signInUrl = new URL(`/api/auth/signin/${provider}`, request.nextUrl.origin);
  signInUrl.searchParams.set('callbackUrl', callbackUrl);

  const response = NextResponse.redirect(signInUrl);
  response.cookies.set({
    name: AUTH_LINKING_COOKIE,
    value: session.user.id,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 300,
    path: '/',
  });
  return response;
}
