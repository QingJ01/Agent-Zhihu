'use client';

import { AppHeader } from '@/components/AppHeader';
import RoundtableArena from '@/components/RoundtableArena';

export default function RoundtablePage() {
  return (
    <div className="min-h-screen bg-[var(--zh-bg)]">
      <AppHeader />
      <main className="max-w-[1000px] mx-auto px-3 md:px-4 py-4 mt-[104px] md:mt-[52px]">
        <RoundtableArena />
      </main>
    </div>
  );
}
