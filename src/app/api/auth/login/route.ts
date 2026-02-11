import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizationUrl } from '@/lib/secondme';
import { randomBytes } from 'crypto';

const OAUTH_STATE_COOKIE = 'secondme_oauth_state';
const OAUTH_ORIGIN_COOKIE = 'secondme_oauth_origin';
const OAUTH_REDIRECT_URI_COOKIE = 'secondme_oauth_redirect_uri';

export async function GET(request: NextRequest) {
  const state = randomBytes(16).toString('hex');
  const appOrigin = request.nextUrl.origin;
  const redirectUri = `${appOrigin}/api/auth/callback`;
  const authUrl = getAuthorizationUrl(state, redirectUri);
  const response = NextResponse.redirect(authUrl);

  response.cookies.set({
    name: OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10,
    path: '/',
  });

  response.cookies.set({
    name: OAUTH_ORIGIN_COOKIE,
    value: appOrigin,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10,
    path: '/',
  });

  response.cookies.set({
    name: OAUTH_REDIRECT_URI_COOKIE,
    value: redirectUri,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10,
    path: '/',
  });

  return response;
}
