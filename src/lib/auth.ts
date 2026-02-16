import { getServerSession } from 'next-auth';
import type { NextAuthOptions, Session, User } from 'next-auth';
import { NextRequest } from 'next/server';
import CredentialsProvider from 'next-auth/providers/credentials';
import GitHubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import { getUserProfile } from '@/lib/secondme';
import { findOrCreateUser, linkAccountToUser, validateApiToken } from '@/lib/auth-helpers';
import { connectDB } from '@/lib/mongodb';
import UserModel from '@/models/User';

// --- Linking cookie plumbing ---
// Module-level variable to pass the linking cookie from the request handler
// to the signIn callback (cookies() from next/headers hangs in NextAuth callbacks)
let _pendingLinkingUserId: string | undefined;

export function setPendingLinkingUserId(id: string | undefined) {
  _pendingLinkingUserId = id;
}

// --- SecondMe credential helpers ---
const AUTH_PAYLOAD_COOKIE = 'secondme_auth_payload';
const AUTH_PAYLOAD_MAX_AGE_MS = 2 * 60 * 1000;

interface OAuthLoginPayload {
  profile: { id: string; name: string; email?: string; avatar?: string; bio?: string };
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

// --- NextAuth options ---
export const authOptions: NextAuthOptions = {
  providers: [
    // GitHub OAuth
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      httpOptions: { timeout: 10000 },
    }),

    // Google OAuth
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      httpOptions: { timeout: 10000 },
    }),

    // SecondMe (custom credentials-based OAuth)
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
    async signIn({ user, account }) {
      if (!account) return true;

      try {
        const provider = account.provider as 'github' | 'google' | 'secondme';
        const providerAccountId = account.providerAccountId || user.id;

        const profile = {
          name: user.name || 'Anonymous',
          email: user.email || undefined,
          image: user.image || undefined,
          bio: (user as User).bio,
        };

        const tokens = {
          accessToken: account.access_token || (user as User).accessToken,
          refreshToken: account.refresh_token,
        };

        // Check if we're in linking mode
        const linkingUserId = _pendingLinkingUserId;
        _pendingLinkingUserId = undefined;

        if (linkingUserId) {
          const result = await linkAccountToUser(linkingUserId, provider, providerAccountId, profile, tokens);
          if (result.success) {
            user.id = linkingUserId;
            return true;
          }
        }

        // Normal flow: find or create user
        const dbUser = await findOrCreateUser(provider, providerAccountId, profile, tokens);

        user.id = dbUser.id;
        user.name = dbUser.name;
        user.image = dbUser.image || user.image;

        return true;
      } catch (error) {
        console.error('signIn callback error:', error);
        return true;
      }
    },

    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.bio = (user as User).bio;
        token.accessToken = (user as User).accessToken || account?.access_token;

        try {
          await connectDB();
          const dbUser = await UserModel.findOne({ id: token.id }).lean();
          token.linkedProviders = dbUser?.linkedAccounts.map(a => a.provider) || [];
        } catch {
          token.linkedProviders = [];
        }
      }
      return token;
    },

    async session({ session, token }): Promise<Session> {
      session.user = {
        ...session.user,
        id: token.id,
        bio: token.bio,
        accessToken: token.accessToken,
        linkedProviders: token.linkedProviders,
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

// --- Session helper ---
export async function getAuthUser(request?: NextRequest): Promise<{ id: string; name: string; email?: string; image?: string; bio?: string } | null> {
  // Try NextAuth session first
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    return {
      id: session.user.id,
      name: session.user.name || 'Anonymous',
      email: session.user.email ?? undefined,
      image: session.user.image ?? undefined,
      bio: session.user.bio,
    };
  }

  // Try Bearer token auth
  if (request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const user = await validateApiToken(token);
      if (user) {
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          bio: user.bio,
        };
      }
    }
  }

  return null;
}
