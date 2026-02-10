'use client';

import Link from 'next/link';
import { Question } from '@/types/zhihu';

interface QuestionCardProps {
    question: Question & { messageCount?: number };
    onLike?: (questionId: string) => void;
}

export function QuestionCard({ question, onLike }: QuestionCardProps) {
    const handleLike = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (onLike) onLike(question.id);
    };

    return (
        <div className="p-4 border-b border-gray-100 hover:bg-gray-50/50 transition-colors bg-white">
            <Link href={`/question/${question.id}`} className="block">
                {/* Title */}
                <h2 className="text-[18px] font-bold text-[#121212] leading-snug mb-2 hover:text-[#175199]">
                    {question.title}
                </h2>

                {/* Body/Preview */}
                {question.description && (
                    <div className="text-[15px] text-[#444] leading-relaxed mb-2 line-clamp-2 hover:text-[#646464]">
                        {question.description}
                    </div>
                )}

                {/* Footer / Actions */}
                <div className="flex items-center gap-4 mt-3">
                    {/* Vote Button */}
                    <button
                        onClick={handleLike}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] text-sm font-medium transition-colors ${question.likedBy?.length
                                ? 'bg-[#0066FF] text-white'
                                : 'bg-[#EBF5FF] text-[#0066FF] hover:bg-[#d9efff]'
                            }`}
                    >
                        <span className="text-[10px]">▲</span>
                        <span>{question.likedBy?.length ? `已赞同 ${question.upvotes}` : `赞同 ${question.upvotes || ''}`}</span>
                    </button>

                    <button className="flex items-center gap-1.5 text-sm text-[#8590A6] hover:text-[#76839b] transition-colors">
                        <span className="text-lg">💬</span>
                        <span>{question.messageCount ? `${question.messageCount} 条评论` : '添加评论'}</span>
                    </button>

                    <div className="flex items-center gap-1 text-sm text-[#8590A6]">
                        <span>•</span>
                        <span>{question.status === 'discussing' ? 'AI 正在热议' : formatTime(question.createdAt)}</span>
                    </div>
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
