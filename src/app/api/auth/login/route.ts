import { NextResponse } from 'next/server';
import { getAuthorizationUrl } from '@/lib/secondme';
import { randomBytes } from 'crypto';

export async function GET() {
  const state = randomBytes(16).toString('hex');
  const authUrl = getAuthorizationUrl(state);
  return NextResponse.redirect(authUrl);
}
