import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { buildGitHubAuthUrl } from '@/lib/oauth';
import { resolveAuthOrigin } from '@/lib/auth-origin';

const OAUTH_STATE_COOKIE = 'github_oauth_state';
const OAUTH_ORIGIN_COOKIE = 'github_oauth_origin';
const OAUTH_REDIRECT_URI_COOKIE = 'github_oauth_redirect_uri';
const OAUTH_FLOW_COOKIE = 'oauth_login_flow';

export async function GET(request: NextRequest) {
  const state = randomBytes(16).toString('hex');
  const appOrigin = resolveAuthOrigin(request);
  const redirectUri = `${appOrigin}/api/auth/callback/github`;
  const flow = request.nextUrl.searchParams.get('flow') === 'bind' ? 'bind' : 'login';
  const authUrl = buildGitHubAuthUrl(state, redirectUri);
  const response = NextResponse.redirect(authUrl);

  response.cookies.set({ name: OAUTH_STATE_COOKIE, value: state, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 10, path: '/' });
  response.cookies.set({ name: OAUTH_ORIGIN_COOKIE, value: appOrigin, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 10, path: '/' });
  response.cookies.set({ name: OAUTH_REDIRECT_URI_COOKIE, value: redirectUri, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 10, path: '/' });
  response.cookies.set({ name: OAUTH_FLOW_COOKIE, value: flow, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 10, path: '/' });

  return response;
}
