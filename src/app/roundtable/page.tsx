'use client';

import { Suspense } from 'react';
import { AppHeader } from '@/components/AppHeader';
import RoundtableArena from '@/components/RoundtableArena';

export default function RoundtablePage() {
  return (
    <div className="min-h-screen bg-[var(--zh-bg)]">
      <AppHeader />
      <main className="max-w-[1000px] mx-auto px-3 md:px-4 py-4 mt-[104px] md:mt-[52px]">
        <Suspense fallback={
          <div className="max-w-[694px] mx-auto">
            <div className="bg-white p-8 border border-[var(--zh-border)] rounded-[2px] text-center">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-[var(--zh-blue)] rounded-full animate-spin mx-auto" />
              <p className="text-[14px] text-[var(--zh-text-gray)] mt-3">加载中...</p>
            </div>
          </div>
        }>
          <RoundtableArena />
        </Suspense>
      </main>
    </div>
  );
}
