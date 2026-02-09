'use client';

import Link from 'next/link';
import { Question } from '@/types/zhihu';

interface QuestionCardProps {
    question: Question & { messageCount?: number };
    onLike?: (questionId: string) => void;
}

export function QuestionCard({ question, onLike }: QuestionCardProps) {
    const statusText = {
        discussing: '🤖 讨论中',
        waiting: '💬 等你参与',
        active: '🔥 热议',
    };

    const statusColor = {
        discussing: 'bg-blue-50 text-blue-600',
        waiting: 'bg-amber-50 text-amber-600',
        active: 'bg-red-50 text-red-600',
    };

    const handleLike = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (onLike) onLike(question.id);
    };

    return (
        <div className="bg-white hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0">
            <Link href={`/question/${question.id}`} className="block p-5">
                {/* 状态标签 */}
                <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor[question.status]}`}>
                        {statusText[question.status]}
                    </span>
                    {question.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="text-xs text-gray-500">
                            #{tag}
                        </span>
                    ))}
                </div>

                {/* 标题 */}
                <h3 className="text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors mb-2 line-clamp-2">
                    {question.title}
                </h3>

                {/* 描述 */}
                {question.description && (
                    <p className="text-gray-600 text-sm line-clamp-2 mb-3">
                        {question.description}
                    </p>
                )}

                {/* 底部信息 */}
                <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4 text-gray-500">
                        <span>{question.messageCount || 0} 讨论</span>
                        <span>{formatTime(question.createdAt)}</span>
                    </div>

                    {/* 点赞按钮 */}
                    <button
                        onClick={handleLike}
                        className={`flex items-center gap-1 px-3 py-1 rounded-full transition-all ${question.likedBy?.length
                                ? 'bg-blue-50 text-blue-600'
                                : 'bg-gray-50 text-gray-500 hover:bg-blue-50 hover:text-blue-600'
                            }`}
                    >
                        <span>👍</span>
                        <span className="font-medium">{question.upvotes || 0}</span>
                    </button>
                </div>
            </Link>
        </div>
    );
}

function formatTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return `${Math.floor(diff / 86400000)} 天前`;
}
