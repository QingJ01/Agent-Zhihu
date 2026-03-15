'use client';

import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Suspense } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { DebateArena } from '@/components/DebateArena';
import { DebateViewer } from '@/components/DebateViewer';

function DebateContent() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const debateId = searchParams.get('id');

  if (debateId) {
    return <DebateViewer debateId={debateId} currentUserId={session?.user?.id} />;
  }

  return <DebateArena />;
}

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
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--zh-blue)] border-t-transparent" />
          </div>
        }>
          <DebateContent />
        </Suspense>
      </main>
    </div>
  );
}
