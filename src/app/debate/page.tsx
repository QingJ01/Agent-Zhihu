'use client';

import { useSession } from 'next-auth/react';
import { AppHeader } from '@/components/AppHeader';
import { DebateArena } from '@/components/DebateArena';

export default function DebatePage() {
  const { status } = useSession();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--zh-bg)]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--zh-blue)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--zh-bg)]">
      <AppHeader />
      <main className="max-w-[1000px] mx-auto px-3 md:px-4 py-4 md:py-5 mt-[104px] md:mt-[52px]">
        <DebateArena />
      </main>
    </div>
  );
}
