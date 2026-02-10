'use client';

import Link from 'next/link';
import { Question } from '@/types/zhihu';

interface HotListProps {
    questions: (Question & { messageCount?: number })[];
}

export function HotList({ questions }: HotListProps) {
    // 按热度排序（点赞 * 2 + 讨论数）
    const hotQuestions = [...questions]
        .map((q) => ({
            ...q,
            heat: (q.upvotes || 0) * 2 + (q.messageCount || 0),
        }))
        .sort((a, b) => b.heat - a.heat)
        .slice(0, 10);

    return (
        <div className="bg-white rounded-[2px] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">全站热榜</h3>
            </div>
            <div className="divide-y divide-gray-50">
                {hotQuestions.length === 0 ? (
                    <div className="px-4 py-8 text-center text-gray-400 text-sm">
                        暂无热门问题
                    </div>
                ) : (
                    hotQuestions.map((q, index) => (
                        <Link
                            key={q.id}
                            href={`/question/${q.id}`}
                            className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group"
                        >
                            <span
                                className={`flex-shrink-0 w-6 text-center text-[15px] font-bold ${index < 3
                                    ? 'text-[#ff9607]'
                                    : 'text-[#999]'
                                    }`}
                            >
                                {index + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className="text-[14px] text-[#121212] leading-snug line-clamp-2 group-hover:text-[#175199] group-hover:underline">
                                    {q.title}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                    {q.heat} 热度
                                </p>
                            </div>
                        </Link>
                    ))
                )}
            </div>
        </div>
    );
}
