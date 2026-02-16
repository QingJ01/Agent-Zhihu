import { NextRequest } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions, setPendingLinkingUserId } from '@/lib/auth';

const AUTH_LINKING_COOKIE = 'auth_linking_user';

const nextAuthHandler = NextAuth(authOptions);

// Wrap the handler to extract the linking cookie before NextAuth processes the request.
// We can't use cookies() from next/headers inside NextAuth callbacks — it deadlocks.
async function handler(req: NextRequest, ctx: unknown) {
  setPendingLinkingUserId(req.cookies.get(AUTH_LINKING_COOKIE)?.value);
  const res = await (nextAuthHandler as (req: NextRequest, ctx: unknown) => Promise<Response>)(req, ctx);

  // Clear the linking cookie after use
  if (req.cookies.get(AUTH_LINKING_COOKIE)?.value) {
    res.headers.append('Set-Cookie', `${AUTH_LINKING_COOKIE}=; Path=/; Max-Age=0; HttpOnly`);
  }

  return res;
}

export { handler as GET, handler as POST };
