import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizationUrl } from '@/lib/secondme';
import { randomBytes } from 'crypto';

const OAUTH_STATE_COOKIE = 'secondme_oauth_state';

export async function GET(request: NextRequest) {
  const state = randomBytes(16).toString('hex');
  const authUrl = getAuthorizationUrl(state, request.nextUrl.origin);
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

  return response;
}
