'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Question } from '@/types/zhihu';

interface HotListProps {
    questions: (Question & { messageCount?: number })[];
}

export function HotList({ questions }: HotListProps) {
    const [offset, setOffset] = useState(0);

    // 按热度排序（点赞 * 2 + 讨论数）
    const sorted = [...questions]
        .map((q) => ({
            ...q,
            heat: (q.upvotes || 0) * 2 + (q.messageCount || 0),
        }))
        .sort((a, b) => b.heat - a.heat);

    const pageSize = 10;
    const hotQuestions = sorted.slice(offset, offset + pageSize);

    const handleShuffle = () => {
        const nextOffset = offset + pageSize;
        // 如果超出范围，回到开头
        setOffset(nextOffset >= sorted.length ? 0 : nextOffset);
    };

    return (
        <div className="bg-white rounded-[2px] shadow-sm overflow-hidden mb-[10px] border border-[var(--zh-border)]">
            <div className="px-4 py-3 border-b border-[var(--zh-border)] flex items-center justify-between">
                <h3 className="font-semibold text-[var(--zh-text-main)] text-[14px]">大家都在搜</h3>
                <button
                    onClick={handleShuffle}
                    className="text-[14px] text-[var(--zh-text-gray)] flex items-center gap-1 hover:text-[var(--zh-text-secondary)]"
                >
                    <span className="text-lg">↻</span> 换一换
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
