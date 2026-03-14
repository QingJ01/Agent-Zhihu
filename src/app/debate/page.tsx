'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { DebateArena } from '@/components/DebateArena';

export default function DebatePage() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-600">请先登录后参与辩论</p>
        <Link href="/" className="text-blue-600 hover:underline">返回首页</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="max-w-5xl mx-auto px-3 md:px-4 py-4 md:py-6 mt-[104px] md:mt-[52px]">
        <DebateArena />
      </main>
    </div>
  );
}
