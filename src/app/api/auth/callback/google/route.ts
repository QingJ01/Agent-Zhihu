import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import AuthIdentity from '@/models/AuthIdentity';
import { exchangeGoogleCode, getGoogleProfile } from '@/lib/oauth';

const OAUTH_STATE_COOKIE = 'google_oauth_state';
const OAUTH_ORIGIN_COOKIE = 'google_oauth_origin';
const OAUTH_REDIRECT_URI_COOKIE = 'google_oauth_redirect_uri';
const OAUTH_FLOW_COOKIE = 'oauth_login_flow';
const OAUTH_BIND_TARGET_COOKIE = 'oauth_bind_target_user_id';
const AUTH_PAYLOAD_COOKIE = 'google_auth_payload';

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
  const flow = request.cookies.get(OAUTH_FLOW_COOKIE)?.value || 'login';
  const bindTargetUserId = request.cookies.get(OAUTH_BIND_TARGET_COOKIE)?.value;

  const baseUrl = loginOrigin || request.nextUrl.origin;

  if (error) {
    return NextResponse.redirect(new URL('/?error=oauth_error', baseUrl));
  }

  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL('/?error=invalid_state', baseUrl));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', baseUrl));
  }

  try {
    const tokens = await exchangeGoogleCode(code, redirectUri || `${baseUrl}/api/auth/callback/google`);
    const profile = await getGoogleProfile(tokens.accessToken);

    if (flow === 'bind') {
      if (!bindTargetUserId) {
        return NextResponse.redirect(new URL('/profile?bind=failed&reason=no_target', baseUrl));
      }

      await connectDB();
      const existing = await AuthIdentity.findOne({
        provider: 'google',
        providerAccountId: profile.id,
      })
        .select('canonicalUserId')
        .lean();

      if (existing?.canonicalUserId && existing.canonicalUserId !== bindTargetUserId) {
        return NextResponse.redirect(new URL('/profile?bind=failed&reason=conflict&provider=google', baseUrl));
      }

      await AuthIdentity.findOneAndUpdate(
        { provider: 'google', providerAccountId: profile.id },
        {
          provider: 'google',
          providerAccountId: profile.id,
          canonicalUserId: bindTargetUserId,
          email: profile.email,
          name: profile.name,
          avatar: profile.avatar,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
        },
        { upsert: true, returnDocument: 'after' }
      );

      const response = NextResponse.redirect(new URL('/profile?bind=success&provider=google', baseUrl));
      response.cookies.delete(OAUTH_STATE_COOKIE);
      response.cookies.delete(OAUTH_ORIGIN_COOKIE);
      response.cookies.delete(OAUTH_REDIRECT_URI_COOKIE);
      response.cookies.delete(OAUTH_FLOW_COOKIE);
      response.cookies.delete(OAUTH_BIND_TARGET_COOKIE);
      return response;
    }

    const payload = Buffer.from(JSON.stringify({
      provider: 'google',
      providerAccountId: profile.id,
      profile,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      issuedAt: Date.now(),
    })).toString('base64url');

    const callbackUrl = new URL('/auth/callback/oauth?provider=google-oauth', baseUrl);
    const response = NextResponse.redirect(callbackUrl);
    response.cookies.delete(OAUTH_STATE_COOKIE);
    response.cookies.delete(OAUTH_ORIGIN_COOKIE);
    response.cookies.delete(OAUTH_REDIRECT_URI_COOKIE);
    response.cookies.delete(OAUTH_FLOW_COOKIE);
    response.cookies.delete(OAUTH_BIND_TARGET_COOKIE);
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
    console.error('Google callback error:', err);
    return NextResponse.redirect(new URL('/?error=auth_failed', baseUrl));
  }
}
