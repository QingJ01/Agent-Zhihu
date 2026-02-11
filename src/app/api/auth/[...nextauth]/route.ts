import NextAuth, { NextAuthOptions, Session, User } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { SecondMeProfile } from '@/types/secondme';
import { getUserProfile } from '@/lib/secondme';

const AUTH_PAYLOAD_COOKIE = 'secondme_auth_payload';
const AUTH_PAYLOAD_MAX_AGE_MS = 2 * 60 * 1000;

interface OAuthLoginPayload {
  profile: SecondMeProfile;
  accessToken: string;
  issuedAt: number;
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const cookieMap: Record<string, string> = {};

  for (const entry of header.split(';')) {
    const [rawKey, ...rest] = entry.trim().split('=');
    if (!rawKey || rest.length === 0) continue;
    cookieMap[rawKey] = decodeURIComponent(rest.join('='));
  }

  return cookieMap;
}

function getCookieHeader(req: unknown): string | undefined {
  if (!req || typeof req !== 'object' || !('headers' in req)) {
    return undefined;
  }

  const headers = (req as { headers?: unknown }).headers;
  if (!headers) return undefined;

  if (headers instanceof Headers) {
    return headers.get('cookie') || undefined;
  }

  if (typeof headers === 'object' && headers !== null && 'cookie' in headers) {
    const value = (headers as { cookie?: unknown }).cookie;
    return typeof value === 'string' ? value : undefined;
  }

  return undefined;
}

function decodeAuthPayload(cookieValue: string | undefined): OAuthLoginPayload | null {
  if (!cookieValue) return null;
  try {
    const decoded = Buffer.from(cookieValue, 'base64url').toString('utf-8');
    const payload = JSON.parse(decoded) as OAuthLoginPayload;
    if (!payload?.accessToken || !payload?.profile?.id || !payload?.issuedAt) {
      return null;
    }
    if (Date.now() - payload.issuedAt > AUTH_PAYLOAD_MAX_AGE_MS) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name: string;
      email?: string;
      image?: string;
      bio?: string;
      accessToken?: string;
    };
  }

  interface User {
    id: string;
    name: string;
    email?: string;
    image?: string;
    bio?: string;
    accessToken?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    bio?: string;
    accessToken?: string;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: 'secondme',
      name: 'SecondMe',
      credentials: {
        nonce: { label: 'Nonce', type: 'text' },
      },
      async authorize(_, req): Promise<User | null> {
        const cookies = parseCookies(getCookieHeader(req));
        const payload = decodeAuthPayload(cookies[AUTH_PAYLOAD_COOKIE]);
        if (!payload) return null;

        try {
          const verifiedProfile = await getUserProfile(payload.accessToken);

          if (verifiedProfile.id !== payload.profile.id) {
            return null;
          }

          return {
            id: verifiedProfile.id,
            name: verifiedProfile.name,
            email: verifiedProfile.email,
            image: verifiedProfile.avatar,
            bio: verifiedProfile.bio,
            accessToken: payload.accessToken,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.bio = user.bio;
        token.accessToken = user.accessToken;
      }
      return token;
    },
    async session({ session, token }): Promise<Session> {
      session.user = {
        ...session.user,
        id: token.id,
        bio: token.bio,
        accessToken: token.accessToken,
      };
      return session;
    },
  },
  pages: {
    signIn: '/',
    error: '/',
  },
  session: {
    strategy: 'jwt',
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
