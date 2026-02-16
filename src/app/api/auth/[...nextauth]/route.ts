import NextAuth, { NextAuthOptions, Session, User } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { connectDB } from '@/lib/mongodb';
import AuthIdentity, { AuthProvider } from '@/models/AuthIdentity';
import UserProfile from '@/models/UserProfile';

const AUTH_PAYLOAD_COOKIE = 'secondme_auth_payload';
const GITHUB_AUTH_PAYLOAD_COOKIE = 'github_auth_payload';
const GOOGLE_AUTH_PAYLOAD_COOKIE = 'google_auth_payload';
const AUTH_PAYLOAD_MAX_AGE_MS = 2 * 60 * 1000;

interface OAuthLoginPayload {
  provider: AuthProvider;
  providerAccountId: string;
  profile: {
    id: string;
    name: string;
    email?: string;
    avatar?: string;
    bio?: string;
  };
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
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
    if (!payload?.provider || !payload?.providerAccountId || !payload?.profile?.id || !payload?.issuedAt) {
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

async function authorizeWithPayload(
  req: unknown,
  provider: AuthProvider,
  cookieName: string,
  options?: { requireAccessToken?: boolean }
): Promise<User | null> {
  const cookies = parseCookies(getCookieHeader(req));
  const payload = decodeAuthPayload(cookies[cookieName]);
  if (!payload || payload.provider !== provider) return null;
  if (options?.requireAccessToken && !payload.accessToken) return null;

  try {
    await connectDB();

    const existing = await AuthIdentity.findOne({
      provider,
      providerAccountId: payload.providerAccountId,
    })
      .select('canonicalUserId')
      .lean();

    const defaultCanonicalUserId = provider === 'secondme'
      ? payload.providerAccountId
      : `${provider}:${payload.providerAccountId}`;
    const canonicalUserId = existing?.canonicalUserId || defaultCanonicalUserId;

    await AuthIdentity.findOneAndUpdate(
      { provider, providerAccountId: payload.providerAccountId },
      {
        provider,
        providerAccountId: payload.providerAccountId,
        canonicalUserId,
        email: payload.profile.email,
        name: payload.profile.name,
        avatar: payload.profile.avatar,
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
        expiresAt: payload.expiresAt,
      },
      { upsert: true, returnDocument: 'after' }
    );

    const existingProfile = await UserProfile.findOne({ userId: canonicalUserId })
      .select('displayName avatarUrl bio customized')
      .lean();

    if (!existingProfile) {
      await UserProfile.create({
        userId: canonicalUserId,
        displayName: payload.profile.name || '',
        avatarUrl: payload.profile.avatar || '',
        bio: payload.profile.bio || '',
        provider,
        customized: false,
      });
    } else if (!existingProfile.customized) {
      await UserProfile.findOneAndUpdate(
        { userId: canonicalUserId },
        {
          displayName: existingProfile.displayName || payload.profile.name || '',
          avatarUrl: existingProfile.avatarUrl || payload.profile.avatar || '',
          bio: existingProfile.bio || payload.profile.bio || '',
          provider,
        }
      );
    } else {
      await UserProfile.findOneAndUpdate({ userId: canonicalUserId }, { provider });
    }

    return {
      id: canonicalUserId,
      name: payload.profile.name,
      email: payload.profile.email,
      image: payload.profile.avatar,
      bio: payload.profile.bio,
      provider,
    };
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
      provider?: string;
    };
  }

  interface User {
    id: string;
    name: string;
    email?: string;
    image?: string;
    bio?: string;
    provider?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    bio?: string;
    provider?: string;
    providerName?: string;
    providerImage?: string;
    providerEmail?: string;
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
        return authorizeWithPayload(req, 'secondme', AUTH_PAYLOAD_COOKIE, { requireAccessToken: true });
      },
    }),
    CredentialsProvider({
      id: 'github-oauth',
      name: 'GitHub',
      credentials: {
        nonce: { label: 'Nonce', type: 'text' },
      },
      async authorize(_, req): Promise<User | null> {
        return authorizeWithPayload(req, 'github', GITHUB_AUTH_PAYLOAD_COOKIE);
      },
    }),
    CredentialsProvider({
      id: 'google-oauth',
      name: 'Google',
      credentials: {
        nonce: { label: 'Nonce', type: 'text' },
      },
      async authorize(_, req): Promise<User | null> {
        return authorizeWithPayload(req, 'google', GOOGLE_AUTH_PAYLOAD_COOKIE);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.bio = user.bio;
        token.provider = user.provider;
        token.providerName = user.name;
        token.providerImage = user.image;
        token.providerEmail = user.email;
      }
      return token;
    },
    async session({ session, token }): Promise<Session> {
      let profileName = token.providerName;
      let profileImage = token.providerImage;
      let profileBio = token.bio;

      try {
        await connectDB();
        const profile = await UserProfile.findOne({ userId: token.id })
          .select('displayName avatarUrl bio')
          .lean();
        if (profile) {
          if (profile.displayName) profileName = profile.displayName;
          if (profile.avatarUrl) profileImage = profile.avatarUrl;
          if (profile.bio) profileBio = profile.bio;
        }
      } catch {
        // keep provider data fallback
      }

      session.user = {
        ...session.user,
        id: token.id,
        name: profileName || session.user.name || '用户',
        email: token.providerEmail || session.user.email || undefined,
        image: profileImage || session.user.image || undefined,
        bio: profileBio,
        provider: token.provider,
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
