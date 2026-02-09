import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, getUserProfile, getUserShades, getUserSoftMemory } from '@/lib/secondme';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    console.error('OAuth error:', error);
    return NextResponse.redirect(new URL('/?error=oauth_error', request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', request.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const profile = await getUserProfile(tokens.access_token);

    const [shades, softMemory] = await Promise.all([
      getUserShades(tokens.access_token),
      getUserSoftMemory(tokens.access_token),
    ]);

    profile.shades = shades;
    profile.softMemory = softMemory;

    const callbackUrl = new URL('/auth/callback/secondme', request.url);
    callbackUrl.searchParams.set('profile', JSON.stringify(profile));
    callbackUrl.searchParams.set('accessToken', tokens.access_token);

    return NextResponse.redirect(callbackUrl);
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url));
  }
}
