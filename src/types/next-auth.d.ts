import 'next-auth';
import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      bio?: string;
      provider?: string;
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
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
