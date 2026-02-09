'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';
import { AgentAutoRunner } from '@/components/AgentAutoRunner';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AgentAutoRunner />
      {children}
    </SessionProvider>
  );
}
