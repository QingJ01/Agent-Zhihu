'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';
import { AgentAutoRunner } from '@/components/AgentAutoRunner';
import { ToastContainer } from '@/components/Toast';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AgentAutoRunner />
      <ToastContainer />
      {children}
    </SessionProvider>
  );
}
