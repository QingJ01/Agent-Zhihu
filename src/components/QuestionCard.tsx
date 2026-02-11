'use client';

import Link from 'next/link';
import { Question } from '@/types/zhihu';
import { Icons } from './Icons';

interface QuestionCardProps {
    question: Question & { messageCount?: number };
    onLike?: (questionId: string) => void;
    currentUserId?: string;
}

export function QuestionCard({ question, onLike, currentUserId }: QuestionCardProps) {
    const isLiked = currentUserId ? question.likedBy?.includes(currentUserId) : false;

    const handleLike = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (onLike) onLike(question.id);
    };

    return (
        <div className="p-[20px] bg-white border-b border-[var(--zh-border)] last:border-b-0 hover:shadow-[0_1px_3px_rgba(18,18,18,0.1)] transition-shadow">
            {/* Title */}
            <h2 className="text-[18px] font-bold text-[var(--zh-text-main)] leading-snug mb-2 group-hover:text-[var(--zh-blue)] transition-colors">
                <Link href={`/question/${question.id}`} className="hover:underline decoration-[var(--zh-blue)]">
                    {question.title}
                </Link>
            </h2>

            {/* Body/Preview */}
            {question.description && (
                <div className="mb-2">
                    <Link href={`/question/${question.id}`}>
                        <div className="text-[15px] text-[var(--zh-text-main)] leading-[1.67] line-clamp-3 group-hover:text-[var(--zh-text-secondary)] transition-colors cursor-pointer">
                            {question.description}
                            <span className="float-right text-[14px] text-[var(--zh-blue)] font-medium hover:text-[var(--zh-text-secondary)] ml-1 cursor-pointer flex items-center gap-0.5">
                                阅读全文 <Icons.CaretDown size={14} />
                            </span>
                        </div>
                    </Link>
                </div>
            )}

            {/* Footer / Actions */}
            <div className="flex items-center gap-4 mt-3">
                {/* Split Vote Button */}
                <div className="flex items-center rounded-[3px] overflow-hidden">
                    <button
                        onClick={handleLike}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${isLiked
                            ? 'bg-[var(--zh-blue)] text-white'
                            : 'bg-[rgba(0,102,255,0.1)] text-[var(--zh-blue)] hover:bg-[rgba(0,102,255,0.15)]'
                            }`}
                    >
                        <Icons.Upvote size={12} filled={!!isLiked} />
                        <span>{isLiked ? `已赞同 ${question.upvotes}` : `赞同 ${question.upvotes || ''}`}</span>
                    </button>
                    <button
                        onClick={(e) => { e.preventDefault(); /* downvote placeholder */ }}
                        className={`px-2 py-1.5 text-sm font-medium transition-colors ml-[2px] ${isLiked
                            ? 'bg-[var(--zh-blue)] text-white'
                            : 'bg-[rgba(0,102,255,0.1)] text-[var(--zh-blue)] hover:bg-[rgba(0,102,255,0.15)]'
                            }`}
                    >
                        <Icons.Downvote size={12} filled={!!isLiked} />
                    </button>
                </div>

                <Link href={`/question/${question.id}`} className="flex items-center gap-1.5 text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors p-0">
                    <Icons.Comment size={18} className="text-[#8590A6]" />
                    <span>{question.messageCount ? `${question.messageCount} 条评论` : '添加评论'}</span>
                </Link>

                <button
                    onClick={() => {
                        if (navigator.share) {
                            navigator.share({ title: question.title, url: `${window.location.origin}/question/${question.id}` });
                        } else {
                            navigator.clipboard.writeText(`${window.location.origin}/question/${question.id}`);
                        }
                    }}
                    className="flex items-center gap-1.5 text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors bg-transparent hover:bg-transparent p-0"
                >
                    <Icons.Share size={18} className="text-[#8590A6]" />
                    <span>分享</span>
                </button>

                <button className="flex items-center gap-1.5 text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors bg-transparent hover:bg-transparent p-0">
                    <Icons.Favorite size={18} className="text-[#8590A6]" />
                    <span>收藏</span>
                </button>

                <div className="flex-1"></div>

                <button className="text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors bg-transparent hover:bg-transparent p-0 opacity-0 group-hover:opacity-100">
                    <Icons.More size={18} />
                </button>
            </div>
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
