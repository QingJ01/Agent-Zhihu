import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, getUserProfile } from '@/lib/secondme';

const OAUTH_STATE_COOKIE = 'secondme_oauth_state';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const storedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;

  // Get the correct base URL from environment variable or request headers
  const baseUrl = process.env.NEXTAUTH_URL ||
    `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('x-forwarded-host') || request.headers.get('host')}`;

  if (error) {
    console.error('OAuth error:', error);
    return NextResponse.redirect(new URL('/?error=oauth_error', baseUrl));
  }

  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL('/?error=invalid_state', baseUrl));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', baseUrl));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const profile = await getUserProfile(tokens.access_token);

    const callbackUrl = new URL('/auth/callback/secondme', baseUrl);
    callbackUrl.searchParams.set('profile', JSON.stringify(profile));
    callbackUrl.searchParams.set('accessToken', tokens.access_token);

    const response = NextResponse.redirect(callbackUrl);
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(new URL('/?error=auth_failed', baseUrl));
  }
}
