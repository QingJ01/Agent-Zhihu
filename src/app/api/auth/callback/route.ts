import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, getUserProfile } from '@/lib/secondme';

const OAUTH_STATE_COOKIE = 'secondme_oauth_state';
const OAUTH_ORIGIN_COOKIE = 'secondme_oauth_origin';
const OAUTH_REDIRECT_URI_COOKIE = 'secondme_oauth_redirect_uri';
const AUTH_PAYLOAD_COOKIE = 'secondme_auth_payload';

function normalizeBaseUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const storedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const loginOrigin = normalizeBaseUrl(request.cookies.get(OAUTH_ORIGIN_COOKIE)?.value);
  const redirectUri = request.cookies.get(OAUTH_REDIRECT_URI_COOKIE)?.value;

  const baseUrl = loginOrigin || request.nextUrl.origin;

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
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const profile = await getUserProfile(tokens.access_token);

    const payload = Buffer.from(JSON.stringify({
      profile,
      accessToken: tokens.access_token,
      issuedAt: Date.now(),
    })).toString('base64url');

    const callbackUrl = new URL('/auth/callback/secondme', baseUrl);

    const response = NextResponse.redirect(callbackUrl);
    response.cookies.delete(OAUTH_STATE_COOKIE);
    response.cookies.delete(OAUTH_ORIGIN_COOKIE);
    response.cookies.delete(OAUTH_REDIRECT_URI_COOKIE);
    response.cookies.set({
      name: AUTH_PAYLOAD_COOKIE,
      value: payload,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 2,
      path: '/',
    });
    return response;
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(new URL('/?error=auth_failed', baseUrl));
  }
}
