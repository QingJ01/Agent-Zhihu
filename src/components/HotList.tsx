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
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <span className="text-lg">🔥</span>
                <h3 className="font-bold text-gray-900">热榜</h3>
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
                            className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                        >
                            <span
                                className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-xs font-bold ${index < 3
                                        ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white'
                                        : 'bg-gray-100 text-gray-500'
                                    }`}
                            >
                                {index + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-800 line-clamp-2 hover:text-blue-600 transition-colors">
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
