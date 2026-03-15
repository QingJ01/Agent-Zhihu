'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Question } from '@/types/zhihu';
import { Icons } from './Icons';
import { HashtagText } from './HashtagText';
import { useVote } from '@/lib/useVote';
import { useFavorite } from '@/lib/useFavorite';

interface QuestionCardProps {
    question: Question & { messageCount?: number };
    onTagClick?: (tag: string) => void;
    currentUserId?: string;
    isFavorited?: boolean;
    onVoteChange?: (questionId: string, payload: { liked: boolean; downvoted: boolean; upvotes: number; downvotes: number }) => void;
    onFavoriteChange?: (questionId: string, favorited: boolean) => void;
}

export function QuestionCard({
    question,
    onTagClick,
    currentUserId,
    isFavorited = false,
    onVoteChange,
    onFavoriteChange,
}: QuestionCardProps) {
    const { isVoting, vote } = useVote(question.id, 'question', currentUserId, onVoteChange);
    const { isFavoriting, toggleFavorite } = useFavorite(question.id, 'question', currentUserId, onFavoriteChange);

    const liked = useMemo(() => {
        if (!currentUserId) return false;
        return (question.likedBy || []).includes(currentUserId);
    }, [currentUserId, question.likedBy]);
    const downvoted = useMemo(() => {
        if (!currentUserId) return false;
        return (question.dislikedBy || []).includes(currentUserId);
    }, [currentUserId, question.dislikedBy]);

    const voteCount = question.upvotes || 0;
    const downvoteCount = question.downvotes || 0;

    return (
        <div className="p-4 md:p-[20px] bg-white border-b border-[var(--zh-border)] last:border-b-0 hover:shadow-[0_1px_3px_rgba(18,18,18,0.1)] transition-shadow">
            {/* Title */}
            <h2 className="text-[16px] md:text-[18px] font-bold text-[var(--zh-text-main)] leading-snug mb-2 group-hover:text-[var(--zh-blue)] transition-colors">
                <Link href={`/question/${question.id}`} className="hover:underline decoration-[var(--zh-blue)]">
                    {question.title}
                </Link>
            </h2>

            {/* Body/Preview */}
            {question.description && (
                <div className="mb-2">
                    <div className="text-[15px] text-[var(--zh-text-main)] leading-[1.67] line-clamp-3 group-hover:text-[var(--zh-text-secondary)] transition-colors">
                        <HashtagText text={question.description} onTagClick={onTagClick} />
                        <Link href={`/question/${question.id}`} className="inline-flex mt-1 md:mt-0 md:float-right text-[13px] md:text-[14px] text-[var(--zh-blue)] font-medium hover:text-[var(--zh-text-secondary)] ml-1 items-center gap-0.5">
                            阅读全文 <Icons.CaretDown size={14} />
                        </Link>
                    </div>
                </div>
            )}

            {/* Footer / Actions */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
                {/* Vote Buttons */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={(e) => vote('up', e)}
                        disabled={isVoting}
                        aria-label={`赞同${voteCount ? `，当前 ${voteCount} 票` : ''}`}
                        className="flex items-center gap-1.5 h-8 px-3 md:px-4 text-xs md:text-sm font-medium transition-colors rounded-[3px] bg-[var(--zh-blue-light)] text-[var(--zh-blue)] hover:bg-[#D6EAFF]"
                    >
                        <Icons.Upvote size={10} filled={liked} />
                        <span>赞同{voteCount ? ` ${voteCount}` : ''}</span>
                    </button>
                    <button
                        onClick={(e) => vote('down', e)}
                        disabled={isVoting}
                        aria-label="反对"
                        className="flex items-center justify-center h-8 w-8 text-xs md:text-sm font-medium transition-colors rounded-[3px] bg-[var(--zh-blue-light)] text-[var(--zh-blue)] hover:bg-[#D6EAFF]"
                        title={`反对 ${downvoteCount}`}
                    >
                        <Icons.Downvote size={10} filled={downvoted} />
                    </button>
                </div>

                <Link href={`/question/${question.id}`} className="flex items-center gap-1.5 text-xs md:text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors p-0">
                    <Icons.Comment size={18} className="text-[var(--zh-text-gray)]" />
                    <span>{question.messageCount ? `${question.messageCount} 条评论` : '添加评论'}</span>
                </Link>

                <button
                    onClick={async () => {
                        const url = `${window.location.origin}/question/${question.id}`;
                        try {
                            if (navigator.share) {
                                await navigator.share({ title: question.title, url });
                            } else {
                                await navigator.clipboard.writeText(url);
                            }
                        } catch { /* user cancelled */ }
                    }}
                    className="flex items-center gap-1.5 text-xs md:text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors bg-transparent hover:bg-transparent p-0"
                >
                    <Icons.Share size={18} className="text-[var(--zh-text-gray)]" />
                    <span>分享</span>
                </button>

                <button
                    onClick={toggleFavorite}
                    disabled={isFavoriting}
                    className="flex items-center gap-1.5 text-xs md:text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors bg-transparent hover:bg-transparent p-0"
                >
                    <Icons.Favorite size={18} className="text-[var(--zh-text-gray)]" filled={isFavorited} />
                    <span>{isFavorited ? '已收藏' : '收藏'}</span>
                </button>

                <div className="flex-1 hidden sm:block"></div>

                <button className="text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors bg-transparent hover:bg-transparent p-0 opacity-0 group-hover:opacity-100">
                    <Icons.More size={18} />
                </button>
            </div>
        </div>
    );
}
