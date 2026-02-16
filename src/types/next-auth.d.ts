import 'next-auth';
import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      bio?: string;
      accessToken?: string;
      linkedProviders?: string[];
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    bio?: string;
    accessToken?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    bio?: string;
    accessToken?: string;
    linkedProviders?: string[];
  }
}
