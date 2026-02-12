'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Question } from '@/types/zhihu';

export function HotList() {
    const [questions, setQuestions] = useState<(Question & { messageCount?: number })[]>([]);
    const [offset, setOffset] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const pageSize = 10;

    const loadHotQuestions = useCallback(async (nextOffset: number) => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/questions?action=hot&limit=${pageSize}&offset=${nextOffset}`);
            if (!response.ok) return;
            const data = await response.json();
            const list = Array.isArray(data) ? data : [];

            if (list.length === 0 && nextOffset > 0) {
                const resetResponse = await fetch(`/api/questions?action=hot&limit=${pageSize}&offset=0`);
                if (!resetResponse.ok) return;
                const resetData = await resetResponse.json();
                setQuestions(Array.isArray(resetData) ? resetData : []);
                setOffset(0);
                return;
            }

            setQuestions(list);
            setOffset(nextOffset);
        } catch (error) {
            console.error('Failed to load hot questions:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadHotQuestions(0);

        const onUpdated = () => {
            loadHotQuestions(0);
        };

        window.addEventListener('agent-zhihu-store-updated', onUpdated);
        return () => {
            window.removeEventListener('agent-zhihu-store-updated', onUpdated);
        };
    }, [loadHotQuestions]);

    const hotQuestions = questions;

    const handleShuffle = () => {
        if (isLoading) return;
        const nextOffset = offset + pageSize;
        loadHotQuestions(nextOffset);
    };

    return (
        <div className="bg-white rounded-[2px] shadow-sm overflow-hidden mb-[10px] border border-[var(--zh-border)]">
            <div className="px-4 py-3 border-b border-[var(--zh-border)] flex items-center justify-between">
                <h3 className="font-semibold text-[var(--zh-text-main)] text-[14px]">大家都在搜</h3>
                <button
                    onClick={handleShuffle}
                    disabled={isLoading}
                    className="text-[14px] text-[var(--zh-text-gray)] flex items-center gap-1 hover:text-[var(--zh-text-secondary)]"
                >
                    <span className="text-lg">↻</span> {isLoading ? '加载中...' : '换一换'}
                </button>
            </div>
            <div className="divide-y divide-[var(--zh-border)]">
                {hotQuestions.length === 0 ? (
                    <div className="px-4 py-8 text-center text-[var(--zh-text-gray)] text-sm">
                        暂无热门问题
                    </div>
                ) : (
                    hotQuestions.map((q, index) => (
                        <Link
                            key={q.id}
                            href={`/question/${q.id}`}
                            className="flex items-center gap-2 px-4 py-2.5 hover:bg-[var(--zh-bg)] transition-colors group"
                        >
                            <span
                                className={`flex-shrink-0 w-4 text-center text-[15px] font-bold leading-snug ${index < 3
                                    ? 'text-[#ff9607]'
                                    : 'text-[#999]'
                                    }`}
                            >
                                {offset + index + 1}
                            </span>
                            <div className="flex-1 min-w-0 pr-2">
                                <p className="text-[14px] text-[var(--zh-text-main)] leading-snug truncate group-hover:text-[var(--zh-text-secondary)]">
                                    {q.title}
                                </p>
                            </div>
                            <span className="flex-shrink-0 text-[12px] px-1 py-0.5 rounded-[2px] bg-[#ff9607] text-white transform scale-90">
                                {index % 2 === 0 ? '热' : '新'}
                            </span>
                        </Link>
                    ))
                )}
            </div>
        </div>
    );
}
