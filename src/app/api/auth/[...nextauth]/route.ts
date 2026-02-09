import NextAuth, { NextAuthOptions, Session, User } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { SecondMeProfile } from '@/types/secondme';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name: string;
      email?: string;
      image?: string;
      bio?: string;
      shades?: SecondMeProfile['shades'];
      softMemory?: SecondMeProfile['softMemory'];
      accessToken?: string;
    };
  }

  interface User {
    id: string;
    name: string;
    email?: string;
    image?: string;
    bio?: string;
    shades?: SecondMeProfile['shades'];
    softMemory?: SecondMeProfile['softMemory'];
    accessToken?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    bio?: string;
    shades?: SecondMeProfile['shades'];
    softMemory?: SecondMeProfile['softMemory'];
    accessToken?: string;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: 'secondme',
      name: 'SecondMe',
      credentials: {
        profile: { label: 'Profile', type: 'text' },
        accessToken: { label: 'Access Token', type: 'text' },
      },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.profile) return null;

        try {
          const profile: SecondMeProfile = JSON.parse(credentials.profile);
          return {
            id: profile.id,
            name: profile.name,
            email: profile.email,
            image: profile.avatar,
            bio: profile.bio,
            shades: profile.shades,
            softMemory: profile.softMemory,
            accessToken: credentials.accessToken,
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
        token.shades = user.shades;
        token.softMemory = user.softMemory;
        token.accessToken = user.accessToken;
      }
      return token;
    },
    async session({ session, token }): Promise<Session> {
      session.user = {
        ...session.user,
        id: token.id,
        bio: token.bio,
        shades: token.shades,
        softMemory: token.softMemory,
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
