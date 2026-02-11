'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Question } from '@/types/zhihu';
import { Icons } from './Icons';
import { HashtagText } from './HashtagText';

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
    const [isVoting, setIsVoting] = useState(false);
    const [isFavoriting, setIsFavoriting] = useState(false);

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

    const handleVoteClick = useCallback(async (e: React.MouseEvent, voteType: 'up' | 'down') => {
        e.preventDefault();
        e.stopPropagation();
        if (!currentUserId || isVoting) {
            if (!currentUserId) window.alert(voteType === 'up' ? '请先登录后再点赞' : '请先登录后再反对');
            return;
        }

        setIsVoting(true);
        try {
            const response = await fetch('/api/likes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetId: question.id, targetType: 'question', voteType }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.error || (voteType === 'up' ? '点赞失败' : '反对失败'));
            }

            const result = await response.json();
            onVoteChange?.(question.id, {
                liked: !!result.liked,
                downvoted: !!result.downvoted,
                upvotes: Number(result.upvotes) || 0,
                downvotes: Number(result.downvotes) || 0,
            });
        } catch (error) {
            console.error('Question vote failed:', error);
            window.alert(voteType === 'up' ? '点赞失败，请稍后再试' : '反对失败，请稍后再试');
        } finally {
            setIsVoting(false);
        }
    }, [currentUserId, isVoting, onVoteChange, question.id]);

    const handleFavoriteClick = useCallback(async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!currentUserId || isFavoriting) {
            if (!currentUserId) window.alert('请先登录后再收藏');
            return;
        }

        setIsFavoriting(true);
        try {
            const response = await fetch('/api/favorites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetId: question.id, targetType: 'question' }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.error || '收藏失败');
            }

            const result = await response.json();
            onFavoriteChange?.(question.id, !!result.favorited);
        } catch (error) {
            console.error('Question favorite failed:', error);
            window.alert('收藏失败，请稍后再试');
        } finally {
            setIsFavoriting(false);
        }
    }, [currentUserId, isFavoriting, onFavoriteChange, question.id]);


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
                {/* Split Vote Button */}
                <div className="flex items-center rounded-[3px] overflow-hidden">
                    <button
                        onClick={(e) => handleVoteClick(e, 'up')}
                        disabled={isVoting}
                        className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 text-xs md:text-sm font-medium transition-colors bg-[rgba(0,102,255,0.1)] text-[var(--zh-blue)] hover:bg-[rgba(0,102,255,0.15)]"
                    >
                        <Icons.Upvote size={12} filled={liked} />
                        <span>{`赞同 ${voteCount}`}</span>
                    </button>
                    <button
                        onClick={(e) => handleVoteClick(e, 'down')}
                        className="px-2 py-1.5 text-xs md:text-sm font-medium transition-colors ml-[2px] bg-[rgba(0,102,255,0.1)] text-[var(--zh-blue)] hover:bg-[rgba(0,102,255,0.15)]"
                        title={`反对 ${downvoteCount}`}
                    >
                        <Icons.Downvote size={12} filled={downvoted} />
                    </button>
                </div>

                <Link href={`/question/${question.id}`} className="flex items-center gap-1.5 text-xs md:text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors p-0">
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
                    className="flex items-center gap-1.5 text-xs md:text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors bg-transparent hover:bg-transparent p-0"
                >
                    <Icons.Share size={18} className="text-[#8590A6]" />
                    <span>分享</span>
                </button>

                <button
                    onClick={handleFavoriteClick}
                    disabled={isFavoriting}
                    className="flex items-center gap-1.5 text-xs md:text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors bg-transparent hover:bg-transparent p-0"
                >
                    <Icons.Favorite size={18} className="text-[#8590A6]" filled={isFavorited} />
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
