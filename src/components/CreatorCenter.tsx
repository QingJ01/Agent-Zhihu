'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Question } from '@/types/zhihu';

interface CreatorCenterProps {
    questions?: (Question & { messageCount?: number })[];
}

export function CreatorCenter({ questions = [] }: CreatorCenterProps) {
    const { data: session } = useSession();
    const router = useRouter();

    if (!session?.user) return null;

    const handleGoProfile = () => {
        router.push('/profile');
    };

    const handleGoRandomQuestion = () => {
        let pool = questions;

        if (pool.length === 0) {
            try {
                const raw = localStorage.getItem('agent-zhihu-questions');
                if (raw) {
                    const parsed = JSON.parse(raw) as { questions?: Question[] };
                    pool = (parsed.questions || []) as (Question & { messageCount?: number })[];
                }
            } catch (error) {
                console.error('Failed to load questions for random answer:', error);
            }
        }

        if (pool.length === 0) {
            router.push('/');
            return;
        }

        const picked = pool[Math.floor(Math.random() * pool.length)];
        router.push(`/question/${picked.id}`);
    };

    return (
        <div className="bg-white rounded-[2px] shadow-sm border border-[var(--zh-border)] p-4 mb-[10px]">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-[14px] text-[var(--zh-text-gray)]">🔍</span>
                    <span className="text-[14px] font-medium text-[var(--zh-text-main)]">创作中心</span>
                    <span className="text-[10px] text-[var(--zh-blue)] bg-[rgba(0,102,255,0.1)] px-1 py-0.5 rounded-[2px]">Lv 2</span>
                </div>
                <span className="text-[12px] text-[var(--zh-text-gray)]">草稿箱 0</span>
            </div>

            {/* Banner/Ad Placeholder */}
            <div className="bg-[var(--zh-bg)] rounded-[4px] h-[60px] flex items-center justify-center mb-3 overflow-hidden relative group cursor-pointer">
                {/* Gradient or Image */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-blue-200 opacity-20 group-hover:opacity-30 transition-opacity"></div>
                <div className="relative z-10 flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs">AI</div>
                    <div className="text-xs text-[var(--zh-text-main)] font-medium">
                        <div>AI 请接招</div>
                        <div className="text-[10px] text-[var(--zh-text-secondary)]">参与活动赢好礼</div>
                    </div>
                </div>
            </div>

            {/* Actions Grid */}
            <div className="grid grid-cols-2 gap-3">
                <button
                    type="button"
                    onClick={handleGoProfile}
                    className="flex items-center justify-center gap-1 py-2 border border-[var(--zh-blue)] text-[var(--zh-blue)] text-[14px] rounded-[3px] hover:bg-[rgba(0,102,255,0.06)] transition-colors"
                >
                    进入创作中心 &gt;
                </button>
                <button
                    type="button"
                    onClick={handleGoRandomQuestion}
                    className="flex items-center justify-center gap-1 py-2 border border-[var(--zh-blue)] text-[var(--zh-blue)] text-[14px] rounded-[3px] hover:bg-[rgba(0,102,255,0.06)] transition-colors"
                >
                    等你来答 &gt;
                </button>
            </div>
        </div>
    );
}
